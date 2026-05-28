import { v4 as uuid } from 'uuid';
import type {
  AdvisorConfig,
  AdvisorVisibility,
  CorrectionLoopMode,
  GameState,
  MoveRecord,
  PieceColor,
  PlayerConfig,
  PredictedLine,
  ProvenanceFrame,
  ResponseToolInvocation,
  TurnContext,
} from './types';
import type { BoardBranch } from '../episodes/types';
import type { GameEvent } from './events';
import { gameReducer } from './reducer';
import { ChessBoard } from '../chess/board';
import { createLLMClient, type LLMClient, type LLMProviderConfig, type RetryReason } from '../llm/client';
import { PermanentAPIError } from '../llm/errors';
import { parseMoveResponse } from '../llm/parser';
import { createInitialGameState } from './types';
import { requestStockfishMove } from './stockfish-player';
import { requestOracleMove } from './oracle-player';
import { ConstraintEnforcer } from './constraints';
import { runAdvisorLoop } from './advisor';
import { getImmediateActions, parseToolInvocations, processSecondOpinion } from './response-toolkit';
import { Scratchpad } from './scratchpad';
import { prepareTurn } from './turn-runtime';
import { TransitionManager } from './transitions';

export type GameEventListener = (state: GameState, event: GameEvent) => void;

export class GameRuntime {
  private state: GameState;
  private chess: ChessBoard;
  private llm: LLMClient;
  private white: PlayerConfig;
  private black: PlayerConfig;
  private listeners = new Set<GameEventListener>();
  private streamListener: ((text: string, model: string) => void) | null = null;
  private priorSanMoves: string[] = [];
  private priorMoveRecords: MoveRecord[] = [];
  private aborted = false;
  private paused = false;
  private pauseResolver: (() => void) | null = null;
  private humanMoveResolver: ((move: string) => void) | null = null;
  private waitingForHuman = false;
  private sequence = 0;
  private scratchpads: Partial<Record<PieceColor, Scratchpad>> = {};
  private pendingSecondOpinion: Partial<Record<PieceColor, string>> = {};
  private toolHistory: Partial<Record<PieceColor, ResponseToolInvocation[]>> = {};
  private fenHistory: string[] = [];
  private replayMoves: string[] = [];
  private replayMoveIndex = 0;
  private replayMoveDelayMs = 800;
  private replayResult: import('./types').GameResult | null = null;
  private replayPaceCheck: (() => Promise<void>) | null = null;
  /**
   * Branches indexed by `afterPly`. When a replay move at ply N completes,
   * we look up boardBranches[N] and execute it before continuing.
   * Empty when the episode has no branches (default).
   */
  private boardBranches: Map<number, BoardBranch> = new Map();
  /**
   * Optional hook called when a branch is about to start. The
   * commentary queue uses this to generate branch-specific narration
   * BEFORE branch moves play (so the audio leads the visuals).
   * Returns a promise that the runtime awaits before the first
   * branch move fires.
   */
  private branchNarrationHook:
    | ((branch: BoardBranch, startingFen: string) => Promise<void>)
    | null = null;
  /**
   * Optional hook called BEFORE each individual branch move plays.
   * The commentary queue uses this to generate + narrate a one-line
   * explanation of what THIS move does — so branches don't rip
   * through silently after the opening narration.
   *
   * Awaited before the move is applied; the move + delay only happen
   * once the narration audio completes.
   */
  private branchMoveNarrationHook:
    | ((params: {
        branch: BoardBranch;
        branchPly: number;
        san: string;
        color: PieceColor;
        fenBefore: string;
      }) => Promise<void>)
    | null = null;
  /**
   * Optional hook fired AFTER the branch's last move applies but BEFORE
   * the snap-back to the main line. Gives the lesson room to deliver
   * an engine-style verdict on the resulting position so the snap-back
   * doesn't feel abrupt or skip the punchline.
   */
  private branchClosingNarrationHook:
    | ((params: {
        branch: BoardBranch;
        finalFen: string;
      }) => Promise<void>)
    | null = null;

  constructor(
    white: PlayerConfig,
    black: PlayerConfig,
    llmConfig: LLMProviderConfig,
    options?: { startingFen?: string; priorMoveHistory?: MoveRecord[]; replayMoves?: string[]; replayResult?: import('./types').GameResult },
  ) {
    this.white = white;
    this.black = black;
    const gameId = uuid();
    this.state = createInitialGameState(gameId, white, black, options?.startingFen);
    this.chess = new ChessBoard(options?.startingFen);
    this.llm = createLLMClient(llmConfig);
    this.fenHistory = [this.chess.fen()];

    if (white.contextMode === 'stateless_scratchpad' && white.scratchpadConfig) {
      this.scratchpads.w = new Scratchpad(white.scratchpadConfig);
    }
    if (black.contextMode === 'stateless_scratchpad' && black.scratchpadConfig) {
      this.scratchpads.b = new Scratchpad(black.scratchpadConfig);
    }
    this.toolHistory.w = [];
    this.toolHistory.b = [];

    // Replay support: predetermined moves from PGN
    if (options?.replayMoves) {
      this.replayMoves = options.replayMoves;
    }
    if (options?.replayResult) {
      this.replayResult = options.replayResult;
    }

    // Resume support: store prior moves from an aborted game
    if (options?.priorMoveHistory?.length) {
      this.priorMoveRecords = [...options.priorMoveHistory];
      this.priorSanMoves = options.priorMoveHistory.map(m => m.move);
    }
  }

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStream(listener: (text: string, model: string) => void): void {
    this.streamListener = listener;
  }

