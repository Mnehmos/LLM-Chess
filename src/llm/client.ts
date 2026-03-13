import type { LinePredictionConfig, OutputFormat, PlayerConfig, PromptLevel, TurnContext, ReasoningOrder } from '../engine/types';
import type { ChatMessage, CommentaryContext, RetryReason } from './prompts';
import type { LLMRawResponse } from './parser';
import { OpenRouterClient } from './openrouter';
import { OpenAIClient } from './openai';
import { OpenAICodexBridgeClient } from './openai-codex-bridge';
import { OllamaClient } from './ollama';

export type LLMProvider = 'openrouter' | 'openai' | 'codex' | 'ollama';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  ollamaBaseUrl?: string;
}

export interface LLMModel {
  id: string;
  name: string;
  pricing?: { prompt: string; completion: string };
  context_length?: number;
}

export interface MoveResponseOptions {
  reasoningOrder?: ReasoningOrder;
  outputFormat?: OutputFormat;
  promptLevel?: PromptLevel;
  linePrediction?: LinePredictionConfig;
  maxTokens?: number;
  reasoningEffort?: string;
}

export type { RetryReason } from './prompts';

export interface LLMClient {
  requestMove(
    player: PlayerConfig,
    context: TurnContext,
    previousIllegalMove?: string | RetryReason,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse>;
  requestMoveRaw(
    model: string,
    messages: ChatMessage[],
    temperature: number,
    responseOptions?: MoveResponseOptions,
    onToken?: (text: string) => void,
  ): Promise<LLMRawResponse>;
  requestCommentary(
    commentatorModelId: string,
    ctx: CommentaryContext,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string>;
  requestCommentaryStream(
    commentatorModelId: string,
    ctx: CommentaryContext,
    onChunk: (partial: string) => void,
    options?: { maxTokens?: number; reasoningEffort?: string },
  ): Promise<string>;
  listModels(): Promise<LLMModel[]>;
  validateKey(): Promise<boolean>;
}

export function createLLMClient(config: LLMProviderConfig): LLMClient {
  const apiKey = (config.apiKey || '').trim();
  if (config.provider === 'ollama') {
    return new OllamaClient(config.ollamaBaseUrl);
  }
  if (config.provider === 'codex') {
    return new OpenAICodexBridgeClient();
  }
  if (config.provider === 'openai') {
    return new OpenAIClient(apiKey);
  }
  return new OpenRouterClient(apiKey);
}
