import type { PlayerConfig, TurnContext } from '../engine/types';
import type { MoveResponseOptions } from './client';
import type { ChatMessage } from './prompts';
import type { LLMRawResponse } from './parser';
import { buildChessPrompt, buildRetryPrompt, buildCommentaryPrompt, type CommentaryContext } from './prompts';
import { buildResponseFormat, shouldStream, downgradeModel, buildReasoningParams, getAdaptiveMoveTokenBudget } from './model-capabilities';
import { PermanentAPIError, RateLimitError } from './errors';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
}

export class OpenRouterClient {
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = (apiKey || '').trim();
  }

  async requestMove(
    player: PlayerConfig,
    context: TurnContext,
    previousIllegalMove?: string,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    const messages: ChatMessage[] = previousIllegalMove
      ? buildRetryPrompt(player, context, previousIllegalMove)
      : buildChessPrompt(player, context);

    const callWithRetry = async (overrides?: {
      onToken?: (text: string) => void;
      maxTokens?: number;
      reasoningEffort?: string;
    }): Promise<LLMRawResponse> => {
      const nextOnToken = overrides && 'onToken' in overrides ? overrides.onToken : onToken;
      const nextReasoningEffort = overrides?.reasoningEffort ?? player.reasoningEffort;
      const nextMaxTokens = overrides?.maxTokens ?? getAdaptiveMoveTokenBudget(player.model, player.maxTokens, nextReasoningEffort);
      const MAX_RETRIES = 5;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await this.callChat(
            player.model,
            messages,
            player.temperature,
            {
              reasoningOrder: player.reasoningOrder,
              outputFormat: player.outputFormat,
              promptLevel: player.promptLevel,
              linePrediction: player.linePrediction,
            },
            nextOnToken,
            nextMaxTokens,
            nextReasoningEffort,
          );
        } catch (err) {
          if (err instanceof RateLimitError) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // 1s, 2s, 4s, 8s, 16s (capped 30s)
            console.warn(`[OpenRouter] Rate limited (${player.model}) — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
      throw new Error(`[OpenRouter] Rate limit persisted after ${MAX_RETRIES} retries for ${player.model}`);
    };

    let result = await callWithRetry();

    // Auto-downgrade: if structured output returned empty content, step down format until it works
    // json_schema → json_object → text (max 2 downgrades)
    let downgrades = 0;
    while (!result.content.trim() && buildResponseFormat(
      player.model,
      player.outputFormat ?? player.reasoningOrder,
      player.promptLevel,
      player.linePrediction,
    ) && downgrades < 2) {
      console.warn(`[OpenRouter] Empty response from ${player.model} with structured output — downgrading format`);
      downgradeModel(player.model);
      downgrades++;
      result = await callWithRetry();
    }

    if (needsOutputRecovery(result)) {
      console.warn(`[OpenRouter] ${player.model} returned empty output (finish_reason=${result.finishReason}) - retrying with same reasoning profile`);
      const baseBudget = getAdaptiveMoveTokenBudget(player.model, player.maxTokens, player.reasoningEffort);
      const recoveryMaxTokens = Math.max(baseBudget, Math.min(18000, Math.round(baseBudget * 1.5)));
      result = await callWithRetry({
        onToken: undefined,
        maxTokens: recoveryMaxTokens,
        reasoningEffort: player.reasoningEffort,
      });
    }

    return result;
  }

  /** Public chat call with custom messages (used by oracle correction loop) */
  async requestMoveRaw(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    responseOptions?: MoveResponseOptions,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    return this.callChat(model, messages, temperature, responseOptions, onToken);
  }

  private async callChat(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    responseOptions?: MoveResponseOptions,
    onToken?: (text: string) => void,
    maxTokens?: number,
    reasoningEffort?: string,
  ): Promise<LLMRawResponse> {
    if (!this.apiKey) {
      throw new PermanentAPIError(401, 'OpenRouter API key is missing. Set and save a valid key first.');
    }
    const canStream = shouldStream(model);
    const isStreaming = !!onToken && canStream;
    const responseFormat = buildResponseFormat(
      model,
      responseOptions?.outputFormat ?? responseOptions?.reasoningOrder,
      responseOptions?.promptLevel,
      responseOptions?.linePrediction,
    );
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens || 6000,
      stream: isStreaming,
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }
    const reasoning = buildReasoningParams(model, reasoningEffort);
    if (reasoning) {
      body.reasoning = reasoning;
    }
    // Request usage stats in streaming responses
    if (isStreaming) {
      body.stream_options = { include_usage: true };
    }

    const startTime = Date.now();
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'LLM Chess Benchmark',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 429 rate limit — transient, should be retried with backoff
      if (response.status === 429) {
        throw new RateLimitError(errorText);
      }
      // Other 4xx errors are permanent (model not found, auth, bad request) — don't retry
      if (response.status >= 400 && response.status < 500) {
        throw new PermanentAPIError(response.status, `OpenRouter API error ${response.status}: ${errorText}`);
      }
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    // Streaming path
    if (onToken && response.body) {
      return this.readStream(response.body, model, startTime, onToken);
    }

    // Non-streaming fallback
    const headersReceivedMs = Date.now() - startTime;
    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No choices in OpenRouter response');

    return {
      content: choice.message?.content || '',
      model: data.model || model,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      finishReason: choice.finish_reason || 'unknown',
      networkLatencyMs: headersReceivedMs,
      reasoningTokens: data.usage?.reasoning_tokens ?? data.usage?.completion_tokens_details?.reasoning_tokens,
    };
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    model: string,
    startTime: number,
    onToken: (text: string) => void,
  ): Promise<LLMRawResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';
    let finishReason = 'stop';
    let tokensUsed: number | undefined;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let ttftMs: number | undefined;
    let reasoningTokens: number | undefined;
    let lastTokenMs: number | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            if (ttftMs === undefined) ttftMs = Date.now() - startTime;
            lastTokenMs = Date.now();
            accumulated += delta;
            onToken(accumulated);
          }
          const reason = parsed.choices?.[0]?.finish_reason;
          if (reason) finishReason = reason;
          // Capture usage from final chunk (requires stream_options.include_usage)
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens;
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
            reasoningTokens = parsed.usage.reasoning_tokens ?? parsed.usage.completion_tokens_details?.reasoning_tokens;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    const streamDurationMs = (ttftMs !== undefined && lastTokenMs !== undefined)
      ? lastTokenMs - startTime - ttftMs
      : undefined;

    return {
      content: accumulated,
      model,
      responseTimeMs: Date.now() - startTime,
      tokensUsed,
      promptTokens,
      completionTokens,
      ttftMs,
      finishReason,
      networkLatencyMs: ttftMs,
      streamDurationMs,
      reasoningTokens,
    };
  }

  async requestCommentary(
    commentatorModelId: string,
    ctx: CommentaryContext,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string> {
    if (!this.apiKey) return '';
    const messages = buildCommentaryPrompt(ctx);
    const body: Record<string, unknown> = {
      model: commentatorModelId,
      messages,
      temperature: 0.8,
      max_tokens: options?.maxTokens || 1000,
    };
    const reasoning = buildReasoningParams(commentatorModelId, options?.reasoningEffort);
    if (reasoning) body.reasoning = reasoning;

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'LLM Chess Benchmark',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) return '';
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async requestCommentaryStream(
    commentatorModelId: string,
    ctx: CommentaryContext,
    onChunk: (partial: string) => void,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string> {
    if (!this.apiKey) return '(Commentary unavailable)';
    try {
      const messages = buildCommentaryPrompt(ctx);
      const startTime = Date.now();
      const body: Record<string, unknown> = {
        model: commentatorModelId,
        messages,
        temperature: 0.8,
        max_tokens: options?.maxTokens || 1000,
        stream: true,
      };
      const reasoning = buildReasoningParams(commentatorModelId, options?.reasoningEffort);
      if (reasoning) body.reasoning = reasoning;

      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'LLM Chess Benchmark',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        return '(Commentary unavailable)';
      }

      const streamed = await this.readStream(response.body, commentatorModelId, startTime, onChunk);
      if (streamed.content) return streamed.content;

      // Retry once without streaming if stream returned empty
      const retryBody = { ...body, stream: false };
      const retryResp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'LLM Chess Benchmark',
        },
        body: JSON.stringify(retryBody),
      });
      if (retryResp.ok) {
        const retryData = await retryResp.json();
        const retryContent = retryData.choices?.[0]?.message?.content;
        if (retryContent) {
          onChunk(retryContent);
          return retryContent;
        }
      }
      return '(No commentary generated)';
    } catch {
      return '(Commentary error)';
    }
  }

  async listModels(): Promise<OpenRouterModel[]> {
    if (!this.apiKey) return [];
    const response = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    return data.data || [];
  }

  async validateKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const response = await fetch(`${OPENROUTER_BASE}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}



function needsOutputRecovery(result: LLMRawResponse): boolean {
  const empty = result.content.trim().length === 0;
  if (!empty) return false;
  return result.finishReason === 'length' || result.finishReason === 'max_tokens' || result.finishReason === 'content_filter' || result.finishReason === 'stop';
}
