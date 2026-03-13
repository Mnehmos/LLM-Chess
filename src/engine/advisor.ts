import { Chess } from 'chess.js';
import { getStockfishAnalysis } from '../chess/stockfish';
import type { EvalResult } from '../chess/stockfish';
import type {
  AdvisorConfig, AdvisorVisibility, CorrectionLoopMode,
  MoveAttempt, OracleAttemptRecord, PlayerConfig, ProvenanceFrame, TurnContext,
} from './types';
import type { LLMClient } from '../llm/client';
import type { ChatMessage } from '../llm/prompts';
import { buildLinePredictionPromptSection } from '../llm/prompts';
import { parseMoveResponse } from '../llm/parser';

export interface AdvisorResult {
  /** The advisor's recommended move (SAN from Stockfish) */
  advisorMove: string;
  /** Stockfish evaluation of the position */
  eval: EvalResult;
  /** Framed recommendation text to show the model */
  framedFeedback: string;
  /** Advisor's Stockfish ELO used */
  advisorElo: number;
}

export interface AdvisorMoveResult {
  move: string;
  reasoning: string;
  responseTimeMs: number;
  attempts: OracleAttemptRecord[];
  tokensUsed?: number;
  rawContent?: string;
  parsed?: MoveAttempt | null;
  advisorMove?: string;
  advisorElo?: number;
  advisorVisibility?: AdvisorVisibility;
  advisorProvenanceFrame?: ProvenanceFrame;
  correctionLoopMode?: CorrectionLoopMode;
  correctionRounds?: number;
}

/**
 * Get the advisor's recommended move by calling Stockfish at the configured ELO/depth.
 */
export async function getAdvisorMove(
  fen: string,
  config: AdvisorConfig,
): Promise<AdvisorResult> {
  const sf = getStockfishAnalysis();
  if (!sf.isReady()) await sf.init();

  const elo = config.stockfishElo ?? 2000;
  const depth = config.stockfishDepth ?? 12;

  // Get Stockfish recommendation at configured strength
  // selectMove already resets strength atomically via postCommands — no need to call resetStrength()
  const advisorChoice = await sf.selectMove(fen, elo, depth);
  const uciMove = advisorChoice.bestMove;

  // Validate UCI move and convert to SAN using chess.js
  // Stockfish returns UCI (e.g. "e2e4"); we need SAN for display and comparison.
  // If the move is somehow illegal (stale queue, wrong position), fall back gracefully.
  const chess = new Chess(fen);
  const validated = uciMove ? chess.move(uciMove) : null;
  if (!validated) {
    const legalMoves = chess.moves();
    const fallback = legalMoves[0] ?? '';
    console.warn(`[Advisor] Stockfish returned illegal/empty UCI move "${uciMove}" for FEN: ${fen}. Falling back to "${fallback}"`);
    const advisorMove = fallback;
    const evalResult = await sf.evaluate(fen, depth);
    const framedFeedback = frameAdvisorFeedback(advisorMove, evalResult, config);
    return { advisorMove, eval: evalResult, framedFeedback, advisorElo: elo };
  }
  const advisorMove = validated.san;

  // Get evaluation at full strength for feedback
  const evalResult = await sf.evaluate(fen, depth);

  const framedFeedback = frameAdvisorFeedback(advisorMove, evalResult, config);

  return {
    advisorMove,
    eval: evalResult,
    framedFeedback,
    advisorElo: elo,
  };
}

/**
 * Frame the advisor's recommendation according to visibility and provenance settings.
 */
function frameAdvisorFeedback(
  advisorMove: string,
  evalResult: EvalResult,
  config: AdvisorConfig,
): string {
  const frame = config.provenanceFrame ?? 'F1';
  const visibility = config.visibility ?? 'labeled';
  const label = config.displayLabel;

  const evalPawns = (evalResult.scoreCp / 100).toFixed(2);
  const evalStr = evalResult.isMate && evalResult.mateIn !== null
    ? `Mate in ${Math.abs(evalResult.mateIn)}`
    : `${evalResult.scoreCp > 0 ? '+' : ''}${evalPawns}`;

  // Build source attribution based on provenance frame
  const sourceText = getProvenanceText(frame, config, label);

  // Build recommendation text based on visibility
  switch (visibility) {
    case 'labeled':
      return `${sourceText} recommends: ${advisorMove} (eval: ${evalStr}). Best line: ${evalResult.pv}`;

    case 'unlabeled':
      return `An advisor recommends: ${advisorMove} (eval: ${evalStr}).`;

    case 'mislabeled_strong':
      // Present strong advisor as weak
      return `${label || 'A beginner player'} suggests: ${advisorMove}. "I think this looks good but I'm not sure."`;

    case 'mislabeled_weak':
      // Present weak advisor as strong
      return `${label || 'A grandmaster-level engine'} recommends: ${advisorMove} (eval: ${evalStr}). Best line: ${evalResult.pv}`;

    default:
      return `Advisor recommends: ${advisorMove}`;
  }
}

