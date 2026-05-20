import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { CommentatorConfig, EvalLogEntry, GameState, PlayerConfig } from '../engine/types';
import type { GameEvent } from '../engine/events';
import type { EvalResult } from '../chess/stockfish';
import { GameRuntime } from '../engine/runtime';
import { getStockfishEval } from '../chess/stockfish';
import type { LLMProviderConfig } from '../llm/client';
import { Chess } from 'chess.js';
import { createStreamingBridge } from './streamingBridge';

interface GameStore {
  runtime: GameRuntime | null;
  gameState: GameState | null;
  isRunning: boolean;
  isPaused: boolean;
  streamingText: string;
  streamingModel: string;
  commentatorModel: CommentatorConfig;
  viewingMoveIndex: number | null; // null = live view
  stockfishEval: EvalResult | null;
  prevEvalCp: number | null;
  evalLog: Record<number, EvalLogEntry>;

  startGame: (white: Omit<PlayerConfig, 'id' | 'color'>, black: Omit<PlayerConfig, 'id' | 'color'>, llmConfig: LLMProviderConfig) => void;
  setCommentatorModel: (model: CommentatorConfig) => void;
  setViewingMoveIndex: (index: number | null) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  abortGame: (reason: string) => void;
  clearGame: () => void;
  submitHumanMove: (move: string) => void;
  isWaitingForHuman: () => boolean;
  getLegalMoves: () => string[];
}

export const useGameStore = create<GameStore>()((set, get) => ({
  runtime: null,
  gameState: null,
  isRunning: false,
  isPaused: false,
  streamingText: '',
  streamingModel: '',
  commentatorModel: {
    id: '',
    name: '',
    mode: 'oracle',
    reasoningEffort: 'high',
    maxTokens: 1000,
    stockfishDepth: 18,
  },
  viewingMoveIndex: null,
  stockfishEval: null,
  prevEvalCp: null,
  evalLog: {},

  setCommentatorModel: (model) => set({ commentatorModel: model }),
  setViewingMoveIndex: (index) => set({ viewingMoveIndex: index }),

  startGame: (whiteConfig, blackConfig, llmConfig) => {
    const existing = get().runtime;
    if (existing) existing.abort('New game started');

    const white: PlayerConfig = { ...whiteConfig, id: uuid(), color: 'w' };
    const black: PlayerConfig = { ...blackConfig, id: uuid(), color: 'b' };

    const runtime = new GameRuntime(white, black, llmConfig);
    const streamBridge = createStreamingBridge((text, model) => {
      set({ streamingText: text, streamingModel: model });
    });

    runtime.subscribe((state: GameState, event: GameEvent) => {
      set({ gameState: state });

      // Trigger Stockfish eval on each MoveApplied
      if (event.type === 'MoveApplied') {
        handleMoveApplied(state);
      }
    });

    runtime.onStream((text: string, model: string) => {
      streamBridge.push(text, model);
    });

    set({
      runtime,
      isRunning: true,
      isPaused: false,
      streamingText: '',
      streamingModel: '',
      stockfishEval: null,
      prevEvalCp: null,
      evalLog: {},
    });

    runtime.start()
      .then((finalState) => {
        // Merge eval log into move history before final state
        const eLog = get().evalLog;
        const hasEval = Object.keys(eLog).length > 0;
        const enrichedState = hasEval
          ? {
              ...finalState,
              moveHistory: finalState.moveHistory.map((m, i) =>
                eLog[i] ? { ...m, ...eLog[i] } : m,
              ),
            }
          : finalState;
        streamBridge.dispose();
        set({ isRunning: false, gameState: enrichedState });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Game runtime failed:', message);
        runtime.abort(`Runtime error: ${message}`);
        streamBridge.dispose();
        set({ isRunning: false, isPaused: false, gameState: runtime.getState() });
      });
  },

  pauseGame: () => {
    get().runtime?.pause();
    set({ isPaused: true });
  },

  resumeGame: () => {
    get().runtime?.resume();
    set({ isPaused: false });
  },

  abortGame: (reason) => {
    get().runtime?.abort(reason);
    set({ isRunning: false, isPaused: false });
  },

  clearGame: () => {
    get().runtime?.abort('Game cleared');
    set({
      runtime: null,
      gameState: null,
      isRunning: false,
      isPaused: false,
      stockfishEval: null,
      prevEvalCp: null,
      evalLog: {},
    });
  },

  submitHumanMove: (move: string) => {
    get().runtime?.submitHumanMove(move);
  },

  isWaitingForHuman: () => {
    return get().runtime?.isWaitingForHuman() ?? false;
  },

  getLegalMoves: () => {
    return get().runtime?.getLegalMoves() ?? [];
  },
}));

