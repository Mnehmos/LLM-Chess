import type { PlayerConfig, TurnContext } from '../engine/types';
import type { LLMModel, MoveResponseOptions } from './client';
import type { ChatMessage } from './prompts';
import type { LLMRawResponse } from './parser';
import { buildChessPrompt, buildRetryPrompt, buildCommentaryPrompt, type CommentaryContext } from './prompts';
import { buildResponseFormat, shouldStream, buildReasoningParams, getAdaptiveMoveTokenBudget } from './model-capabilities';

const DEFAULT_BASE_URL = 'http://localhost:11434';

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
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

    const maxTokens = getAdaptiveMoveTokenBudget(player.model, player.maxTokens, player.reasoningEffort);

    return this.callChat(
      player.model,
      messages,
      player.temperature,
      {
        reasoningOrder: player.reasoningOrder,
        outputFormat: player.outputFormat,
        promptLevel: player.promptLevel,
        linePrediction: player.linePrediction,
      },
      onToken,
      maxTokens,
      player.reasoningEffort,
    );
  }

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
    if (isStreaming) {
      body.stream_options = { include_usage: true };
    }

    const startTime = Date.now();
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${errorText}`);
    }

    if (isStreaming && response.body) {
      return this.readStream(response.body, model, startTime, onToken);
    }

    const headersReceivedMs = Date.now() - startTime;
    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No choices in Ollama response');

    return {
      content: choice.message?.content || '',
      model: data.model || model,
      responseTimeMs: Date.now() - startTime,
      tokensUsed: data.usage?.total_tokens,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      finishReason: choice.finish_reason || 'stop',
      networkLatencyMs: headersReceivedMs,
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
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens;
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
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
    };
  }

  async requestCommentary(
    commentatorModelId: string,
    ctx: CommentaryContext,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string> {
    try {
      const messages = buildCommentaryPrompt(ctx);
      const body: Record<string, unknown> = {
        model: commentatorModelId,
        messages,
        temperature: 0.8,
        max_tokens: options?.maxTokens || 1000,
      };
      const reasoning = buildReasoningParams(commentatorModelId, options?.reasoningEffort);
      if (reasoning) body.reasoning = reasoning;

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) return '';
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch {
      return '';
    }
  }

  async requestCommentaryStream(
    commentatorModelId: string,
    ctx: CommentaryContext,
    onChunk: (partial: string) => void,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string> {
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

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        return '(Commentary unavailable)';
      }

      const streamed = await this.readStream(response.body, commentatorModelId, startTime, onChunk);
      return streamed.content || '(No commentary generated)';
    } catch {
      return '(Commentary error)';
    }
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      const models = data.models || [];
      return models.map((m: { name: string; size?: number; details?: { parameter_size?: string } }) => ({
        id: m.name,
        name: m.name,
        context_length: 131072, // Ollama models typically support large context
        pricing: { prompt: '0', completion: '0' },
      }));
    } catch {
      return [];
    }
  }

  async validateKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
