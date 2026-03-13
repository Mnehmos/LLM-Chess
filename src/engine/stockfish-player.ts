import { getStockfishPlayer } from '../chess/stockfish';
import { buildStockfishStrengthProfile, MAX_STOCKFISH_ELO } from '../chess/stockfish-strength';
import type { PlayerConfig, TurnContext } from './types';

export interface StockfishMoveResult {
  move: string;           // UCI format (e.g., "e2e4")
  reasoning: string;      // Synthetic reasoning string
  responseTimeMs: number;
  evalCp: number;
}

/**
 * Request a move from Stockfish as an opponent.
 * Sets ELO cap, evaluates position, returns best move.
 */
export async function requestStockfishMove(
  player: PlayerConfig,
  context: TurnContext,
): Promise<StockfishMoveResult> {
  const sf = getStockfishPlayer();
  if (!sf.isReady()) await sf.init();

  const elo = player.stockfishElo || 2000;
  const strengthProfile = buildStockfishStrengthProfile(elo);
  const requestedDepth = player.stockfishDepth || 12;
  const depth = strengthProfile.effectiveElo === MAX_STOCKFISH_ELO
    ? Math.max(requestedDepth, 24)
    : requestedDepth;

  const start = Date.now();
  // selectMove now handles ELO cap atomically within the queue
  const result = await sf.selectMove(context.fen, elo, depth);
  const responseTimeMs = Date.now() - start;

  return {
    move: result.bestMove,
    reasoning: `Stockfish (${strengthProfile.description}, depth ${result.depth}): eval ${(result.scoreCp / 100).toFixed(2)}, line: ${result.pv}`,
    responseTimeMs,
    evalCp: result.scoreCp,
  };
}
