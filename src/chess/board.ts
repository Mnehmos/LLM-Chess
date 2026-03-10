import { Chess, type Move } from 'chess.js';
import type { PieceColor, GameResult } from '../engine/types';

export interface MoveValidation {
  legal: boolean;
  san?: string;
  reason?: string;
  move?: Move;
}

export class ChessBoard {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
  }

  fen(): string {
    return this.chess.fen();
  }

  pgn(): string {
    return this.chess.pgn();
  }

  turn(): PieceColor {
    return this.chess.turn() as PieceColor;
  }

  moveNumber(): number {
    return this.chess.moveNumber();
  }

  history(): string[] {
    return this.chess.history();
  }

  getLegalMoves(): string[] {
    return this.chess.moves();
  }

  getLegalMovesVerbose(): Move[] {
    return this.chess.moves({ verbose: true });
  }

  validateMove(move: string): MoveValidation {
    const testChess = new Chess(this.chess.fen());
    try {
      const result = testChess.move(move);
      if (result) {
        return { legal: true, san: result.san, move: result };
      }
      return { legal: false, reason: `"${move}" is not legal in current position` };
    } catch {
      return { legal: false, reason: `Invalid move format: "${move}"` };
    }
  }

  applyMove(san: string): Move {
    const result = this.chess.move(san);
    if (!result) throw new Error(`Failed to apply move: ${san}`);
    return result;
  }

  checkGameOver(): GameResult | null {
    if (this.chess.isCheckmate()) {
      const loser = this.chess.turn() as PieceColor;
      return { outcome: 'decisive', winner: loser === 'w' ? 'b' : 'w', reason: 'checkmate' };
    }
    if (this.chess.isStalemate()) return { outcome: 'draw', reason: 'stalemate' };
    if (this.chess.isInsufficientMaterial()) return { outcome: 'draw', reason: 'insufficient_material' };
    if (this.chess.isThreefoldRepetition()) return { outcome: 'draw', reason: 'threefold_repetition' };
    if (this.chess.isDraw()) return { outcome: 'draw', reason: 'fifty_move_rule' };
    return null;
  }

  isCheck(): boolean {
    return this.chess.isCheck();
  }

  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  board() {
    return this.chess.board();
  }

  reset(): void {
    this.chess.reset();
  }

  load(fen: string): void {
    this.chess.load(fen);
  }
}
