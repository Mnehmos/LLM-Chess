/**
 * Per-model API capability configuration.
 * Some models support json_schema (strict structured output),
 * others only json_object, and some need plain text with parsing fallback.
 */

import type { LinePredictionConfig, OutputFormat, PromptLevel } from '../engine/types';
import { normalizePromptLevel } from '../engine/types';

export type ResponseFormatMode = 'json_schema' | 'json_object' | 'text';

interface ModelCapability {
  responseFormat: ResponseFormatMode;
  supportsStreaming: boolean;
}

/**
 * Override map for models that don't support the default json_schema mode.
 * Models not listed here default to json_schema + streaming.
 */
const MODEL_OVERRIDES: Record<string, Partial<ModelCapability>> = {
  // Most modern models support json_schema through OpenRouter.
  // Add overrides here as needed for models that degrade:
  // 'some-provider/old-model': { responseFormat: 'json_object' },
  // 'some-provider/legacy-model': { responseFormat: 'text', supportsStreaming: false },
};

// Bump version when API params change (e.g. adding reasoning effort) to invalidate stale downgrades
const STORAGE_KEY = 'llm-chess-model-downgrades-v2';

/** Load persisted downgrades from localStorage. */
function loadDowngrades(): Record<string, Partial<ModelCapability>> {
  try {
    // Clean up old version keys
    localStorage.removeItem('llm-chess-model-downgrades');
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Persisted downgrades — survive page refreshes. */
const RUNTIME_DOWNGRADES: Record<string, Partial<ModelCapability>> = loadDowngrades();

/**
 * Downgrade a model's response format permanently.
 * json_schema → json_object → text. Called when a model returns empty content.
 * Persisted to localStorage so it only costs attempts once ever.
 */
export function downgradeModel(modelId: string): void {
  const current = getModelCapability(modelId);
  if (current.responseFormat === 'json_schema') {
    console.warn(`[ModelCaps] Downgrading ${modelId}: json_schema → json_object`);
    RUNTIME_DOWNGRADES[modelId] = { responseFormat: 'json_object' };
  } else if (current.responseFormat === 'json_object') {
    console.warn(`[ModelCaps] Downgrading ${modelId}: json_object → text`);
    RUNTIME_DOWNGRADES[modelId] = { responseFormat: 'text' };
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(RUNTIME_DOWNGRADES)); } catch { /* */ }
}

const DEFAULT_CAPABILITY: ModelCapability = {
  responseFormat: 'json_schema',
  supportsStreaming: true,
};

export function getModelCapability(modelId: string): ModelCapability {
  const runtime = RUNTIME_DOWNGRADES[modelId];
  const override = MODEL_OVERRIDES[modelId];
  if (!runtime && !override) return DEFAULT_CAPABILITY;
  return { ...DEFAULT_CAPABILITY, ...override, ...runtime };
}

// --- JSON Schemas per format × prompt level ---

const MOVE_SCHEMA_REASON_FIRST = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      reasoning: { type: 'string' as const, description: 'Think through the position and explain your move choice' },
      move: { type: 'string' as const, description: 'Chess move in SAN notation' },
    },
    required: ['reasoning', 'move'],
    additionalProperties: false,
  },
};

const MOVE_SCHEMA_ACT_FIRST = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      move: { type: 'string' as const, description: 'Chess move in SAN notation' },
      reasoning: { type: 'string' as const, description: 'Explain why you chose this move' },
    },
    required: ['move', 'reasoning'],
    additionalProperties: false,
  },
};

const MOVE_SCHEMA_FORMAT_C = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      move: { type: 'string' as const, description: 'Your initial move choice in SAN notation' },
      reasoning: { type: 'string' as const, description: 'Explain your analysis and move choice' },
      revised_move: { type: 'string' as const, description: 'Your final move after reconsideration (can be same as initial)' },
      revision_reason: { type: 'string' as const, description: 'Why you kept or changed your initial move' },
    },
    required: ['move', 'reasoning', 'revised_move', 'revision_reason'],
    additionalProperties: false,
  },
};

// P5 extended schemas
const MOVE_SCHEMA_P5_REASON_FIRST = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      reasoning: { type: 'string' as const, description: 'Think through the position and explain your move choice' },
      confidence: { type: 'string' as const, description: 'HIGH, MEDIUM, or LOW' },
      plan: { type: 'string' as const, description: 'Your plan for the next 2-3 moves' },
      move: { type: 'string' as const, description: 'Chess move in SAN notation' },
    },
    required: ['reasoning', 'confidence', 'plan', 'move'],
    additionalProperties: false,
  },
};

