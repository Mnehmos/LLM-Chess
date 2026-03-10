import { getStockfish } from '../chess/stockfish';
import type { EvalResult } from '../chess/stockfish';
import type { PlayerConfig, TurnContext } from './types';
import type { LLMClient } from '../llm/client';
import type { ChatMessage } from '../llm/prompts';
import { buildLinePredictionPromptSection } from '../llm/prompts';
import { parseMoveResponse } from '../llm/parser';

export interface OracleAttempt {
  move: string;
  reasoning: string;
  evalCp: number;
  bestMove: string;
  round: number;
}

export interface OracleMoveResult {
  move: string;
  reasoning: string;
  responseTimeMs: number;
  attempts: OracleAttempt[];
  tokensUsed?: number;
}

/**
 * Oracle correction loop:
 * 1. LLM proposes a move
 * 2. Stockfish evaluates the position
 * 3. If the LLM's move isn't best, feed back the eval and ask again
 * 4. Repeat up to maxCorrections times
 *
 * The full correction chain is captured for training data export.
 */
export async function requestOracleMove(
  player: PlayerConfig,
  context: TurnContext,
  llm: LLMClient,
  onToken?: (text: string) => void,
): Promise<OracleMoveResult> {
  const sf = getStockfish();
  if (!sf.isReady()) await sf.init();

  const maxCorrections = player.oracleMaxCorrections || 2;
  const attempts: OracleAttempt[] = [];
  const start = Date.now();
  let totalTokens = 0;

  // Round 1: LLM proposes initial move (standard path)
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
    };
  }

  // Evaluate position at full strength
  sf.resetStrength();
  const positionEval = await sf.evaluate(context.fen, 18);

  // If the LLM already picked the best move, accept it
  if (normalizeUCI(parsed.move) === normalizeUCI(positionEval.bestMove)) {
    return {
      move: parsed.move,
      reasoning: parsed.reasoning || '',
      responseTimeMs: Date.now() - start,
      attempts,
      tokensUsed: totalTokens,
    };
  }

  // Correction loop
  for (let round = 0; round < maxCorrections; round++) {
    attempts.push({
      move: parsed!.move,
      reasoning: parsed!.reasoning || '',
      evalCp: positionEval.scoreCp,
      bestMove: positionEval.bestMove,
      round,
    });

    // Build correction prompt
    const correctionMessages = buildCorrectionPrompt(
      player, context, parsed!.move, parsed!.reasoning,
      positionEval,
    );

    // LLM tries again with Stockfish feedback
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
    parsed = parseMoveResponse(correctionResponse);

    if (!parsed) break;

    // Check if corrected move matches best
    if (normalizeUCI(parsed.move) === normalizeUCI(positionEval.bestMove)) {
      break;
    }
  }

  return {
    move: parsed?.move || '',
    reasoning: parsed?.reasoning || '',
    responseTimeMs: Date.now() - start,
    attempts,
    tokensUsed: totalTokens,
  };
}

function normalizeUCI(move: string): string {
  // Lowercase and trim for comparison
  return move.toLowerCase().trim();
}

function buildCorrectionPrompt(
  _player: PlayerConfig,
  context: TurnContext,
  proposedMove: string,
  proposedReasoning: string | undefined,
  evalResult: EvalResult,
): ChatMessage[] {
  const evalPawns = (evalResult.scoreCp / 100).toFixed(2);
  const evalSummary = evalResult.isMate && evalResult.mateIn !== null
    ? `Mate in ${Math.abs(evalResult.mateIn)} for ${evalResult.mateIn > 0 ? 'White' : 'Black'}`
    : `${evalResult.scoreCp > 0 ? '+' : ''}${evalPawns} (from White's perspective)`;

  const colorName = context.color === 'w' ? 'White' : 'Black';

  const systemPrompt = `You are a chess player with access to engine analysis. You proposed a move, but a chess engine suggests a stronger option. Review the feedback, understand what you missed, and choose your best move.

Rules:
- Respond with JSON: { "reasoning": "<your_updated_analysis>", "move": "<move_in_SAN>" }
- Use Standard Algebraic Notation (SAN)
- Your reasoning should explain what you initially missed and why the correction matters
- You may still play your original move if you believe it's correct despite the engine's suggestion
${buildLinePredictionPromptSection(_player)}`;

  const userPrompt = `Position (FEN): ${context.fen}
You are playing as: ${colorName}
Turn number: ${context.turnNumber}

Your proposed move: ${proposedMove}
${proposedReasoning ? `Your reasoning: "${proposedReasoning}"` : ''}

--- Engine Analysis ---
Position evaluation: ${evalSummary}
Engine's best move: ${evalResult.bestMove} (UCI)
Engine's best line: ${evalResult.pv}

Your move differs from the engine's recommendation. Review the analysis, explain what you missed, and choose your final move.`;

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];
}