async function handleMoveApplied(state: GameState): Promise<void> {
  const store = useGameStore.getState();
  const useOracleDepth = !!store.commentatorModel.id && (store.commentatorModel.mode ?? 'oracle') === 'oracle';
  const evalDepth = useOracleDepth ? (store.commentatorModel.stockfishDepth ?? 18) : 12;
  const expectedGameId = state.gameId;
  const expectedMoveCount = state.moveHistory.length;
  const expectedFen = state.fen;
  const moveIdx = state.moveHistory.length - 1;

  try {
    const sf = getStockfishEval();
    if (!sf.isReady()) {
      try { await sf.init(); } catch { return; }
    }
    if (sf.isReady()) {
      const priorEntry = moveIdx > 0 ? useGameStore.getState().evalLog[moveIdx - 1] : undefined;
      let preMoveEval: EvalResult | null = priorEntry
        ? {
            scoreCp: priorEntry.evalCp,
            isMate: priorEntry.isMate,
            mateIn: priorEntry.mateIn,
            bestMove: priorEntry.bestMove,
            pv: priorEntry.pv,
            depth: priorEntry.depth,
          }
        : null;
      if (!preMoveEval) {
        const preFen = reconstructFenBeforeMove(state, moveIdx);
        preMoveEval = await sf.evaluate(preFen, evalDepth);
      }

      const evalResult = await sf.evaluate(state.fen, evalDepth);
      const latest = useGameStore.getState().gameState;
      if (
        !latest ||
        latest.gameId !== expectedGameId ||
        latest.moveHistory.length !== expectedMoveCount ||
        latest.fen !== expectedFen
      ) {
        return;
      }
      const prevLog = useGameStore.getState().evalLog;
      const evalEntry: EvalLogEntry = {
        evalCp: evalResult.scoreCp,
        isMate: evalResult.isMate,
        mateIn: evalResult.mateIn,
        bestMove: evalResult.bestMove,
        pv: evalResult.pv,
        depth: evalResult.depth,
        preMoveEvalCp: preMoveEval?.scoreCp ?? null,
        preMoveIsMate: preMoveEval?.isMate,
        preMoveMateIn: preMoveEval?.mateIn ?? null,
        preMoveBestMove: preMoveEval?.bestMove,
        preMovePv: preMoveEval?.pv,
        preMoveDepth: preMoveEval?.depth,
      };
      useGameStore.setState({
        stockfishEval: evalResult,
        prevEvalCp: preMoveEval?.scoreCp ?? null,
        evalLog: {
          ...prevLog,
          [moveIdx]: evalEntry,
        },
      });
    }
  } catch (err) {
    console.warn('Stockfish eval failed:', err);
  }
}

function reconstructFenBeforeMove(state: GameState, moveIdx: number): string {
  const created = state.eventLog.find((event) => event.type === 'GameCreated');
  const initialFen = created?.type === 'GameCreated'
    ? created.payload.initialFen
    : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const chess = new Chess(initialFen);
  for (let i = 0; i < moveIdx; i++) {
    try {
      chess.move(state.moveHistory[i].move);
    } catch {
      break;
    }
  }
  return chess.fen();
}