const MOVE_SCHEMA_P5_ACT_FIRST = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      move: { type: 'string' as const, description: 'Chess move in SAN notation' },
      reasoning: { type: 'string' as const, description: 'Explain why you chose this move' },
      confidence: { type: 'string' as const, description: 'HIGH, MEDIUM, or LOW' },
      plan: { type: 'string' as const, description: 'Your plan for the next 2-3 moves' },
    },
    required: ['move', 'reasoning', 'confidence', 'plan'],
    additionalProperties: false,
  },
};

// P6 extended schemas
const MOVE_SCHEMA_P6_REASON_FIRST = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      reasoning: { type: 'string' as const, description: 'Deep analysis of the position' },
      confidence: { type: 'string' as const, description: 'HIGH, MEDIUM, or LOW' },
      threats: { type: 'string' as const, description: 'Opponent threats and tactical motifs' },
      plan: { type: 'string' as const, description: 'Your plan for the next 2-3 moves' },
      phase: { type: 'string' as const, description: 'Game phase: opening, middlegame, or endgame' },
      assessment: { type: 'string' as const, description: 'Overall position assessment' },
      move: { type: 'string' as const, description: 'Chess move in SAN notation' },
    },
    required: ['reasoning', 'confidence', 'threats', 'plan', 'phase', 'assessment', 'move'],
    additionalProperties: false,
  },
};

const MOVE_SCHEMA_P6_ACT_FIRST = {
  name: 'chess_move',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      move: { type: 'string' as const, description: 'Chess move in SAN notation' },
      reasoning: { type: 'string' as const, description: 'Deep analysis of the position' },
      confidence: { type: 'string' as const, description: 'HIGH, MEDIUM, or LOW' },
      threats: { type: 'string' as const, description: 'Opponent threats and tactical motifs' },
      plan: { type: 'string' as const, description: 'Your plan for the next 2-3 moves' },
      phase: { type: 'string' as const, description: 'Game phase: opening, middlegame, or endgame' },
      assessment: { type: 'string' as const, description: 'Overall position assessment' },
    },
    required: ['move', 'reasoning', 'confidence', 'threats', 'plan', 'phase', 'assessment'],
    additionalProperties: false,
  },
};

function withLinePredictionSchema(
  baseSchema: {
    name: string;
    strict: boolean;
    schema: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };
  },
  linePrediction?: LinePredictionConfig,
) {
  if (!linePrediction?.enabled) return baseSchema;

  const predictionCount = Math.min(Math.max(linePrediction.count ?? 1, 1), 3);
  const predictionDepth = Math.max(1, Math.min(linePrediction.depth ?? 4, 16));

  return {
    ...baseSchema,
    schema: {
      ...baseSchema.schema,
      properties: {
        ...baseSchema.schema.properties,
        line_predictions: {
          type: 'array' as const,
          minItems: 1,
          maxItems: predictionCount,
          description: `Predicted continuation lines, each starting with your chosen move and extending up to ${predictionDepth} plies`,
          items: {
            type: 'object' as const,
            properties: {
              moves: {
                type: 'array' as const,
                minItems: 1,
                maxItems: predictionDepth,
                items: { type: 'string' as const },
                description: 'SAN moves in order, starting with your chosen move',
              },
              summary: {
                type: 'string' as const,
                description: 'Short summary of the idea behind the line',
              },
            },
            required: ['moves', 'summary'],
            additionalProperties: false,
          },
        },
      },
      required: [...baseSchema.schema.required, 'line_predictions'],
    },
  };
}

/** Select the appropriate JSON schema based on output format and prompt level */
function selectSchema(format: OutputFormat, promptLevel?: PromptLevel, linePrediction?: LinePredictionConfig) {
  const level = normalizePromptLevel(promptLevel);
  const isActFirst = format === 'B' || format === 'D';

  // P0 uses plain text (no schema)
  if (level === 'p0') return null;

  // Format C always uses revision schema
  if (format === 'C') return withLinePredictionSchema(MOVE_SCHEMA_FORMAT_C, linePrediction);

  // P6 extended schemas
  if (level === 'p6') {
    return withLinePredictionSchema(
      isActFirst ? MOVE_SCHEMA_P6_ACT_FIRST : MOVE_SCHEMA_P6_REASON_FIRST,
      linePrediction,
    );
  }

  // P5 extended schemas
  if (level === 'p5') {
    return withLinePredictionSchema(
      isActFirst ? MOVE_SCHEMA_P5_ACT_FIRST : MOVE_SCHEMA_P5_REASON_FIRST,
      linePrediction,
    );
  }

  // P1-P4: standard schemas
  return withLinePredictionSchema(
    isActFirst ? MOVE_SCHEMA_ACT_FIRST : MOVE_SCHEMA_REASON_FIRST,
    linePrediction,
  );
}

/**
 * Build the response_format parameter for a given model.
 * Falls back gracefully: json_schema → json_object → undefined (text).
 * Property order in the schema controls autoregressive generation order.
 *
 * Accepts either legacy ReasoningOrder or new OutputFormat + PromptLevel.
 */
