import type { PlayerConfig, TurnContext } from '../engine/types';
import type { LLMRawResponse } from './parser';
import type { ChatMessage } from './prompts';
import { buildChessPrompt, buildCommentaryPrompt, buildRetryPrompt, buildRetryPromptForReason, type CommentaryContext, type RetryReason } from './prompts';
import { buildReasoningParams, buildResponseFormat, downgradeModel, getAdaptiveMoveTokenBudget, shouldStream } from './model-capabilities';
import { PermanentAPIError, RateLimitError } from './errors';
import type { LLMModel, MoveResponseOptions } from './client';
import { StreamLoopGuard } from './stream-loop-guard';
import { extractMessageContent } from './content';

const OPENAI_BASE = 'https://api.openai.com/v1';

export interface OpenAIModel extends LLMModel {
  object?: string;
  created?: number;
  owned_by?: string;
}

export class OpenAIClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = (apiKey || '').trim();
  }

  async requestMove(
    player: PlayerConfig,
    context: TurnContext,
    previousIllegalMove?: string | RetryReason,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    const messages: ChatMessage[] = !previousIllegalMove
      ? buildChessPrompt(player, context)
      : typeof previousIllegalMove === 'string'
        ? buildRetryPrompt(player, context, previousIllegalMove)
        : buildRetryPromptForReason(player, context, previousIllegalMove);

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
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            console.warn(`[OpenAI] Rate limited (${player.model}) - retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }

      throw new Error(`[OpenAI] Rate limit persisted after 5 retries for ${player.model}`);
    };

    let result = await callWithRetry();

    if (needsOutputRecovery(result)) {
      console.warn(`[OpenAI] ${player.model} returned empty output (finish_reason=${result.finishReason}) - retrying with same reasoning profile`);

      // Structured output can sometimes fail with certain provider/model combinations.
      if (buildResponseFormat(
        player.model,
        player.outputFormat ?? player.reasoningOrder,
        player.promptLevel,
        player.linePrediction,
      )) {
        downgradeModel(player.model);
      }

      const baseBudget = getAdaptiveMoveTokenBudget(player.model, player.maxTokens, player.reasoningEffort);
      const recoveryMaxTokens = Math.max(baseBudget, Math.min(18000, Math.round(baseBudget * 1.5)));
      result = await callWithRetry({
        onToken: undefined, // use non-streaming for deterministic final content
        maxTokens: recoveryMaxTokens,
        reasoningEffort: player.reasoningEffort,
      });
    }

    if (needsOutputRecovery(result)) {
      console.warn(`[OpenAI] ${player.model} still returned empty output after recovery - final same-profile retry`);
      const baseBudget = getAdaptiveMoveTokenBudget(player.model, player.maxTokens, player.reasoningEffort);
      const finalMaxTokens = Math.max(baseBudget, Math.min(22000, baseBudget + 4000));
      result = await callWithRetry({
        onToken: undefined,
        maxTokens: finalMaxTokens,
        reasoningEffort: player.reasoningEffort,
      });
    }

    return result;
  }

  async requestMoveRaw(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    responseOptions?: MoveResponseOptions,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    let result = await this.callChat(
      model,
      messages,
      temperature,
      responseOptions,
      onToken,
      responseOptions?.maxTokens,
      responseOptions?.reasoningEffort,
    );
    if (result.finishReason === 'loop_abort') {
      console.warn(`[OpenAI] Retrying ${model} once after loop_abort`);
      result = await this.callChat(
        model,
        messages,
        temperature,
        responseOptions,
        undefined,
        responseOptions?.maxTokens,
        responseOptions?.reasoningEffort,
      );
    }
    return result;
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
      throw new PermanentAPIError(401, 'OpenAI API key is missing. Set and save a valid key first.');
    }
    const canStream = shouldStream(model);
    const isStreaming = !!onToken && canStream;
    const responseFormat = buildResponseFormat(
      model,
      responseOptions?.outputFormat ?? responseOptions?.reasoningOrder,
      responseOptions?.promptLevel,
      responseOptions?.linePrediction,
    );
    // Reasoning models (GPT-5.x, o1/o3/o4) reject temperature — only default (1) is supported.
    const effort = mapReasoningEffortFromModel(model, reasoningEffort);

    const body: Record<string, unknown> = {
      model,
      messages,
      // Chat Completions for GPT-5/Codex models prefer max_completion_tokens.
      max_completion_tokens: maxTokens || 6000,
      stream: isStreaming,
    };

    if (effort) {
      body.reasoning_effort = effort;
      body.temperature = 1; // Reasoning models only accept default temperature
    } else {
      body.temperature = temperature;
    }

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    if (isStreaming) {
      body.stream_options = { include_usage: true };
    }

    const startTime = Date.now();
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new RateLimitError(errorText);
      }
      if (response.status >= 400 && response.status < 500) {
        throw new PermanentAPIError(response.status, `OpenAI API error ${response.status}: ${errorText}`);
      }
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    if (onToken && response.body) {
      return this.readStream(response.body, model, startTime, onToken);
    }

    const headersReceivedMs = Date.now() - startTime;
    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No choices in OpenAI response');

    return {
      content: extractMessageContent(choice.message?.content),
      model: data.model || model,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      finishReason: choice.finish_reason || 'unknown',
      networkLatencyMs: headersReceivedMs,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
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
    const contentLoopGuard = new StreamLoopGuard();
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
          const deltaRaw = parsed.choices?.[0]?.delta?.content;
          const delta = extractMessageContent(deltaRaw);
          if (delta) {
            if (ttftMs === undefined) ttftMs = Date.now() - startTime;
            lastTokenMs = Date.now();
            accumulated += delta;
            onToken(accumulated);
            if (contentLoopGuard.push(delta)) {
              finishReason = 'loop_abort';
              console.warn(`[OpenAI] Aborting streamed response from ${model}: detected repetitive token loop`);
              await reader.cancel('loop_abort').catch(() => undefined);
              break;
            }
          }
          const reason = parsed.choices?.[0]?.finish_reason;
          if (reason) finishReason = reason;
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens;
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
            reasoningTokens = parsed.usage.completion_tokens_details?.reasoning_tokens;
          }
        } catch {
          // Skip malformed chunks.
        }
      }

      if (finishReason === 'loop_abort') break;
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
    const effort = mapReasoningEffortFromModel(commentatorModelId, options?.reasoningEffort);
    const body: Record<string, unknown> = {
      model: commentatorModelId,
      messages,
      max_completion_tokens: options?.maxTokens ?? (effort ? 4000 : 1000),
    };
    if (effort) {
      body.reasoning_effort = effort;
      body.temperature = 1; // Reasoning models only accept default temperature
    } else {
      body.temperature = 0.8;
    }

    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`[OpenAI] Commentary failed (${response.status}): ${errorText}`);
      return '';
    }
    const data = await response.json();
    return extractMessageContent(data.choices?.[0]?.message?.content);
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
      const effort = mapReasoningEffortFromModel(commentatorModelId, options?.reasoningEffort);
      const body: Record<string, unknown> = {
        model: commentatorModelId,
        messages,
        // Reasoning models need extra headroom for hidden thinking tokens
        max_completion_tokens: options?.maxTokens ?? (effort ? 4000 : 1000),
        stream: true,
      };
      if (effort) {
        body.reasoning_effort = effort;
        body.temperature = 1; // Reasoning models only accept default temperature
      } else {
        body.temperature = 0.8;
      }

      const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        const errorText = response.ok ? '' : await response.text().catch(() => '');
        console.warn(`[OpenAI] Commentary stream failed (${response.status}): ${errorText}`);
        return '(Commentary unavailable)';
      }

      const streamed = await this.readStream(response.body, commentatorModelId, startTime, onChunk);
      return streamed.content || '(No commentary generated)';
    } catch {
      return '(Commentary error)';
    }
  }

  async listModels(): Promise<OpenAIModel[]> {
    if (!this.apiKey) return [];
    const response = await fetch(`${OPENAI_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];
    return models
      .map((m: Record<string, unknown>) => ({
        id: String(m.id || ''),
        name: String(m.id || ''),
        object: typeof m.object === 'string' ? m.object : undefined,
        created: typeof m.created === 'number' ? m.created : undefined,
        owned_by: typeof m.owned_by === 'string' ? m.owned_by : undefined,
      }))
      .filter((m: OpenAIModel) => m.id.length > 0);
  }

  async validateKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const response = await fetch(`${OPENAI_BASE}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

function mapReasoningEffort(rawEffort: string): 'minimal' | 'low' | 'medium' | 'high' | undefined {
  switch (rawEffort.toLowerCase()) {
    case 'none':
      return 'minimal';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
      return 'high';
    default:
      return undefined;
  }
}

function mapReasoningEffortFromModel(modelId: string, effortOverride?: string): 'minimal' | 'low' | 'medium' | 'high' | undefined {
  const reasoning = buildReasoningParams(modelId, effortOverride);
  if (!reasoning || typeof reasoning !== 'object') return undefined;
  const raw = typeof (reasoning as { effort?: unknown }).effort === 'string'
    ? (reasoning as { effort: string }).effort
    : 'high';
  return mapReasoningEffort(raw);
}

function needsOutputRecovery(result: LLMRawResponse): boolean {
  const empty = result.content.trim().length === 0;
  if (!empty) return false;
  return result.finishReason === 'length' || result.finishReason === 'max_tokens' || result.finishReason === 'content_filter' || result.finishReason === 'stop';
}