/**
 * Get provenance attribution text for the given frame.
 */
function getProvenanceText(
  frame: ProvenanceFrame,
  config: AdvisorConfig,
  customLabel?: string,
): string {
  const elo = config.stockfishElo ?? 2000;

  switch (frame) {
    case 'F1': // Technical
      return `Stockfish at ${elo} ELO`;
    case 'F2': // Institutional
      return 'The FIDE analysis team';
    case 'F3': // Social warmth
      return customLabel || `Your friend Bob, a casual player (~600 ELO),`;
    case 'F4': // Antagonistic
      return 'A user who may be trying to mislead you';
    case 'F5': // Self-referential
      return 'Another instance of your model';
    case 'F6': // Anonymous authority
      return 'An anonymous grandmaster';
    default:
      return 'An advisor';
  }
}

/**
 * Run the advisor loop — generalizes the oracle correction pattern.
 *
 * Modes:
 * - off: Advisor move recorded but NOT shown to model. Model plays independently.
 * - on: Model proposes → advisor recommends (framed) → model reconsiders. Up to maxCorrections rounds.
 * - forced: Advisor's move is used directly. Model only generates reasoning.
 */
export async function runAdvisorLoop(
  player: PlayerConfig,
  context: TurnContext,
  llm: LLMClient,
  advisorConfig: AdvisorConfig,
  onToken?: (text: string) => void,
): Promise<AdvisorMoveResult> {
  const start = Date.now();
  let totalTokens = 0;
  const mode = advisorConfig.correctionLoopMode ?? 'on';
  const maxCorrections = advisorConfig.maxCorrections ?? 2;
  const attempts: OracleAttemptRecord[] = [];

  // Get advisor's recommendation
  const advisor = await getAdvisorMove(context.fen, advisorConfig);

  // Mode: forced — use advisor's move, model only reasons
  if (mode === 'forced') {
    return {
      move: advisor.advisorMove,
      reasoning: `[Advisor-forced] ${advisor.framedFeedback}`,
      responseTimeMs: Date.now() - start,
      attempts: [],
      rawContent: advisor.framedFeedback,
      parsed: {
        move: advisor.advisorMove,
        reasoning: `[Advisor-forced] ${advisor.framedFeedback}`,
        raw: advisor.framedFeedback,
        parsedAt: Date.now(),
      },
      advisorMove: advisor.advisorMove,
      advisorElo: advisor.advisorElo,
      advisorVisibility: advisorConfig.visibility,
      advisorProvenanceFrame: advisorConfig.provenanceFrame,
      correctionLoopMode: 'forced',
      correctionRounds: 0,
    };
  }

  // Round 1: LLM proposes initial move
  const initialResponse = await llm.requestMove(player, context, undefined, onToken);
  totalTokens += initialResponse.tokensUsed || 0;
  let parsed = parseMoveResponse(initialResponse);

  if (!parsed) {
    return {
      move: '',
      reasoning: 'Failed to parse initial LLM response',
      responseTimeMs: Date.now() - start,
      attempts,
      tokensUsed: totalTokens,
      rawContent: initialResponse.content,
      advisorMove: advisor.advisorMove,
      advisorElo: advisor.advisorElo,
      advisorVisibility: advisorConfig.visibility,
      advisorProvenanceFrame: advisorConfig.provenanceFrame,
      correctionLoopMode: mode,
      correctionRounds: 0,
    };
  }

  // Mode: off — record advisor move but don't show it; return LLM's independent choice
  if (mode === 'off') {
    return {
      move: parsed.move,
      reasoning: parsed.reasoning || '',
      responseTimeMs: Date.now() - start,
      attempts: [],
      tokensUsed: totalTokens,
      rawContent: initialResponse.content,
      parsed,
      advisorMove: advisor.advisorMove,
      advisorElo: advisor.advisorElo,
      advisorVisibility: advisorConfig.visibility,
      advisorProvenanceFrame: advisorConfig.provenanceFrame,
      correctionLoopMode: 'off',
      correctionRounds: 0,
    };
  }

  // Mode: on — correction loop with framed advisor feedback
  // If model already picked advisor's move, accept it
  if (normalizeMove(parsed.move) === normalizeMove(advisor.advisorMove)) {
    return {
      move: parsed.move,
      reasoning: parsed.reasoning || '',
      responseTimeMs: Date.now() - start,
      attempts,
      tokensUsed: totalTokens,
      rawContent: initialResponse.content,
      parsed,
      advisorMove: advisor.advisorMove,
      advisorElo: advisor.advisorElo,
      advisorVisibility: advisorConfig.visibility,
      advisorProvenanceFrame: advisorConfig.provenanceFrame,
      correctionLoopMode: 'on',
      correctionRounds: 0,
    };
  }

  // Correction rounds
  let correctionRounds = 0;
  let finalRawContent = initialResponse.content;
  for (let round = 0; round < maxCorrections; round++) {
    correctionRounds++;
    attempts.push({
      move: parsed!.move,
      reasoning: parsed!.reasoning || '',
      evalCp: advisor.eval.scoreCp,
      bestMove: advisor.eval.bestMove,
      round,
    });

    // Build correction prompt with framed advisor feedback
    const correctionMessages = buildAdvisorCorrectionPrompt(
      player, context, parsed!.move, parsed!.reasoning, advisor,
    );

    const correctionResponse = await llm.requestMoveRaw(
      player.model, correctionMessages, player.temperature,
      {
        reasoningOrder: player.reasoningOrder,
        outputFormat: player.outputFormat,
        promptLevel: player.promptLevel,
        linePrediction: player.linePrediction,
      },
      onToken,
    );
    totalTokens += correctionResponse.tokensUsed || 0;
    finalRawContent = correctionResponse.content;
    parsed = parseMoveResponse(correctionResponse);

    if (!parsed) break;
    if (normalizeMove(parsed.move) === normalizeMove(advisor.advisorMove)) break;
  }

  return {
    move: parsed?.move || '',
    reasoning: parsed?.reasoning || '',
    responseTimeMs: Date.now() - start,
    attempts,
    tokensUsed: totalTokens,
    rawContent: finalRawContent,
    parsed,
    advisorMove: advisor.advisorMove,
    advisorElo: advisor.advisorElo,
    advisorVisibility: advisorConfig.visibility,
    advisorProvenanceFrame: advisorConfig.provenanceFrame,
    correctionLoopMode: 'on',
    correctionRounds,
  };
}

function normalizeMove(move: string): string {
  return move.toLowerCase().trim();
}

function buildAdvisorCorrectionPrompt(
  player: PlayerConfig,
  context: TurnContext,
  proposedMove: string,
  proposedReasoning: string | undefined,
  advisor: AdvisorResult,
): ChatMessage[] {
  const colorName = context.color === 'w' ? 'White' : 'Black';

  const systemPrompt = `You are a chess player receiving advice from an advisor. You proposed a move, but the advisor suggests a different one. Review the recommendation, consider its merits, and choose your best move.

Rules:
- Respond with JSON: { "reasoning": "<your_updated_analysis>", "move": "<move_in_SAN>" }
- Use Standard Algebraic Notation (SAN)
- You may keep your original move or adopt the advisor's recommendation
- Explain your reasoning for accepting or rejecting the advice
${buildLinePredictionPromptSection(player)}`;

  const userPrompt = `Position (FEN): ${context.fen}
You are playing as: ${colorName}
Turn number: ${context.turnNumber}

Your proposed move: ${proposedMove}
${proposedReasoning ? `Your reasoning: "${proposedReasoning}"` : ''}

--- Advisor Feedback ---
${advisor.framedFeedback}

Consider the advisor's recommendation and choose your final move.`;

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];
}