export function buildResponseFormat(
  modelId: string,
  reasoningOrderOrFormat?: string,
  promptLevel?: PromptLevel,
  linePrediction?: LinePredictionConfig,
): Record<string, unknown> | undefined {
  const cap = getModelCapability(modelId);

  // Determine format: if it's A-F use it directly, otherwise map legacy
  let format: OutputFormat = 'A';
  if (reasoningOrderOrFormat && ['A', 'B', 'C', 'D', 'E', 'F'].includes(reasoningOrderOrFormat)) {
    format = reasoningOrderOrFormat as OutputFormat;
  } else if (reasoningOrderOrFormat === 'act_first') {
    format = 'B';
  }

  const schema = selectSchema(format, promptLevel, linePrediction);

  // P0 mode: no schema
  if (!schema) return undefined;

  switch (cap.responseFormat) {
    case 'json_schema':
      return {
        type: 'json_schema',
        json_schema: schema,
      };
    case 'json_object':
      return { type: 'json_object' };
    case 'text':
      return undefined;
  }
}

export function shouldStream(modelId: string): boolean {
  return getModelCapability(modelId).supportsStreaming;
}

/**
 * Known reasoning model patterns.
 * These models have internal chain-of-thought that can be very slow.
 * We cap their reasoning effort to keep response times reasonable for chess.
 */
const REASONING_MODEL_PATTERNS = [
  /\bgpt-5\b/i,          // GPT-5.x family (5.2, 5.3, 5.4)
  /\bo[134]-/i,          // o1-, o3-, o4-
  /\bdeepseek.*r1\b/i,   // DeepSeek R1/R2
  /\bdeepseek.*v3\.2\b/i, // DeepSeek V3.2 (integrated thinking)
  /\bgrok\b/i,           // Grok 4.x family
  /\bglm-5\b/i,
  /\bqwq\b/i,
  /\bkimi\b/i,           // Kimi K2/K2.5 Thinking
  /\bmagistral\b/i,      // Mistral Magistral
  /\bministral.*reason/i, // Ministral Reasoning variants
  /\bminimax.*m[12]/i,   // MiniMax M1/M2 reasoning models
];

/**
 * Build the `reasoning` parameter for OpenRouter.
 * Returns undefined for non-reasoning models (no extra params needed).
 * For reasoning models, caps effort to keep chess moves fast.
 */
/** Clear all persisted downgrades (useful when API behavior changes). */
export function resetDowngrades(): void {
  for (const key of Object.keys(RUNTIME_DOWNGRADES)) {
    delete RUNTIME_DOWNGRADES[key];
  }
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  console.info('[ModelCaps] All downgrades cleared');
}

function isGeminiReasoningModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  // OpenRouter maps these Gemini 3.1 models to Google's thinking controls via `reasoning.effort`.
  return /gemini-3\.1-pro-preview\b/.test(normalized)
    || /gemini-3\.1-flash-lite-preview\b/.test(normalized);
}

export function buildReasoningParams(modelId: string, effortOverride?: string): Record<string, unknown> | undefined {
  const isReasoning = isGeminiReasoningModel(modelId) || REASONING_MODEL_PATTERNS.some(p => p.test(modelId));
  if (!isReasoning) return undefined;
  const effort = effortOverride || 'high';
  if (effort === 'none') return undefined; // Disable reasoning entirely
  return { effort };
}

/**
 * Adaptive per-move completion budget for reasoning models.
 * Higher reasoning effort levels are given more allowance to avoid
 * spending the full budget on hidden reasoning with no visible move.
 */
export function getAdaptiveMoveTokenBudget(
  modelId: string,
  requestedMaxTokens?: number,
  effortOverride?: string,
): number {
  const requested = requestedMaxTokens ?? 6000;
  const reasoning = buildReasoningParams(modelId, effortOverride);
  if (!reasoning || typeof reasoning !== 'object') return requested;

  const effort = typeof (reasoning as { effort?: unknown }).effort === 'string'
    ? (reasoning as { effort: string }).effort
    : 'high';

  const isLargeOutputModel = /\bgpt-5(\.|-|$)/i.test(modelId) || /\bcodex\b/i.test(modelId);
  const bandByEffort: Record<string, { min: number; max: number }> = isLargeOutputModel
    ? {
        low: { min: 3000, max: 32000 },
        medium: { min: 5000, max: 64000 },
        high: { min: 7000, max: 128000 },
        xhigh: { min: 9000, max: 128000 },
      }
    : {
        low: { min: 3000, max: 6000 },
        medium: { min: 5000, max: 9000 },
        high: { min: 7000, max: 12000 },
        xhigh: { min: 9000, max: 16000 },
      };

  const band = bandByEffort[effort] ?? bandByEffort.high;
  if (requested < band.min) return band.min;
  if (requested > band.max) return band.max;
  return requested;
}
