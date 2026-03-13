import { buildStockfishStrengthProfile } from './stockfish-strength';

/**
 * Browser-based Stockfish evaluation engine.
 * Loads Stockfish 18 WASM from /stockfish/ via Web Worker.
 * Provides position evaluation (centipawn score, best move, PV line).
 *
 * Features:
 * - Mutex queue: concurrent evaluate() calls are serialized, not raced
 * - Crash recovery: WASM `unreachable` traps auto-restart the worker
 * - ELO cap support for Stockfish-as-player
 */

export interface EvalResult {
  scoreCp: number;       // Centipawns from White's perspective
  isMate: boolean;       // True if mate detected
  mateIn: number | null; // Moves to mate (positive = white wins)
  bestMove: string;      // UCI format (e.g., "e2e4")
  pv: string;            // Principal variation
  depth: number;
}

const DEFAULT_INIT_TIMEOUT = 10_000;
const DEFAULT_SEARCH_TIMEOUT = 30_000;
const DEFAULT_READY_TIMEOUT = 5_000;
const MAX_RESTART_ATTEMPTS = 3;

interface QueuedEval {
  fen: string;
  depth: number;
  newGame?: boolean;            // Send ucinewgame before eval (clears hash — only for selectMove)
  preCommands?: string[];       // Commands to send before evaluate (e.g., setSkillLevel)
  postCommands?: string[];      // Commands to send after evaluate (e.g., resetStrength)
  resolve: (result: EvalResult) => void;
  reject: (err: Error) => void;
}

interface StockfishEngineOptions {
  label?: string;
  initTimeoutMs?: number;
  readyTimeoutMs?: number;
  searchTimeoutMs?: number;
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private messageHandler: ((line: string) => void) | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private crashed = false;
  private restartCount = 0;
  private readonly label: string;
  private readonly initTimeoutMs: number;
  private readonly readyTimeoutMs: number;
  private readonly searchTimeoutMs: number;

  // Mutex queue — serializes all evaluate() calls
  private queue: QueuedEval[] = [];
  private processing = false;

