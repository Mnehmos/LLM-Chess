import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { CommentatorConfig, GameState, PlayerConfig } from '../engine/types';
import type { GameEvent } from '../engine/events';
import type { EvalResult } from '../chess/stockfish';
import { GameRuntime } from '../engine/runtime';
import { getStockfishEval } from '../chess/stockfish';
import type { LLMProviderConfig } from '../llm/client';

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
  evalLog: Record<number, { evalCp: number; isMate: boolean; mateIn: number | null; bestMove: string }>;

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

    runtime.subscribe((state: GameState, event: GameEvent) => {
      set({ gameState: state });

      // Trigger Stockfish eval on each MoveApplied
      if (event.type === 'MoveApplied') {
        handleMoveApplied(state);
      }
    });

    runtime.onStream((text: string, model: string) => {
      set({ streamingText: text, streamingModel: model });
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
        set({ isRunning: false, gameState: enrichedState });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Game runtime failed:', message);
        runtime.abort(`Runtime error: ${message}`);
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
  const prevEvalCp = store.stockfishEval?.scoreCp ?? null;
  const useOracleDepth = !!store.commentatorModel.id && (store.commentatorModel.mode ?? 'oracle') === 'oracle';
  const evalDepth = useOracleDepth ? (store.commentatorModel.stockfishDepth ?? 18) : 12;
  const expectedGameId = state.gameId;
  const expectedMoveCount = state.moveHistory.length;
  const expectedFen = state.fen;

  try {
    const sf = getStockfishEval();
    if (!sf.isReady()) {
      try { await sf.init(); } catch { return; }
    }
    if (sf.isReady()) {
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
      const moveIdx = state.moveHistory.length - 1;
      const prevLog = useGameStore.getState().evalLog;
      useGameStore.setState({
        stockfishEval: evalResult,
        prevEvalCp: prevEvalCp,
        evalLog: {
          ...prevLog,
          [moveIdx]: {
            evalCp: evalResult.scoreCp,
            isMate: evalResult.isMate,
            mateIn: evalResult.mateIn,
            bestMove: evalResult.bestMove,
          },
        },
      });
    }
  } catch (err) {
    console.warn('Stockfish eval failed:', err);
  }
}
