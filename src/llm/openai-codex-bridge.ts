import type { PlayerConfig, TurnContext } from '../engine/types';
import type { LLMRawResponse } from './parser';
import type { ChatMessage, CommentaryContext } from './prompts';
import { buildChessPrompt, buildCommentaryPrompt, buildRetryPrompt } from './prompts';
import { PermanentAPIError } from './errors';
import type { MoveResponseOptions } from './client';

interface BridgeChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens?: number;
  reasoningEffort?: string;
}

interface BridgeChatResponse {
  content: string;
  model: string;
  responseTimeMs?: number;
  tokensUsed?: number;
  finishReason?: string;
}

interface BridgeHealthResponse {
  ok: boolean;
  codexAvailable: boolean;
  loggedIn?: boolean;
  version?: string;
}

export class OpenAICodexBridgeClient {
  async requestMove(
    player: PlayerConfig,
    context: TurnContext,
    previousIllegalMove?: string,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    const messages: ChatMessage[] = previousIllegalMove
      ? buildRetryPrompt(player, context, previousIllegalMove)
      : buildChessPrompt(player, context);

    const result = await this.requestBridgeChat({
      model: player.model,
      messages,
      temperature: player.temperature,
      maxTokens: player.maxTokens,
      reasoningEffort: player.reasoningEffort,
    }, onToken);

    if (!result.content.trim()) {
      throw new PermanentAPIError(500, 'Codex bridge returned empty output');
    }
    return result;
  }

  async requestMoveRaw(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    _responseOptions?: MoveResponseOptions,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    return this.requestBridgeChat({ model, messages, temperature }, onToken);
  }

  async requestCommentary(
    commentatorModelId: string,
    ctx: CommentaryContext,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string> {
    try {
      const response = await this.requestBridgeChat({
        model: commentatorModelId,
        messages: buildCommentaryPrompt(ctx),
        temperature: 0.8,
        maxTokens: options?.maxTokens,
        reasoningEffort: options?.reasoningEffort,
      });
      return response.content || '';
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
      const response = await this.requestBridgeChat({
        model: commentatorModelId,
        messages: buildCommentaryPrompt(ctx),
        temperature: 0.8,
        maxTokens: options?.maxTokens,
        reasoningEffort: options?.reasoningEffort,
      });
      const content = response.content || '';
      onChunk(content);
      return content;
    } catch {
      return '(Commentary unavailable)';
    }
  }

  async listModels(): Promise<{ id: string; name: string }[]> {
    return [];
  }

  async validateKey(): Promise<boolean> {
    try {
      const response = await fetch('/api/codex-bridge/health');
      if (response.ok) {
        const data = await response.json() as Partial<BridgeHealthResponse>;
        if (data.codexAvailable && (data.loggedIn ?? data.ok)) return true;
      }
    } catch {
      // Bridge unreachable.
    }
    return false;
  }

  private async requestBridgeChat(
    payload: BridgeChatRequest,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse> {
    const startedAt = Date.now();
    const response = await fetch('/api/codex-bridge/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new PermanentAPIError(response.status, `Codex bridge error (${response.status}): ${text || 'unknown error'}`);
    }

    const data = await response.json() as Partial<BridgeChatResponse>;
    const content = typeof data.content === 'string' ? data.content : '';
    if (onToken) onToken(content);

    return {
      content,
      model: typeof data.model === 'string' ? data.model : payload.model,
      responseTimeMs: typeof data.responseTimeMs === 'number' ? data.responseTimeMs : (Date.now() - startedAt),
      tokensUsed: typeof data.tokensUsed === 'number' ? data.tokensUsed : undefined,
      finishReason: typeof data.finishReason === 'string' ? data.finishReason : 'stop',
    };
  }
}
