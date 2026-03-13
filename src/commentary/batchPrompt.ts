import type { ChatMessage } from '../llm/prompts';
import type { EvalResult } from '../chess/stockfish';
import type { QueuedMove } from './commentaryQueue';

const BATCH_COMMENTATOR_SYSTEM_PROMPT_BASE = `You are an expert chess commentator providing analysis of a game between AI models. Multiple moves have arrived in quick succession and you need to cover them all in one cohesive commentary.

CRITICAL — MOVE AUTHORITY:
- Every move shown to you has been VALIDATED by the chess engine. The move IS legal and DID happen.
- Do NOT question whether a move is possible or correct. Accept it as fact and analyze WHY it was played.

EVALUATION RULES:
- Stockfish eval is ALWAYS from White's perspective. Positive = White is better, negative = Black is better.
- Only flag a move as significant if the eval changes by 1.0+ pawns in the wrong direction (blunder) or right direction (brilliant).
- Do NOT exaggerate normal eval fluctuations.

ENGINE CONTEXT LIMITATION:
- You are NOT given a separate engine first choice for the side that just moved.
- The engine move shown is only the best reply from the resulting position after the played move.
- Never say a played move matched or missed the engine's first choice unless a separate pre-move alternative was explicitly provided.

BOARD ANNOTATIONS — Draw on the board with inline tags:
- [arrow e2 e4] — green arrow from e2 to e4
- [arrow e2 e4 red] — colored arrow (green, red, yellow, blue, orange, purple, white, cyan)
- [highlight d5] — highlight a square (default yellow)
- [highlight d5 red] — colored highlight
- [circle f3] — circle a square (default blue)

Use annotations to teach visually. Place tags at the END of sentences — text must read naturally if tags are removed. Tags are stripped from speech/display automatically.

NATURAL-LANGUAGE ANNOTATION SCHEMA:
- Prefer these exact forms when you want board geometry parsed from prose:
  - "queen on d2", "knight on f5"
  - "queen to d2", "bishop from c4 to d5"
  - "pressure on f7", "targeting d6", "defending f7", "covering e4", "weak square e5"
  - "line from d2 to h6", "diagonal c2 to h7", "file on e-file"
- Keep prose natural, but use this vocabulary exactly when referring to concrete squares, routes, and targets.`;

const BATCH_STYLE_RICH = `

COMMENTARY STYLE:
- Cover each move briefly, then give deeper analysis on the most interesting or critical move in the batch.
- Name openings/variations if still in book.
- Explain strategic ideas and tactical motifs.
- Use eval delta to judge move quality first. Use the resulting-position best reply only when it illuminates a concrete consequence.
- Do not frame every move as "the engine preferred..." when only the resulting-position reply is available.

FORMAT — Use rich Markdown:
- Use **bold** for key terms and player names
- Use *italics* for chess concepts
- ALWAYS write chess moves in standard algebraic notation (e.g. Nf3, Bxe5, O-O, e4) — do NOT wrap them in code backticks, bold, or other formatting. Plain SAN notation only.
- When referencing squares or pieces, use notation: "the knight on f3", "controlling d5".
- Keep it concise but educational. 3-6 sentences per move, more for critical moments.`;

const BATCH_STYLE_TTS = `

COMMENTARY STYLE — Live spoken broadcast narration:
- 2-3 sentences per move. Cover the strategic idea and key consequences.
- For the most critical move in the batch, go deeper — 3-5 sentences.
- Conversational and punchy. Natural speech rhythm.
- Narration pace controls the stream — take your time to teach.

FORMAT — Plain spoken text ONLY:
- NO markdown (no bold, italics, code blocks, blockquotes)
- ALWAYS use standard algebraic notation exactly as given (Nf3, Bxe5, O-O, e4) for the actual moves played.
- You MAY use the natural-language annotation schema for board ideas and geometry, such as "queen on d2" or "pressure on f7".
- Filler commentary handles extended analysis between your move commentaries.`;

const BATCH_VERBOSITY: Record<string, string> = {
  brief: `\n\nVERBOSITY: BRIEF — 1 sentence per move max. Hit the key idea only.`,
  standard: `\n\nVERBOSITY: STANDARD — 2-3 sentences per move. Cover the idea and one teaching point.`,
  detailed: `\n\nVERBOSITY: DETAILED — 4-6 sentences per move. Explore candidate moves, plans, and positional concepts.`,
  deep: `\n\nVERBOSITY: DEEP DIVE — Comprehensive analysis per move. Variation trees, historical parallels, endgame considerations.`,
};

function getBatchSystemPrompt(ttsMode?: boolean, verbosity?: string): string {
  const verbDir = verbosity ? (BATCH_VERBOSITY[verbosity] || '') : '';
  return BATCH_COMMENTATOR_SYSTEM_PROMPT_BASE + (ttsMode ? BATCH_STYLE_TTS : BATCH_STYLE_RICH) + verbDir;
}

