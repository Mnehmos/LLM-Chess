import type { LLMClient, MoveResponseOptions } from './client';
import type { LLMRawResponse } from './parser';
import type { ChatMessage } from './prompts';

export type ResilientFailureReason = 'timeout' | 'empty' | 'placeholder' | 'incomplete' | 'error';

export interface ResilientAttemptResult {
  text: string;
  thinking: string;
  raw?: LLMRawResponse;
  timedOut: boolean;
  aborted: boolean;
  error?: unknown;
}

export interface ResilientRetryContext {
  attempt: number;
  maxAttempts: number;
  reason: ResilientFailureReason;
  baseMessages: ChatMessage[];
  currentMessages: ChatMessage[];
  result: ResilientAttemptResult;
  responseOptions?: MoveResponseOptions;
  temperature: number;
}

export interface ResilientRetryPlan {
  messages?: ChatMessage[];
  responseOptions?: MoveResponseOptions;
  temperature?: number;
}

export interface ResilientTextParams {
  client: LLMClient;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  responseOptions?: MoveResponseOptions;
  onText?: (text: string) => void;
  onThinking?: (text: string) => void;
  abortSignal?: AbortSignal;
  stallTimeoutMs?: number;
  hardTimeoutMs?: number;
  maxAttempts?: number;
  classifyFailure?: (result: ResilientAttemptResult) => ResilientFailureReason | null;
  buildRetryPlan?: (ctx: ResilientRetryContext) => ResilientRetryPlan | null | undefined;
}

export interface ResilientTextResult extends ResilientAttemptResult {
  attempts: number;
  usedRecovery: boolean;
  failureReason?: ResilientFailureReason;
}

function looksLikePlaceholder(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('(Commentary unavailable)')
    || trimmed.startsWith('(Commentary error)')
    || trimmed.startsWith('(No commentary generated)')
    || trimmed.startsWith('(Intro error:')
    || trimmed.startsWith('(Recap error:')
    || trimmed.startsWith('(Filler error:')
    || trimmed.startsWith('(Commentary error:');
}

function growMaxTokens(value?: number, multiplier = 1.5): number | undefined {
  if (!value) return value;
  return Math.min(64000, Math.max(value, Math.round(value * multiplier)));
}

function normalizeReasoningEffort(raw?: string): string | undefined {
  if (!raw) return raw;
  switch (raw) {
    case 'xhigh':
    case 'high':
      return 'medium';
    case 'medium':
      return 'low';
    case 'low':
    case 'minimal':
      return 'none';
    default:
      return 'none';
  }
}

function mergeStreamText(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  return previous + incoming;
}

const MAX_THINKING_CHARS = 4000;
const THINKING_TRUNCATED_SUFFIX = '\n\n[thinking truncated]';

function mergeThinkingText(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (previous.endsWith(THINKING_TRUNCATED_SUFFIX)) return previous;
  const merged = mergeStreamText(previous, incoming);
  if (merged.length <= MAX_THINKING_CHARS) return merged;
  return merged.slice(0, MAX_THINKING_CHARS) + THINKING_TRUNCATED_SUFFIX;
}

function defaultFailureClassifier(result: ResilientAttemptResult): ResilientFailureReason | null {
  const trimmed = result.text.trim();
  if (result.aborted) return null;
  if (result.error) return 'error';
  if (result.timedOut && !shouldKeepPartialText(trimmed)) return 'timeout';
  if (!trimmed) return 'empty';
  if (looksLikePlaceholder(trimmed)) return 'placeholder';
  return null;
}

function buildContinuationMessages(baseMessages: ChatMessage[], partialText: string): ChatMessage[] {
  return [
    ...baseMessages,
    { role: 'assistant', content: partialText },
    {
      role: 'user',
      content: 'Continue exactly where you left off. Do not restart or summarize. Finish the thought with visible output immediately and keep it concise.',
    },
  ];
}

function buildVisibleOutputRecoveryMessages(baseMessages: ChatMessage[]): ChatMessage[] {
  return [
    ...baseMessages,
    {
      role: 'user',
      content: 'Your previous attempt produced no viewer-facing text. This usually means hidden reasoning or context exhaustion. Retry now with a much shorter answer. Produce visible text immediately in 1-3 short paragraphs or sentences. No preamble.',
    },
  ];
}

function defaultRetryPlan(ctx: ResilientRetryContext): ResilientRetryPlan {
  const nextOptions: MoveResponseOptions = {
    ...ctx.responseOptions,
    maxTokens: growMaxTokens(ctx.responseOptions?.maxTokens, ctx.reason === 'timeout' ? 1.25 : 1.5),
  };

  if (ctx.attempt >= 1 && nextOptions.reasoningEffort) {
    nextOptions.reasoningEffort = normalizeReasoningEffort(nextOptions.reasoningEffort);
  }

  return {
    messages: ctx.result.text.trim()
      ? buildContinuationMessages(ctx.baseMessages, ctx.result.text.trim())
      : buildVisibleOutputRecoveryMessages(ctx.baseMessages),
    responseOptions: nextOptions,
  };
}

