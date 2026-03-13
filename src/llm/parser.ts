import { z } from 'zod';
import type { MoveAttempt } from '../engine/types';

const PredictedLineSchema = z.object({
  moves: z.array(z.string()).min(1).max(32),
  summary: z.string().optional(),
});

export const ChessMoveSchema = z.object({
  move: z.string(),
  reasoning: z.string().optional(),
  revised_move: z.string().optional(),
  revision_reason: z.string().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  plan: z.string().optional(),
  threats: z.string().optional(),
  phase: z.string().optional(),
  assessment: z.string().optional(),
  notes: z.string().optional(),
  scratchpad: z.string().optional(),
  line_predictions: z.array(PredictedLineSchema).min(1).max(3).optional(),
});

export interface LLMRawResponse {
  content: string;
  reasoningTrace?: string;
  model: string;
  responseTimeMs: number;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  ttftMs?: number;             // Time to first token (streaming only)
  finishReason: string;
  // --- Taxonomy §2 extended timing decomposition ---
  networkLatencyMs?: number;   // Time from request sent to first byte received
  streamDurationMs?: number;   // Time from first token to last token (streaming only)
  reasoningTokens?: number;    // Hidden reasoning/thinking tokens (reasoning models)
}

export function parseMoveResponse(raw: LLMRawResponse): MoveAttempt | null {
  // Sanitize: extract first balanced JSON object, stripping trailing garbage
  // (handles repetition loops like }}}}}... from degenerate model output)
  const sanitized = extractFirstBalancedJson(raw.content) ?? raw.content;

  // Try JSON parse first (structured output)
  try {
    const parsed = JSON.parse(sanitized);
    const validated = ChessMoveSchema.safeParse(parsed);
    if (validated.success) {
      const initialMove = validated.data.move.trim();
      const revisedMove = validated.data.revised_move?.trim();
      return {
        move: revisedMove || initialMove,
        reasoning: validated.data.reasoning,
        initialMove,
        revisedMove,
        revisionReason: validated.data.revision_reason,
        confidence: validated.data.confidence,
        plan: validated.data.plan,
        threats: validated.data.threats,
        phase: validated.data.phase,
        assessment: validated.data.assessment,
        notes: validated.data.notes ?? validated.data.scratchpad,
        predictedLines: validated.data.line_predictions,
        raw: sanitized,
        parsedAt: Date.now(),
      };
    }
  } catch {
    // JSON parse failed, fall through to text extraction
  }

  return extractMoveFromText(raw.content);
}

/**
 * Extract the first brace-balanced JSON object from text.
 * Handles degenerate LLM output where valid JSON is followed by
 * trailing garbage (e.g., repetition loops emitting }}}}... or
 * other tokens after the closing brace).
 *
 * Respects JSON string literals (won't count braces inside quotes).
 */
function extractFirstBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // Unbalanced — try truncating at the point where depth first returns to 0
  // (shouldn't reach here if input had a valid JSON object)
  return null;
}

function extractMoveFromText(text: string): MoveAttempt | null {
  // Try to find a JSON block embedded in text (handles nested braces in reasoning)
  const jsonMatch = text.match(/\{[\s\S]*?"move"\s*:\s*"[^"]+?"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ChessMoveSchema.safeParse(parsed);
      if (validated.success) {
        const initialMove = validated.data.move.trim();
        const revisedMove = validated.data.revised_move?.trim();
        return {
          move: revisedMove || initialMove,
          reasoning: validated.data.reasoning,
          initialMove,
          revisedMove,
          revisionReason: validated.data.revision_reason,
          confidence: validated.data.confidence,
          plan: validated.data.plan,
          threats: validated.data.threats,
          phase: validated.data.phase,
          assessment: validated.data.assessment,
          notes: validated.data.notes ?? validated.data.scratchpad,
          predictedLines: validated.data.line_predictions,
          raw: text,
          parsedAt: Date.now(),
        };
      }
    } catch {
      // Fall through
    }
  }

  const patterns = [
    // Castling
    /\b(O-O-O|O-O)\b/,
    // SAN with piece prefix: Nf3, Bxe5, Qh4+, Raxd1#, etc.
    /\b([KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/,
    // Pawn moves: e4, exd5, e8=Q (require file + rank minimum)
    /\b([a-h][1-8](?:=[QRBN])?[+#]?)\b/,
    // Pawn captures: exd5, dxe4
    /\b([a-h]x[a-h][1-8](?:=[QRBN])?[+#]?)\b/,
    // UCI format: e2e4, e7e8q
    /\b([a-h][1-8][a-h][1-8][qrbn]?)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        move: match[1] || match[0],
        reasoning: undefined,
        raw: text,
        parsedAt: Date.now(),
      };
    }
  }

  return null;
}