  getState(): GameState {
    return this.state;
  }

  /** Submit a move for the human player. Only valid when waitingForHuman is true. */
  submitHumanMove(move: string): void {
    if (this.humanMoveResolver) {
      this.humanMoveResolver(move);
      this.humanMoveResolver = null;
      this.waitingForHuman = false;
    }
  }

  isWaitingForHuman(): boolean {
    return this.waitingForHuman;
  }

  /** Get legal moves for the current position (used by human player UI). */
  getLegalMoves(): string[] {
    return this.chess.getLegalMoves();
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

  /** Set the delay between replay moves in ms. */
  setReplayDelayMs(ms: number): void {
    this.replayMoveDelayMs = ms;
  }

  /**
   * Set a pace check that runs before each replay move.
   * The runtime awaits this before emitting the next move — like waiting
   * for LLM inference in tournament mode. Used to wait for commentary queue
   * to finish processing the previous move.
   */
  setReplayPaceCheck(fn: (() => Promise<void>) | null): void {
    this.replayPaceCheck = fn;
  }

  /**
   * Register board branches for the current replay. Branches fire AFTER
   * the main-line move at `afterPly` completes — runtime pauses the main
   * loop, rewinds the board to the branch's startingFen, plays each
   * branch move, then restores the main-line position before continuing.
   *
   * Branches are keyed by `afterPly`; only one branch per ply is supported
   * (later branches at the same ply overwrite earlier ones). Pass an
   * empty array to clear.
   */
  setBoardBranches(branches: BoardBranch[]): void {
    this.boardBranches = new Map(branches.map((b) => [b.afterPly, b]));
  }

  /**
   * Set the branch-narration hook. The runtime awaits this BEFORE the
   * first branch move fires, so the commentary queue can generate +
   * start narrating the branch context while the board sits on the
   * starting position. Returns a promise the runtime awaits.
   */
  setBranchNarrationHook(
    fn: ((branch: BoardBranch, startingFen: string) => Promise<void>) | null,
  ): void {
    this.branchNarrationHook = fn;
  }

  /**
   * Set the per-branch-move narration hook. The runtime awaits this
   * before applying each branch move, so each branch move gets its
   * own spoken explanation (instead of a silent pass-through after
   * the branch opening).
   */
  setBranchMoveNarrationHook(
    fn: ((params: {
      branch: BoardBranch;
      branchPly: number;
      san: string;
      color: PieceColor;
      fenBefore: string;
    }) => Promise<void>) | null,
  ): void {
    this.branchMoveNarrationHook = fn;
  }

  /**
   * Set the branch-closing narration hook. The runtime awaits this
   * after the branch's last move but before the snap-back, so the
   * lesson delivers a verdict on the resulting position.
   */
  setBranchClosingNarrationHook(
    fn: ((params: { branch: BoardBranch; finalFen: string }) => Promise<void>) | null,
  ): void {
    this.branchClosingNarrationHook = fn;
  }

  /**
   * Execute a branch: emit BranchStarted, rewind board to startingFen,
   * play each branch move (validating via chess.js, awaiting the move
   * delay between each), then emit BranchEnded and restore the main
   * line's FEN.
   *
   * The chess.js board state IS mutated during the branch (loaded to
   * startingFen, then moves applied). We save the main FEN BEFORE the
   * branch and reload AFTER, so subsequent main-line moves continue
   * from the right position.
   */
  private async executeBranch(branch: BoardBranch, mainPly: number): Promise<void> {
    if (this.aborted) return;
    const mainFenBeforeBranch = this.chess.fen();
    // Resolve startingFen: rewind to fromPly (if specified < afterPly).
    // Otherwise use the current position. fromPly is 1-indexed; index
    // into fenHistory[N] = FEN AFTER ply N (fenHistory[0] = starting).
    const fromPly = branch.fromPly ?? branch.afterPly;
    const rewindIndex = Math.max(0, Math.min(this.fenHistory.length - 1, fromPly));
    const startingFen = this.fenHistory[rewindIndex] ?? mainFenBeforeBranch;

    this.emit({
      type: 'BranchStarted',
      payload: {
        branchId: branch.id,
        fromMainPly: mainPly,
        startingFen,
        // Board renders THIS during the opening narration so the
        // viewer hears the framing on the main-line position before
        // the rewind. BranchPositionRewound (below) snaps to startingFen.
        mainLineFen: mainFenBeforeBranch,
        title: branch.title ?? '',
      },
    });

    // Opening narration plays with board still on main line —
    // context first, then the visual rewind.
    if (this.branchNarrationHook) {
      try {
        await this.branchNarrationHook(branch, startingFen);
      } catch (err) {
        console.warn('[Branch] narration hook threw — continuing:', err);
      }
    }
    if (this.aborted) return;

    // Rewind the chess.js board AND notify the UI to snap the board.
    this.chess.load(startingFen);
    this.emit({
      type: 'BranchPositionRewound',
      payload: { branchId: branch.id, startingFen },
    });

    const delay = branch.branchMoveDelayMs ?? 1800;
    const startColor = this.fenColorAt(startingFen);
    for (let i = 0; i < branch.branchMoves.length; i++) {
      if (this.aborted) break;
      const san = branch.branchMoves[i];
      const validation = this.chess.validateMove(san);
      if (!validation.legal) {
        console.warn(
          `[Branch ${branch.id}] illegal move ${san} at branch ply ${i + 1} — skipping rest of branch`,
        );
        break;
      }
      const fenBefore = this.chess.fen();
      const moveColor: PieceColor =
        i % 2 === 0 ? startColor : startColor === 'w' ? 'b' : 'w';

      // Apply the move FIRST so the board reflects what's about to
      // be narrated. This matches main-line pacing (move → engine
      // think dead air → narration). The previous "narrate first,
      // then apply" caused the board to lag the audio by a full
      // narration cycle (~15-20s).
      const moveResult = this.chess.applyMove(validation.san!);
      const isCheckmate = this.chess.isGameOver() && this.chess.fen().includes('#'); // best-effort
      this.emit({
        type: 'BranchMoveApplied',
        payload: {
          branchId: branch.id,
          branchPly: i + 1,
          color: moveColor,
          san: validation.san!,
          from: moveResult.from,
          to: moveResult.to,
          fen: this.chess.fen(),
          isCheck: this.chess.isCheck(),
          isCheckmate,
          isCapture: moveResult.captured !== undefined,
        },
      });

      // Now narrate with the board on the post-move position. The
      // narration prompt still receives fenBefore so the LLM can
      // analyze the move that was just played.
      if (this.branchMoveNarrationHook) {
        try {
          await this.branchMoveNarrationHook({
            branch,
            branchPly: i + 1,
            san: validation.san!,
            color: moveColor,
            fenBefore,
          });
        } catch (err) {
          console.warn(
            `[Branch ${branch.id}] per-move narration hook threw at ply ${i + 1} — continuing:`,
            err,
          );
        }
      }
      if (this.aborted) break;

      // Without a narration hook, fall back to the legacy fixed delay so
      // the board doesn't snap through positions instantly.
      if (
        !this.branchMoveNarrationHook &&
        i < branch.branchMoves.length - 1 &&
        !this.aborted
      ) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Deliver the closing verdict on the branch (engine read, who's
    // comfortable, the lesson takeaway) BEFORE snapping back. Without
    // this the snap-back feels abrupt and skips the punchline.
    if (!this.aborted && this.branchClosingNarrationHook) {
      try {
        await this.branchClosingNarrationHook({
          branch,
          finalFen: this.chess.fen(),
        });
      } catch (err) {
        console.warn(
          `[Branch ${branch.id}] closing narration hook threw — continuing:`,
          err,
        );
      }
    }

    // Hold the final branch position briefly so the viewer can absorb
    // the result before the snap-back. One extra delay tick.
    if (!this.aborted) await new Promise((r) => setTimeout(r, delay));

    // Restore main line.
    const resumeMainPly = branch.returnToPly ?? mainPly;
    const resumeFenIndex = Math.max(0, Math.min(this.fenHistory.length - 1, resumeMainPly));
    const resumeFen = this.fenHistory[resumeMainPly === mainPly ? this.fenHistory.length - 1 : resumeFenIndex] ?? mainFenBeforeBranch;
    this.chess.load(resumeFen);

    this.emit({
      type: 'BranchEnded',
      payload: {
        branchId: branch.id,
        resumeFen,
        resumeMainPly,
      },
    });
  }

  /** Return whose turn it is at `fen` (w or b). */
  private fenColorAt(fen: string): PieceColor {
    const parts = fen.split(' ');
    return (parts[1] as PieceColor) || 'w';
  }

  async start(): Promise<GameState> {
    this.emit({
      type: 'GameCreated',
      payload: {
        white: this.white,
        black: this.black,
        initialFen: this.chess.fen(),
        priorMoveHistory: this.priorMoveRecords.length > 0 ? [...this.priorMoveRecords] : undefined,
      },
    });

    this.emit({
      type: 'GameStarted',
      payload: {},
    });

    await this.gameLoop();
    return this.state;
  }

  private async gameLoop(): Promise<void> {
    while (this.state.status === 'in_progress' && !this.aborted) {
      if (this.paused) {
        await new Promise<void>(resolve => { this.pauseResolver = resolve; });
        if (this.aborted) break;
        continue;
      }

      const color = this.chess.turn();
      const player = color === 'w' ? this.white : this.black;
      const fen = this.chess.fen();
      const legalMoves = this.chess.getLegalMoves();
      const turnNumber = this.chess.moveNumber();

      this.emit({
        type: 'TurnStarted',
        payload: { turnNumber, color, fen, legalMoves },
      });

      const context: TurnContext = {
        turnNumber,
        color,
        fen,
        legalMoves,
        moveHistory: [...this.priorSanMoves, ...this.chess.history()],
        moveRecords: this.state.moveHistory,
        lastMove: this.state.moveHistory.length > 0
          ? this.state.moveHistory[this.state.moveHistory.length - 1].move
          : undefined,
      };
      const preparedTurn = this.preparePlayerTurn(player, context);
      const effectivePlayer = preparedTurn.player;
      const effectiveContext = preparedTurn.context;
      const effectiveAdvisor = preparedTurn.advisorConfig;

      // Emit attack transition events for any scheduled injections that fired this turn
      for (const injEvent of preparedTurn.firedInjectionEvents) {
        this.emit({
          type: 'AttackTransition',
          payload: {
            color,
            turnNumber,
            eventType: injEvent.eventType,
            description: TransitionManager.applyInjectionEvent(injEvent).description,
            details: injEvent.payload,
          },
        });
      }

      let moveApplied = false;
      let lastRetryReason: RetryReason | undefined;
      const illegalMovesAttempted: string[] = [];
      let moveAttempt = 0;
      const MAX_API_ERRORS = 3;
      let apiErrors = 0;

      // ── Stockfish direct player: retry up to 3 times on crash/timeout ──
      if (player.type === 'stockfish') {
        const MAX_SF_RETRIES = 3;
        for (let sfAttempt = 1; sfAttempt <= MAX_SF_RETRIES; sfAttempt++) {
          try {
            const sfResult = await requestStockfishMove(player, context);
            const validation = this.chess.validateMove(sfResult.move);
            if (validation.legal) {
              const moveResult = this.chess.applyMove(validation.san!);
              this.fenHistory.push(this.chess.fen());
              this.emit({
                type: 'MoveApplied',
                payload: {
                  color,
                  san: validation.san!,
                  from: moveResult.from,
                  to: moveResult.to,
                  fen: this.chess.fen(),
                  reasoning: sfResult.reasoning,
                  thinkingTimeMs: sfResult.responseTimeMs,
                  attemptNumber: sfAttempt,
                  isCheck: this.chess.isCheck(),
                  isCheckmate: false,
                  isCapture: moveResult.captured !== undefined,
                  capturedPiece: moveResult.captured,
                },
              });
              moveApplied = true;
              break;
            } else {
              console.error(`[Stockfish] Returned illegal move: ${sfResult.move}`);
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn(`[Stockfish] Move attempt ${sfAttempt}/${MAX_SF_RETRIES} failed: ${errorMsg}`);
            if (sfAttempt === MAX_SF_RETRIES) {
              this.emit({ type: 'ErrorOccurred', payload: { error: errorMsg, context: 'Stockfish move', fatal: true } });
              this.emit({ type: 'GameAborted', payload: { reason: `Stockfish error after ${MAX_SF_RETRIES} retries: ${errorMsg}` } });
              return;
            }
            // Brief pause before retry to let worker restart
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
      // ── Oracle player: LLM + Stockfish correction loop ──
      else if (player.type === 'stockfish_oracle') {
        try {
          const onToken = this.streamListener
            ? (text: string) => this.streamListener!(text, player.model)
            : undefined;
          const oracleResult = await requestOracleMove(effectivePlayer, effectiveContext, this.llm, onToken);
          if (this.streamListener) this.streamListener('', player.model);

          if (!oracleResult.move) {
            this.emit({
              type: 'IllegalMoveAttempted',
              payload: { color, attemptedMove: '<oracle_failed>', reason: 'Oracle loop failed to produce a move', attemptNumber: 1, maxAttempts: 1 },
            });
          } else {
            const validation = this.chess.validateMove(oracleResult.move);
            if (validation.legal) {
              const moveResult = this.chess.applyMove(validation.san!);
              // Build reasoning that includes correction chain
              const fullReasoning = oracleResult.attempts.length > 0
                ? `[Oracle: ${oracleResult.attempts.length} correction(s)] ${oracleResult.reasoning}`
                : oracleResult.reasoning;
              this.fenHistory.push(this.chess.fen());
              this.emit({
                type: 'MoveApplied',
                payload: {
                  color,
                  san: validation.san!,
                  from: moveResult.from,
                  to: moveResult.to,
                  fen: this.chess.fen(),
                  reasoning: fullReasoning,
                  thinkingTimeMs: oracleResult.responseTimeMs,
                  attemptNumber: 1,
                  isCheck: this.chess.isCheck(),
                  isCheckmate: false,
                  isCapture: moveResult.captured !== undefined,
                  capturedPiece: moveResult.captured,
                  oracleAttempts: oracleResult.attempts.length > 0 ? oracleResult.attempts : undefined,
                  outputFormat: effectivePlayer.outputFormat,
                  benchmarkFraming: preparedTurn.benchmarkFraming,
                  fogVisibilityMode: preparedTurn.fogVisibilityMode,
                  scratchpadState: this.scratchpads[color]?.read(),
                  attackActive: preparedTurn.activeAttacks.length > 0,
                  activeAttackVectors: preparedTurn.activeAttacks.length > 0
                    ? preparedTurn.activeAttacks.map(a => ({ channel: a.channel, vectorId: a.vectorId }))
                    : undefined,
                  attackPattern: player.transition?.attackPattern,
                  attackTiming: player.transition?.attackTiming,
                  attackIntensity: preparedTurn.activeAttacks.length > 0
                    ? (preparedTurn.activeAttacks[0].params._intensity as number | undefined)
                    : undefined,
                },
              });
              moveApplied = true;
            } else {
              // Oracle returned an illegal move — fall through to no-move-applied
              console.warn(`[Oracle] Returned illegal move: ${oracleResult.move}`);
            }
          }
        } catch (err) {
          if (err instanceof PermanentAPIError) {
            const errorMsg = err.message;
            this.emit({ type: 'ErrorOccurred', payload: { error: errorMsg, context: 'Oracle LLM call', fatal: true } });
            this.emit({ type: 'GameAborted', payload: { reason: `${player.model}: ${errorMsg}` } });
            return;
          }
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.emit({ type: 'ErrorOccurred', payload: { error: errorMsg, context: 'Oracle move', fatal: true } });
          this.emit({ type: 'GameAborted', payload: { reason: `Oracle error: ${errorMsg}` } });
          return;
        }
      }
      // ── Replay player: predetermined PGN moves ──
      // Works exactly like tournament mode — moves fire with a simple delay,
      // commentary + TTS run async in the background at their own pace.
      else if (player.type === 'replay') {
        if (this.replayMoveIndex < this.replayMoves.length) {
          if (this.replayPaceCheck && this.replayMoveIndex > 0 && !this.aborted) {
            await this.replayPaceCheck();
          }
          // Simple delay between moves — like LLM think time in tournament mode
          if (this.replayMoveIndex > 0 && this.replayMoveDelayMs > 0 && !this.aborted) {
            await new Promise(r => setTimeout(r, this.replayMoveDelayMs));
          }
          if (this.aborted) break;

          const replaySan = this.replayMoves[this.replayMoveIndex];
          const validation = this.chess.validateMove(replaySan);
          if (validation.legal) {
            const moveResult = this.chess.applyMove(validation.san!);
            this.fenHistory.push(this.chess.fen());
            this.emit({
              type: 'MoveApplied',
              payload: {
                color,
                san: validation.san!,
                from: moveResult.from,
                to: moveResult.to,
                fen: this.chess.fen(),
                reasoning: undefined,
                thinkingTimeMs: 0,
                attemptNumber: 1,
                isCheck: this.chess.isCheck(),
                isCheckmate: false,
                isCapture: moveResult.captured !== undefined,
                capturedPiece: moveResult.captured,
              },
            });
            moveApplied = true;
            this.replayMoveIndex++;

            // Branch director: check whether a board branch is
            // scheduled to fire AFTER this just-played main-line ply.
            // The ply count includes priorMoveHistory + replayMoveIndex
            // because both contribute to the canonical episode ply.
            const mainPly = this.priorSanMoves.length + this.replayMoveIndex;
            const branch = this.boardBranches.get(mainPly);
            if (branch && !this.aborted) {
              await this.executeBranch(branch, mainPly);
            }
          } else {
            console.error(`[Replay] PGN move illegal: ${replaySan} at index ${this.replayMoveIndex}`);
            this.replayMoveIndex++;
            // Skip illegal PGN moves — shouldn't happen with valid PGN
          }
        } else {
          // All PGN moves exhausted — end the game with the PGN result
          const result = this.replayResult || { outcome: 'draw' as const, reason: 'stalemate' as const };
          this.emit({
            type: 'GameEnded',
            payload: {
              result,
              finalFen: this.chess.fen(),
              totalMoves: this.state.moveHistory.length,
              durationMs: Date.now() - this.state.startedAt,
            },
          });
          return;
        }
      }
      // ── Human player: wait for typed move input ──
      else if (player.type === 'human') {
        const MAX_HUMAN_ATTEMPTS = 10;
        let humanAttempt = 0;
        while (!this.aborted && humanAttempt < MAX_HUMAN_ATTEMPTS) {
          humanAttempt++;
          this.waitingForHuman = true;
          const humanMove = await new Promise<string>(resolve => {
            this.humanMoveResolver = resolve;
          });
          if (this.aborted) break;

          // Check for resignation
          if (humanMove.toLowerCase() === 'resign') {
            this.emit({
              type: 'GameEnded',
              payload: {
                result: { outcome: 'decisive', winner: color === 'w' ? 'b' : 'w', reason: 'resignation' },
                finalFen: this.chess.fen(),
                totalMoves: this.state.moveHistory.length,
                durationMs: Date.now() - this.state.startedAt,
              },
            });
            return;
          }

          const validation = this.chess.validateMove(humanMove);
          if (!validation.legal) {
            this.emit({
              type: 'IllegalMoveAttempted',
              payload: {
                color,
                attemptedMove: humanMove,
                reason: validation.reason || 'Illegal move',
                attemptNumber: humanAttempt,
                maxAttempts: MAX_HUMAN_ATTEMPTS,
              },
            });
            continue;
          }

          const moveResult = this.chess.applyMove(validation.san!);
          this.fenHistory.push(this.chess.fen());
          this.emit({
            type: 'MoveApplied',
            payload: {
              color,
              san: validation.san!,
              from: moveResult.from,
              to: moveResult.to,
              fen: this.chess.fen(),
              reasoning: 'Human move',
              thinkingTimeMs: 0,
              attemptNumber: humanAttempt,
              isCheck: this.chess.isCheck(),
              isCheckmate: false,
              isCapture: moveResult.captured !== undefined,
              capturedPiece: moveResult.captured,
            },
          });
          moveApplied = true;
          break;
        }
      }
      // ── Standard LLM player ──
      else { while (!this.aborted) {
        if (this.aborted) return;
        moveAttempt++;

        this.emit({
          type: 'LLMPrompted',
          payload: {
            color,
            model: effectivePlayer.model,
            fen: effectiveContext.fen,
            legalMoveCount: effectiveContext.legalMoves.length,
          },
        });

        let decision: Awaited<ReturnType<GameRuntime['requestLlmDecision']>>;

        try {
          decision = await this.requestLlmDecision(
            effectivePlayer,
            effectiveContext,
            color,
            lastRetryReason,
            effectiveAdvisor,
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          // Permanent errors (404 model not found, 401 auth) — abort immediately
          if (err instanceof PermanentAPIError) {
            this.emit({
              type: 'ErrorOccurred',
              payload: { error: errorMsg, context: 'LLM API call', fatal: true },
            });
            this.emit({
              type: 'GameAborted',
              payload: { reason: `${effectivePlayer.model}: ${errorMsg}` },
            });
            return;
          }

          apiErrors++;
          this.emit({
            type: 'ErrorOccurred',
            payload: { error: errorMsg, context: 'LLM API call', fatal: apiErrors >= MAX_API_ERRORS },
          });

          if (apiErrors >= MAX_API_ERRORS) {
            // API is broken — abort the game, don't award a win
            this.emit({
              type: 'GameAborted',
              payload: { reason: `API error for ${effectivePlayer.model} after ${apiErrors} attempts: ${errorMsg}` },
            });
            return;
          }
          // Don't count API errors against move retries — retry the same attempt
          moveAttempt--;
          // Brief delay before API retry
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        // Reset API error counter on successful call
        apiErrors = 0;

        this.emit({
          type: 'LLMResponded',
          payload: {
            color,
            model: effectivePlayer.model,
            responseTimeMs: decision.responseTimeMs,
            raw: decision.rawContent,
            parsed: decision.parsed,
            tokensUsed: decision.totalTokens,
          },
        });

        await this.processToolActions(color, effectiveContext, decision.toolInvocations);

        if (decision.declaredCompromised) {
          this.emit({
            type: 'GameEnded',
            payload: {
              result: { outcome: 'decisive', winner: color, reason: 'declared_compromised' },
              finalFen: this.chess.fen(),
              totalMoves: this.state.moveHistory.length,
              durationMs: Date.now() - this.state.startedAt,
              attackContext: preparedTurn.activeAttacks.length > 0
                ? {
                    activeVectors: preparedTurn.activeAttacks.map(a => ({ channel: a.channel, vectorId: a.vectorId })),
                    timing: player.transition?.attackTiming ?? null,
                    pattern: player.transition?.attackPattern ?? null,
                  }
                : undefined,
            },
          });
          return;
        }

        if (decision.moveSource === 'forfeit') {
          this.emit({
            type: 'GameEnded',
            payload: {
              result: { outcome: 'decisive', winner: color === 'w' ? 'b' : 'w', reason: 'timeout' },
              finalFen: this.chess.fen(),
              totalMoves: this.state.moveHistory.length,
              durationMs: Date.now() - this.state.startedAt,
            },
          });
          return;
        }

        const parsed = decision.parsed;

        console.log(`[Turn ${turnNumber}] ${color} (${effectivePlayer.model}) attempt ${moveAttempt}:`,
          `\n  Raw: ${decision.rawContent.slice(0, 200)}`,
          `\n  Parsed: ${parsed ? parsed.move : '<FAILED>'}`,
          `\n  FEN: ${this.chess.fen()}`,
          `\n  Legal moves: ${this.chess.getLegalMoves().join(', ')}`);

        // Check for resignation
        if (parsed && parsed.move.toLowerCase() === 'resign') {
          this.emit({
            type: 'GameEnded',
            payload: {
              result: { outcome: 'decisive', winner: color === 'w' ? 'b' : 'w', reason: 'resignation' },
              finalFen: this.chess.fen(),
              totalMoves: this.state.moveHistory.length,
              durationMs: Date.now() - this.state.startedAt,
            },
          });
          return;
        }

        if (!parsed) {
          this.emit({
            type: 'IllegalMoveAttempted',
            payload: {
              color,
              attemptedMove: '<unparseable>',
              reason: 'Failed to parse LLM response',
              attemptNumber: moveAttempt,
              maxAttempts: effectivePlayer.maxRetries,
            },
          });
          lastRetryReason = decision.rawContent.trim()
            ? { kind: 'parse_error' }
            : { kind: 'empty' };
          continue;
        }

        const validation = this.chess.validateMove(parsed.move);
        if (!validation.legal) {
          console.warn(`[Turn ${turnNumber}] ILLEGAL: "${parsed.move}" — ${validation.reason}`);
        }

        this.emit({
          type: 'MoveValidated',
          payload: {
            color,
            attemptedMove: parsed.move,
            isLegal: validation.legal,
            san: validation.san,
            attemptNumber: moveAttempt,
          },
        });

        if (!validation.legal) {
          this.emit({
            type: 'IllegalMoveAttempted',
            payload: {
              color,
              attemptedMove: parsed.move,
              reason: validation.reason || 'Illegal move',
              attemptNumber: moveAttempt,
              maxAttempts: effectivePlayer.maxRetries,
            },
          });
          illegalMovesAttempted.push(parsed.move);
          lastRetryReason = { kind: 'illegal', move: parsed.move };
          continue;
        }

        const moveResult = this.chess.applyMove(validation.san!);
        const newFen = this.chess.fen();
        const didRevise = !!parsed.revisedMove
          && !!parsed.initialMove
          && parsed.revisedMove.trim() !== parsed.initialMove.trim();

        this.fenHistory.push(newFen);
        this.emit({
          type: 'MoveApplied',
          payload: {
            color,
            san: validation.san!,
            from: moveResult.from,
            to: moveResult.to,
            fen: newFen,
            reasoning: parsed.reasoning,
            reasoningTrace: decision.reasoningTrace,
            thinkingTimeMs: decision.responseTimeMs,
            attemptNumber: moveAttempt,
            isCheck: this.chess.isCheck(),
            isCheckmate: false,
            isCapture: moveResult.captured !== undefined,
            capturedPiece: moveResult.captured,
            outputFormat: effectivePlayer.outputFormat,
            confidence: parsed.confidence,
            plan: parsed.plan,
            threats: parsed.threats,
            phase: parsed.phase,
            assessment: parsed.assessment,
            initialMove: parsed.initialMove,
            revisedMove: parsed.revisedMove,
            revisionReason: parsed.revisionReason,
            didRevise,
            advisorMove: decision.advisorMove,
            advisorInfo: decision.advisorInfo,
            predictedLines: parsed.predictedLines ?? decision.predictedLines,
            promptTokens: decision.promptTokens,
            completionTokens: decision.completionTokens,
            ttftMs: decision.ttftMs,
            wallClockMs: decision.responseTimeMs,
            networkLatencyMs: decision.networkLatencyMs,
            streamDurationMs: decision.streamDurationMs,
            reasoningTokens: decision.reasoningTokens,
            totalTokens: decision.totalTokens,
            tokensPerSecond: (decision.completionTokens && decision.streamDurationMs && decision.streamDurationMs > 0)
              ? decision.completionTokens / (decision.streamDurationMs / 1000)
              : undefined,
            moveSource: decision.moveSource,
            constraintViolation: decision.constraintViolation,
            advisorElo: decision.advisorElo,
            advisorVisibility: decision.advisorVisibility,
            advisorProvenanceFrame: decision.advisorProvenanceFrame,
            correctionLoopMode: decision.correctionLoopMode,
            correctionRounds: decision.correctionRounds,
            fogVisibilityMode: preparedTurn.fogVisibilityMode,
            toolInvocations: decision.toolInvocations,
            scratchpadState: decision.scratchpadState,
            benchmarkFraming: preparedTurn.benchmarkFraming,
            illegalMovesAttempted: illegalMovesAttempted.length > 0 ? illegalMovesAttempted : undefined,
            attackActive: preparedTurn.activeAttacks.length > 0,
            activeAttackVectors: preparedTurn.activeAttacks.length > 0
              ? preparedTurn.activeAttacks.map(a => ({ channel: a.channel, vectorId: a.vectorId }))
              : undefined,
            attackPattern: player.transition?.attackPattern,
            attackTiming: player.transition?.attackTiming,
            attackIntensity: preparedTurn.activeAttacks.length > 0
              ? (preparedTurn.activeAttacks[0].params._intensity as number | undefined)
              : undefined,
          },
        });

        moveApplied = true;
        break;
      }
      } // end standard LLM player

      if (!moveApplied) {
        // Game was aborted during move attempts
        return;
      }

      // Check game over
      const gameOver = this.chess.checkGameOver();
      if (gameOver) {
        this.emit({
          type: 'GameEnded',
          payload: {
            result: gameOver,
            finalFen: this.chess.fen(),
            totalMoves: this.state.moveHistory.length,
            durationMs: Date.now() - this.state.startedAt,
          },
        });
        return;
      }
    }
  }

  private preparePlayerTurn(player: PlayerConfig, context: TurnContext) {
    const prepared = prepareTurn(player, context, {
      scratchpad: this.scratchpads[context.color],
      pendingSecondOpinion: this.pendingSecondOpinion[context.color],
      priorFens: this.fenHistory,
      toolHistory: this.toolHistory[context.color] ?? [],
    });

    delete this.pendingSecondOpinion[context.color];
    return prepared;
  }

  private async requestLlmDecision(
    player: PlayerConfig,
    context: TurnContext,
    color: PieceColor,
    previousIllegalMove?: RetryReason,
    advisorConfig?: AdvisorConfig,
  ): Promise<{
    parsed: ReturnType<typeof parseMoveResponse> | null;
    rawContent: string;
    reasoningTrace?: string;
    responseTimeMs: number;
    promptTokens?: number;
    completionTokens?: number;
    ttftMs?: number;
    networkLatencyMs?: number;
    streamDurationMs?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    moveSource: 'llm' | 'random_legal' | 'best_effort' | 'forfeit' | 'advisor_forced';
    constraintViolation?: string;
    advisorMove?: string;
    advisorInfo?: string;
    predictedLines?: PredictedLine[];
    advisorElo?: number;
    advisorVisibility?: AdvisorVisibility;
    advisorProvenanceFrame?: ProvenanceFrame;
    correctionLoopMode?: CorrectionLoopMode;
    correctionRounds?: number;
    toolInvocations?: ResponseToolInvocation[];
    scratchpadState?: string;
    declaredCompromised?: string;
  }> {
    let streamed = '';
    const requestStartedAt = Date.now();
    const onToken = this.streamListener
      ? (text: string) => {
          streamed = text;
          this.streamListener!(text, player.model);
        }
      : undefined;

    const wallClockLimit = ConstraintEnforcer.getEffectiveWallClockLimit(player.constraints);
    const timeoutBehavior = player.constraints?.timeoutBehavior ?? 'best_effort';

    if (advisorConfig) {
      const advisorRequest = runAdvisorLoop(player, context, this.llm, advisorConfig, onToken);
      const requestResult = wallClockLimit
        ? await ConstraintEnforcer.enforceWallClock(
            advisorRequest,
            wallClockLimit,
            timeoutBehavior,
            context.legalMoves,
            () => streamed,
          )
        : { timedOut: false as const, result: await advisorRequest };

      if (requestResult.timedOut) {
        const forcedMove = requestResult.move;
        const parsed = forcedMove
          ? {
              move: forcedMove,
              raw: forcedMove,
              parsedAt: Date.now(),
            }
          : null;
        if (this.streamListener) {
          this.streamListener('', player.model);
        }
        return {
          parsed,
          rawContent: forcedMove ?? '',
          reasoningTrace: undefined,
          responseTimeMs: wallClockLimit ?? 0,
          moveSource: requestResult.moveSource,
          constraintViolation: requestResult.violation,
        };
      }

      const advisorResult = requestResult.result;
      const rawContent = advisorResult.rawContent ?? '';
      const toolInvocations = rawContent
        ? parseToolInvocations(rawContent, context.turnNumber)
        : [];
      const notes = rawContent && this.scratchpads[color]
        ? Scratchpad.extractFromResponse(rawContent)
        : null;

      if (notes && this.scratchpads[color]) {
        this.scratchpads[color]!.write(notes);
      }

      if (this.streamListener) {
        this.streamListener('', player.model);
      }

      return {
        parsed: advisorResult.parsed ?? (rawContent
          ? parseMoveResponse({
              content: rawContent,
              model: player.model,
              responseTimeMs: advisorResult.responseTimeMs,
              finishReason: 'stop',
            })
          : null),
        rawContent,
        reasoningTrace: undefined,
        responseTimeMs: advisorResult.responseTimeMs,
        totalTokens: advisorResult.tokensUsed,
        moveSource: advisorResult.correctionLoopMode === 'forced' ? 'advisor_forced' : 'llm',
        advisorMove: advisorResult.advisorMove,
        advisorInfo: advisorResult.advisorMove
          ? `Advisor recommends ${advisorResult.advisorMove}`
          : undefined,
        predictedLines: advisorResult.parsed?.predictedLines,
        advisorElo: advisorResult.advisorElo,
        advisorVisibility: advisorResult.advisorVisibility,
        advisorProvenanceFrame: advisorResult.advisorProvenanceFrame,
        correctionLoopMode: advisorResult.correctionLoopMode,
        correctionRounds: advisorResult.correctionRounds,
        toolInvocations,
        scratchpadState: notes ?? this.scratchpads[color]?.read(),
        declaredCompromised: getImmediateActions(toolInvocations).compromisedReasoning,
      };
    }

    console.log(
      '[LLM] Requesting move: model=%s color=%s turn=%d legalMoves=%d effort=%s maxTokens=%s retry=%s',
      player.model,
      color,
      context.turnNumber,
      context.legalMoves.length,
      player.reasoningEffort ?? 'default',
      player.maxTokens ?? 'default',
      previousIllegalMove ? JSON.stringify(previousIllegalMove) : 'none',
    );
    const rawRequest = this.llm.requestMove(player, context, previousIllegalMove, onToken);
    const requestResult = wallClockLimit
      ? await ConstraintEnforcer.enforceWallClock(
          rawRequest,
          wallClockLimit,
          timeoutBehavior,
          context.legalMoves,
          () => streamed,
        )
      : { timedOut: false as const, result: await rawRequest };

    if (requestResult.timedOut) {
      const forcedMove = requestResult.move;
      const parsed = forcedMove
        ? {
            move: forcedMove,
            raw: forcedMove,
            parsedAt: Date.now(),
        }
        : null;
      if (this.streamListener) {
        this.streamListener('', player.model);
      }
      console.warn(
        '[LLM] Move request timed out: model=%s color=%s turn=%d elapsedMs=%d moveSource=%s violation=%s',
        player.model,
        color,
        context.turnNumber,
        Date.now() - requestStartedAt,
        requestResult.moveSource,
        requestResult.violation ?? 'none',
      );
      return {
        parsed,
        rawContent: forcedMove ?? '',
        reasoningTrace: undefined,
        responseTimeMs: wallClockLimit ?? 0,
        moveSource: requestResult.moveSource,
        constraintViolation: requestResult.violation,
      };
    }

    const rawResponse = requestResult.result;
    console.log(
      '[LLM] Move response received: model=%s color=%s turn=%d elapsedMs=%d finishReason=%s promptTokens=%s completionTokens=%s reasoningTokens=%s',
      player.model,
      color,
      context.turnNumber,
      Date.now() - requestStartedAt,
      rawResponse.finishReason ?? 'unknown',
      rawResponse.promptTokens ?? 'n/a',
      rawResponse.completionTokens ?? 'n/a',
      rawResponse.reasoningTokens ?? 'n/a',
    );
    const parsed = parseMoveResponse(rawResponse);
    const toolInvocations = parseToolInvocations(rawResponse.content, context.turnNumber);
    const notes = rawResponse.content && this.scratchpads[color]
      ? Scratchpad.extractFromResponse(rawResponse.content)
      : null;

    if (notes && this.scratchpads[color]) {
      this.scratchpads[color]!.write(notes);
    }

    if (this.streamListener) {
      this.streamListener('', player.model);
    }

    return {
      parsed,
      rawContent: rawResponse.content,
      reasoningTrace: rawResponse.reasoningTrace,
      responseTimeMs: rawResponse.responseTimeMs,
      promptTokens: rawResponse.promptTokens,
      completionTokens: rawResponse.completionTokens,
      ttftMs: rawResponse.ttftMs,
      networkLatencyMs: rawResponse.networkLatencyMs,
      streamDurationMs: rawResponse.streamDurationMs,
      reasoningTokens: rawResponse.reasoningTokens,
      totalTokens: (rawResponse.promptTokens || 0) + (rawResponse.completionTokens || 0) + (rawResponse.reasoningTokens || 0) || undefined,
      moveSource: 'llm',
      toolInvocations,
      scratchpadState: notes ?? this.scratchpads[color]?.read(),
      predictedLines: parsed?.predictedLines,
      declaredCompromised: getImmediateActions(toolInvocations).compromisedReasoning,
    };
  }

  private async processToolActions(
    color: PieceColor,
    context: TurnContext,
    invocations: ResponseToolInvocation[] | undefined,
  ): Promise<void> {
    if (!invocations || invocations.length === 0) return;

    this.toolHistory[color] = [...(this.toolHistory[color] ?? []), ...invocations];
    const actions = getImmediateActions(invocations);
    if (actions.needsSecondOpinion) {
      this.pendingSecondOpinion[color] = await processSecondOpinion(context.fen);
    }
  }

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