function formatEvalSummary(ev: EvalResult): string {
  const evalPawns = ev.scoreCp / 100;

  let evalStr: string;
  let positionSummary: string;
  if (ev.isMate && ev.mateIn !== null) {
    evalStr = `Mate in ${Math.abs(ev.mateIn)} for ${ev.mateIn > 0 ? 'White' : 'Black'}`;
    positionSummary = 'DECISIVE — forced mate on the board';
  } else if (Math.abs(ev.scoreCp) < 30) {
    evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
    positionSummary = 'EQUAL';
  } else if (Math.abs(ev.scoreCp) < 100) {
    evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
    positionSummary = `SLIGHT EDGE for ${ev.scoreCp > 0 ? 'White' : 'Black'}`;
  } else if (Math.abs(ev.scoreCp) < 300) {
    evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
    positionSummary = `CLEAR ADVANTAGE for ${ev.scoreCp > 0 ? 'White' : 'Black'}`;
  } else {
    evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
    positionSummary = `WINNING for ${ev.scoreCp > 0 ? 'White' : 'Black'}`;
  }

  return `Eval: ${evalStr} | ${positionSummary}`;
}

function formatMoveQuality(
  ev: EvalResult,
  prevEvalCp: number | undefined,
  color: 'w' | 'b',
): string | null {
  if (prevEvalCp === undefined) return null;

  const delta = ev.scoreCp - prevEvalCp;
  const isGoodForMover = color === 'w' ? delta : -delta;
  const absDelta = Math.abs(delta);

  if (absDelta < 50) return null; // Normal, don't annotate
  if (isGoodForMover < -150) return 'BLUNDER';
  if (isGoodForMover > 150) return 'BRILLIANT';
  if (isGoodForMover < -50) return 'INACCURACY';
  return 'SOLID';
}

export function buildBatchCommentaryPrompt(
  moves: QueuedMove[],
  prevCommentary?: string,
  ttsMode?: boolean,
  systemPromptOverride?: string,
  verbosity?: string,
): ChatMessage[] {
  const parts: string[] = [];

  parts.push(`${moves.length} moves arrived in quick succession. Cover them all in one cohesive response.`);
  parts.push('');

  // List each move with compact eval info
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const colorName = m.color === 'w' ? 'White' : 'Black';
    const model = m.color === 'w' ? m.whiteModel : m.blackModel;
    const isLast = i === moves.length - 1;
    const flags = [
      m.isCapture ? 'capture' : null,
      m.isCheck ? 'check' : null,
    ].filter(Boolean).join(', ');

    parts.push(`--- Move ${m.turnNumber} ---`);
    parts.push(`${model} (${colorName}) played \`${m.move}\`${flags ? ` (${flags})` : ''}`);

    if (m.stockfishEval) {
      parts.push(formatEvalSummary(m.stockfishEval));
      const quality = formatMoveQuality(m.stockfishEval, m.prevEvalCp, m.color);
      if (quality) parts.push(`Move quality: ${quality}`);

      // Detailed analysis only for the last move in the batch
      if (isLast) {
        const nextMover = m.color === 'w' ? 'Black' : 'White';
        parts.push(`Best continuation (principal variation): ${m.stockfishEval.pv}`);
        if (m.preMoveBestMove) {
          const preMoveLabel = m.preMoveBestMoveSan ? `${m.preMoveBestMoveSan} (${m.preMoveBestMove})` : m.preMoveBestMove;
          parts.push(`Actual engine first choice from the BEFORE position: ${preMoveLabel}`);
        }
        parts.push(`Possible best reply from the resulting position: ${m.stockfishEval.bestMove} (depth ${m.stockfishEval.depth}) — this is ${nextMover}'s best response AFTER ${m.move} was played, not an alternative to it.`);
        parts.push(`Use that reply only as consequence context, not as a claim about what the mover should have played instead.`);
      }
    }

    parts.push('');
  }

  // Final position and full game context
  const lastMove = moves[moves.length - 1];
  parts.push(`Final position (FEN): ${lastMove.fen}`);
  parts.push(`Full game: ${lastMove.moveHistory.join(' ')}`);
  parts.push(`White: ${lastMove.whiteModel} | Black: ${lastMove.blackModel}`);

  // Previous commentary for continuity
  if (prevCommentary) {
    parts.push('');
    parts.push(`Your previous commentary: "${prevCommentary}"`);
    parts.push('Build on the narrative. Do not repeat yourself.');
  }

  parts.push('');
  parts.push('Provide one cohesive commentary covering all the moves above. Give each move a brief note, then focus deeper analysis on the most critical or interesting move in the batch.');

  return [
    { role: 'system', content: systemPromptOverride || getBatchSystemPrompt(ttsMode, verbosity) },
    { role: 'user', content: parts.join('\n') },
  ];
}