export function shouldKeepPartialText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 24 || /[.!?]["']?$/.test(trimmed);
}

async function runSingleAttempt(params: ResilientTextParams): Promise<ResilientAttemptResult> {
  if (params.abortSignal?.aborted) {
    return { text: '', thinking: '', timedOut: false, aborted: true };
  }

  let visible = '';
  let thinking = '';
  let settled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timedOut = false;

  const clearTimers = () => {
    if (stallTimer) clearTimeout(stallTimer);
    if (hardTimer) clearTimeout(hardTimer);
    if (intervalId) clearInterval(intervalId);
  };

  const resetStallTimer = () => {
    if (!params.stallTimeoutMs) return;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      timedOut = true;
    }, params.stallTimeoutMs);
  };

  resetStallTimer();
  if (params.hardTimeoutMs) {
    hardTimer = setTimeout(() => {
      timedOut = true;
    }, params.hardTimeoutMs);
  }

  const requestPromise = params.client.requestMoveRaw(
    params.model,
    params.messages,
    params.temperature,
    params.responseOptions,
    (chunk) => {
      if (settled || params.abortSignal?.aborted || timedOut) return;
      resetStallTimer();
      if (chunk.startsWith('\u{1F9E0}')) {
        thinking = mergeThinkingText(thinking, chunk.slice(2));
        params.onThinking?.(thinking);
        return;
      }
      visible = mergeStreamText(visible, chunk);
      params.onText?.(visible);
    },
  );

  const race = await Promise.race([
    requestPromise.then((raw) => ({ kind: 'done' as const, raw })),
    new Promise<{ kind: 'timeout' }>((resolve) => {
      intervalId = setInterval(() => {
        if (params.abortSignal?.aborted) {
          clearTimers();
          resolve({ kind: 'timeout' });
          return;
        }
        if (!timedOut) return;
        clearTimers();
        resolve({ kind: 'timeout' });
      }, 100);
    }),
  ]);

  settled = true;
  clearTimers();

  if (params.abortSignal?.aborted) {
    return { text: visible.trim(), thinking: thinking.trim(), timedOut: false, aborted: true };
  }

  if (race.kind === 'timeout') {
    return {
      text: visible.trim(),
      thinking: thinking.trim(),
      timedOut: true,
      aborted: false,
    };
  }

  const raw = race.raw;
  const finalText = raw.content?.trim() ? raw.content.trim() : visible.trim();
  return {
    text: finalText,
    thinking: thinking.trim(),
    raw,
    timedOut: false,
    aborted: false,
  };
}

export async function runResilientTextGeneration(params: ResilientTextParams): Promise<ResilientTextResult> {
  const maxAttempts = Math.max(1, params.maxAttempts ?? 3);
  const classifyFailure = params.classifyFailure ?? defaultFailureClassifier;

  let currentMessages = params.messages;
  let currentOptions = params.responseOptions;
  let currentTemperature = params.temperature;
  let usedRecovery = false;
  let lastResult: ResilientAttemptResult = {
    text: '',
    thinking: '',
    timedOut: false,
    aborted: false,
  };
  let lastFailureReason: ResilientFailureReason | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      lastResult = await runSingleAttempt({
        ...params,
        messages: currentMessages,
        responseOptions: currentOptions,
        temperature: currentTemperature,
      });
    } catch (error) {
      lastResult = {
        text: '',
        thinking: '',
        timedOut: false,
        aborted: false,
        error,
      };
    }

    if (lastResult.aborted) {
      return {
        ...lastResult,
        attempts: attempt + 1,
        usedRecovery,
      };
    }

    const failureReason = classifyFailure(lastResult);
    if (!failureReason) {
      return {
        ...lastResult,
        attempts: attempt + 1,
        usedRecovery,
      };
    }

    lastFailureReason = failureReason;
    if (attempt >= maxAttempts - 1) {
      break;
    }

    usedRecovery = true;
    const plan = params.buildRetryPlan?.({
      attempt,
      maxAttempts,
      reason: failureReason,
      baseMessages: params.messages,
      currentMessages,
      result: lastResult,
      responseOptions: currentOptions,
      temperature: currentTemperature,
    }) ?? defaultRetryPlan({
      attempt,
      maxAttempts,
      reason: failureReason,
      baseMessages: params.messages,
      currentMessages,
      result: lastResult,
      responseOptions: currentOptions,
      temperature: currentTemperature,
    });

    if (!plan) {
      break;
    }

    currentMessages = plan.messages ?? currentMessages;
    currentOptions = plan.responseOptions ?? currentOptions;
    currentTemperature = plan.temperature ?? currentTemperature;
  }

  return {
    ...lastResult,
    attempts: maxAttempts,
    usedRecovery,
    failureReason: lastFailureReason,
  };
}