  constructor(options: StockfishEngineOptions = {}) {
    this.label = options.label ?? 'default';
    this.initTimeoutMs = options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT;
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT;
    this.searchTimeoutMs = options.searchTimeoutMs ?? DEFAULT_SEARCH_TIMEOUT;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.crashed = false;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.initPromise = null;
        reject(new Error(`Stockfish ${this.label} init timeout`));
      }, this.initTimeoutMs);

      try {
        this.worker = new Worker('/stockfish/stockfish-18-lite-single.js');
      } catch (err) {
        clearTimeout(timeout);
        this.initPromise = null;
        reject(new Error(`Failed to create Stockfish ${this.label} worker: ${err}`));
        return;
      }

      this.worker.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : String(e.data);

        if (!this.ready) {
          if (line.includes('uciok')) {
            this.send('setoption name Threads value 1');
            this.send('setoption name Hash value 16');
            this.send('setoption name MultiPV value 1');
            this.send('isready');
          } else if (line.includes('readyok')) {
            this.ready = true;
            this.restartCount = 0; // Successful init resets restart counter
            clearTimeout(timeout);
            resolve();
          }
        }

        this.messageHandler?.(line);
      };

      this.worker.onerror = (err) => {
        clearTimeout(timeout);
        this.initPromise = null;
        this.ready = false;
        this.crashed = true;
        console.warn(`[Stockfish:${this.label}] Worker error — marking as crashed:`, err.message);
        reject(new Error(`Stockfish ${this.label} worker error: ${err.message}`));
      };

      this.send('uci');
    });

    return this.initPromise;
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  /**
   * Restart the worker after a crash.
   * Terminates the old worker, resets state, and re-initializes.
   */
  private async restart(): Promise<void> {
    if (this.restartCount >= MAX_RESTART_ATTEMPTS) {
      throw new Error(`Stockfish ${this.label} failed after ${MAX_RESTART_ATTEMPTS} restart attempts`);
    }
    this.restartCount++;
    console.warn(`[Stockfish:${this.label}] Restarting worker (attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS})`);

    // Clean up old worker
    try {
      this.worker?.terminate();
    } catch { /* ignore */ }
    this.worker = null;
    this.ready = false;
    this.initPromise = null;
    this.messageHandler = null;
    this.crashed = false;

    await this.init();
  }

  /**
   * Queue-based evaluate. All calls go through the queue and are processed
   * one at a time to prevent messageHandler corruption.
   */
  async evaluate(fen: string, depth = 18): Promise<EvalResult> {
    return new Promise<EvalResult>((resolve, reject) => {
      this.queue.push({ fen, depth, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await this.executeEval(item);
        item.resolve(result);
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }

  /**
   * Verify the worker is alive by sending stop + isready and waiting for readyok.
   * Detects dead workers in ~5s instead of waiting for the full eval timeout.
   */
  private async waitForReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandler = null;
        this.crashed = true;
        this.ready = false;
        reject(new Error(`Stockfish ${this.label} not responding to isready`));
      }, this.readyTimeoutMs);

      this.messageHandler = (line: string) => {
        if (line.includes('readyok')) {
          clearTimeout(timeout);
          this.messageHandler = null;
          resolve();
        }
        // Ignore other messages (e.g., bestmove from a stopped search)
      };

      this.send('stop');     // Cancel any lingering search
      this.send('isready');  // Ping — worker must respond with readyok
    });
  }

  /**
   * Execute a single eval against the worker. Handles crash detection and retry.
   */
  private async executeEval(item: QueuedEval): Promise<EvalResult> {
    // Ensure ready (init or restart after crash)
    if (this.crashed || !this.ready) {
      if (this.crashed) {
        await this.restart();
      } else {
        await this.init();
      }
    }

    // Verify worker is alive before starting eval
    await this.waitForReady();

    return new Promise<EvalResult>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.messageHandler = null;
        // Timeout likely means the worker is dead — mark as crashed for auto-restart
        this.crashed = true;
        this.ready = false;
        reject(new Error(`Stockfish ${this.label} search timeout`));
      }, this.searchTimeoutMs);

      let scoreCp = 0;
      let isMate = false;
      let mateIn: number | null = null;
      let bestMove = '';
      let pv = '';
      let lastDepth = 0;

      this.messageHandler = (line: string) => {
        if (settled) return;

        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/depth (\d+)/);
          if (depthMatch) lastDepth = parseInt(depthMatch[1]);

          const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
          if (scoreMatch) {
            const type = scoreMatch[1];
            const value = parseInt(scoreMatch[2]);
            if (type === 'mate') {
              isMate = true;
              mateIn = value;
              scoreCp = value > 0 ? 100_000 - value : -100_000 - value;
            } else {
              isMate = false;
              mateIn = null;
              scoreCp = value;
            }
          }

          const pvMatch = line.match(/ pv (.+)/);
          if (pvMatch) pv = pvMatch[1];
        }

        if (line.startsWith('bestmove')) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          const moveMatch = line.match(/bestmove (\S+)/);
          if (moveMatch) bestMove = moveMatch[1];
          this.messageHandler = null;

          // Run post-commands before resolving
          if (item.postCommands) {
            for (const cmd of item.postCommands) this.send(cmd);
          }

          // Stockfish reports score from the side-to-move's perspective.
          // Normalize to always be from White's perspective.
          const isBlackToMove = item.fen.split(' ')[1] === 'b';
          const normalizedCp = isBlackToMove ? -scoreCp : scoreCp;
          const normalizedMateIn = isBlackToMove && mateIn !== null ? -mateIn : mateIn;

          resolve({ scoreCp: normalizedCp, isMate, mateIn: normalizedMateIn, bestMove, pv, depth: lastDepth });
        }
      };

      // Run pre-commands (e.g., skill level)
      if (item.preCommands) {
        for (const cmd of item.preCommands) this.send(cmd);
      }

      // Only send ucinewgame for selectMove calls (clears hash between ELO changes)
      // Regular evals skip this to preserve hash tables and reduce latency
      if (item.newGame) {
        this.send('ucinewgame');
      }
      this.send('position fen ' + item.fen);
      this.send('go depth ' + item.depth);
    });
  }

  /** Quick eval at low depth for real-time display */
  evaluateQuick(fen: string): Promise<EvalResult> {
    return this.evaluate(fen, 12);
  }

  /** Configure Stockfish for ELO-capped play */
  setSkillLevel(elo: number): void {
    const profile = buildStockfishStrengthProfile(elo);
    for (const cmd of profile.preCommands) this.send(cmd);
  }

  /** Reset to full strength (for eval after ELO-capped play) */
  resetStrength(): void {
    this.send('setoption name UCI_LimitStrength value false');
    this.send('setoption name Skill Level value 20');
  }

  /**
   * Get best move for a position (for Stockfish-as-player).
   * ELO cap commands are sent atomically within the queued eval to prevent
   * interleaving with other evaluate() calls.
   */
  async selectMove(fen: string, elo: number, depth = 12): Promise<EvalResult> {
    const profile = buildStockfishStrengthProfile(elo);
    return new Promise<EvalResult>((resolve, reject) => {
      this.queue.push({
        fen,
        depth,
        newGame: true,  // Clear hash between ELO-capped searches
        preCommands: profile.preCommands,
        postCommands: profile.postCommands,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  destroy(): void {
    this.send('quit');
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.initPromise = null;
    this.crashed = false;
    // Reject any pending queue items
    for (const item of this.queue) {
      item.reject(new Error('Stockfish engine destroyed'));
    }
    this.queue = [];
    this.processing = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

// Singleton instances — isolate gameplay, auxiliary analysis, and display eval
// so long-running advisory/oracle searches cannot starve the actual defender engine.
let gameplayInstance: StockfishEngine | null = null;
let analysisInstance: StockfishEngine | null = null;
let evalInstance: StockfishEngine | null = null;

/** Get Stockfish instance for gameplay move selection. */
export function getStockfishPlayer(): StockfishEngine {
  if (!gameplayInstance) {
    gameplayInstance = new StockfishEngine({
      label: 'player',
      searchTimeoutMs: 60_000,
    });
  }
  return gameplayInstance;
}

/** Get Stockfish instance for oracle/advisor/toolkit analysis. */
export function getStockfishAnalysis(): StockfishEngine {
  if (!analysisInstance) {
    analysisInstance = new StockfishEngine({
      label: 'analysis',
      searchTimeoutMs: 45_000,
    });
  }
  return analysisInstance;
}

/** Get separate Stockfish instance for display/analysis evals.
 *  Failures here never affect the gameplay engine. */
export function getStockfishEval(): StockfishEngine {
  if (!evalInstance) {
    evalInstance = new StockfishEngine({
      label: 'eval',
      searchTimeoutMs: 30_000,
    });
  }
  return evalInstance;
}

/** Backward-compatible alias; prefer explicit player/analysis getters. */
export function getStockfish(): StockfishEngine {
  return getStockfishPlayer();
}

/**
 * Format eval score for display.
 * Returns string like "+1.5", "-0.3", "M5", "M-3"
 */
export function formatEval(evalResult: EvalResult): string {
  if (evalResult.isMate && evalResult.mateIn !== null) {
    return evalResult.mateIn > 0 ? `M${evalResult.mateIn}` : `M${evalResult.mateIn}`;
  }
  const pawns = evalResult.scoreCp / 100;
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}
