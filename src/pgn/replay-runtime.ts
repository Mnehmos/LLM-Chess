import { v4 as uuid } from 'uuid';
import type { GameState, PlayerConfig, GameResult } from '../engine/types';
import type { GameEvent } from '../engine/events';
import { gameReducer } from '../engine/reducer';
import { createInitialGameState } from '../engine/types';
import { ChessBoard } from '../chess/board';
import type { GameEventListener } from '../engine/runtime';
import type { PgnGame } from './parser';
import { pgnResultToGameResult } from './parser';

// ─── Configuration ───

export interface ReplayConfig {
  game: PgnGame;
  /** Historical context injected into commentary system prompt. */
  historicalContext?: string;
  /** Delay between moves in ms (default: 800). Set 0 for instant batch. */
  moveDelayMs?: number;
  /** If true, wait for narration gate before advancing (default: true). */
  waitForNarration?: boolean;
}

// ─── ReplayRuntime ───

/**
 * Lightweight runtime that replays parsed PGN moves through the same
 * event system as GameRuntime. Emits identical GameEvent types so the
 * entire downstream pipeline (commentary, TTS, board, eval) works unchanged.
 */
export class ReplayRuntime {
  private state: GameState;
  private white: PlayerConfig;
  private black: PlayerConfig;
  private config: ReplayConfig;
  private listeners = new Set<GameEventListener>();
  private sequence = 0;
  private aborted = false;
  private paused = false;
  private pauseResolver: (() => void) | null = null;

  /** External narration gate — set by the store to await TTS completion. */
  private narrationGate: (() => Promise<void>) | null = null;

  /** External commentary gate — resolves when the given moveIndex's commentary completes. */
  private commentaryGate: ((moveIndex: number) => Promise<void>) | null = null;

  constructor(config: ReplayConfig) {
    this.config = {
      moveDelayMs: 800,
      waitForNarration: true,
      ...config,
    };

    const { game } = config;
    this.white = buildReplayPlayerConfig(game.headers.white, 'w');
    this.black = buildReplayPlayerConfig(game.headers.black, 'b');

    const gameId = uuid();
    const startingFen = game.headers.fen;
    this.state = createInitialGameState(gameId, this.white, this.black, startingFen);
  }

  // ─── Public API (matches GameRuntime interface) ───

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStream(_listener: (text: string, model: string) => void): void {
    // Replay mode does not stream model tokens.
  }

  getState(): GameState {
    return this.state;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pauseResolver?.();
    this.pauseResolver = null;
  }

  abort(reason: string): void {
    this.aborted = true;
    this.paused = false;
    this.pauseResolver?.();
    this.emit({
      type: 'GameAborted',
      payload: { reason },
    });
  }

  /** Set the narration gate callback (called by store). */
  setNarrationGate(gate: (() => Promise<void>) | null): void {
    this.narrationGate = gate;
  }

  /** Set the commentary gate callback — resolves when the given moveIndex's commentary completes. */
  setCommentaryGate(gate: ((moveIndex: number) => Promise<void>) | null): void {
    this.commentaryGate = gate;
  }

  /** Get the historical context string for commentary prompt override. */
  get historicalContext(): string | undefined {
    return this.config.historicalContext;
  }

  /** Replay all moves from the PGN. Resolves when replay completes. */
  async start(): Promise<GameState> {
    const { game } = this.config;

    // Emit lifecycle events
    this.emit({
      type: 'GameCreated',
      payload: {
        white: this.white,
        black: this.black,
        initialFen: game.headers.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    });

    this.emit({
      type: 'GameStarted',
      payload: {},
    });

    // Replay each move
    const chess = new ChessBoard(game.headers.fen);

    for (let i = 0; i < game.moves.length; i++) {
      if (this.aborted) break;

      // Handle pause
      while (this.paused && !this.aborted) {
        await new Promise<void>(resolve => { this.pauseResolver = resolve; });
      }
      if (this.aborted) break;

      const move = game.moves[i];

      // Emit TurnStarted
      this.emit({
        type: 'TurnStarted',
        payload: {
          turnNumber: move.turnNumber,
          color: move.color,
          fen: chess.fen(),
          legalMoves: chess.getLegalMoves(),
        },
      });

      // Apply move on our local board
      if (!chess.applyMove(move.san)) {
        throw new Error(`Replay move could not be applied: ${move.san}`);
      }

      // Emit MoveApplied with the same payload shape as GameRuntime
      this.emit({
        type: 'MoveApplied',
        payload: {
          color: move.color,
          san: move.san,
          from: move.from,
          to: move.to,
          fen: move.fen,
          reasoning: undefined,
          thinkingTimeMs: 0,
          attemptNumber: 1,
          isCheck: move.isCheck,
          isCheckmate: move.isCheckmate,
          isCapture: move.isCapture,
          capturedPiece: move.capturedPiece,
        },
      });

      // Pace: wait for commentary + narration to finish before next move.
      // Same as live games — the commentator/narrator drives the board.
      if (i < game.moves.length - 1 && !this.aborted) {
        // 1. Wait for this move's commentary to finish generating
        if (this.commentaryGate) {
          await this.commentaryGate(i);
        }

        // 2. Wait for TTS narration to finish playing
        if (this.config.waitForNarration && this.narrationGate && !this.aborted) {
          await this.narrationGate();
        }
      }
    }

    if (!this.aborted) {
      // Emit GameEnded
      const result = pgnResultToGameResult(game.headers.result);
      this.emit({
        type: 'GameEnded',
        payload: {
          result: result as GameResult,
          finalFen: chess.fen(),
          totalMoves: game.moves.length,
          durationMs: Date.now() - this.state.startedAt,
        },
      });
    }

    return this.state;
  }

  // ─── Stub methods for GameRuntime compatibility ───

  submitHumanMove(_move: string): void { /* no-op for replay */ }
  isWaitingForHuman(): boolean { return false; }
  getLegalMoves(): string[] { return []; }

  // ─── Private ───

  private emit(partial: Omit<GameEvent, 'eventId' | 'gameId' | 'timestamp' | 'sequence'>): void {
    const event = {
      ...partial,
      eventId: uuid(),
      gameId: this.state.gameId,
      timestamp: Date.now(),
      sequence: this.sequence++,
    } as GameEvent;

    this.state = gameReducer(this.state, event);
    for (const listener of this.listeners) {
      listener(this.state, event);
    }
  }

}

// ─── Helpers ───

function buildReplayPlayerConfig(name: string, color: 'w' | 'b'): PlayerConfig {
  return {
    id: `replay-${color}-${name}`,
    color,
    model: 'historical',
    displayName: name,
    temperature: 0,
    promptLevel: 'p1',
    outputFormat: 'A',
    maxRetries: 0,
    type: 'replay',
  };
}
