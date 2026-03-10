import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import { GameRuntime } from '../engine/runtime';
import { parseSinglePgn, pgnResultToGameResult } from '../pgn/parser';
import { getHistoricalCommentatorPrompt } from '../llm/prompts';
import type {
  CommentatorConfig,
  GameResult,
  GauntletTournamentConfig,
  GauntletTournamentState,
  TournamentGameRecord,
  GameState,
  PairGameSlot,
  AbortedGameRecord,
  ResumeContext,
  SavedTournament,
} from '../engine/types';
import type { GameEvent } from '../engine/events';
import type { EvalResult } from '../chess/stockfish';
import {
  createTournamentState,
  buildGamePlayers,
  getChallengerColor,
  getPairFen,
  computePairResult,
  computeMatchResult,
  assignPair3Opening,
} from '../engine/tournament';
import { getOpeningById } from '../engine/openings';
import { useBenchmarkStore } from './benchmarkStore';
import { getStockfishEval } from '../chess/stockfish';
import type { LLMProviderConfig } from '../llm/client';

function autoName(config: GauntletTournamentConfig): string {
  const challenger = config.challenger.displayName || config.challenger.model;
  const short = challenger?.split('/').pop() || challenger || 'Unknown';
  const defCount = config.defenders.length;
  const date = new Date(config.createdAt).toLocaleDateString();
  return `${short} vs ${defCount} defender${defCount !== 1 ? 's' : ''} (${date})`;
}

interface TournamentStore {
  // Multi-tournament support
  tournaments: Record<string, SavedTournament>;
  activeTournamentId: string | null;

  // Active tournament state (loaded from tournaments map)
  tournament: GauntletTournamentState | null;
  activeRuntime: GameRuntime | null;
  activeGameState: GameState | null;
  isRunning: boolean;
  isPaused: boolean;
  waitingForStart: boolean;
  /** True when in PGN replay mode (not a tournament game). */
  replayMode: boolean;
  /** Historical context string for replay commentary prompt. */
  replayHistoricalContext: string | null;
  /** Commentator model for replay mode (independent of tournament config). */
  replayCommentatorModel: CommentatorConfig | null;
  setReplayCommentatorModel: (model: CommentatorConfig | null) => void;
  streamingText: string;
  streamingModel: string;
  commentary: string;
  commentaryLog: Record<number, string>;
  evalLog: Record<number, { evalCp: number; isMate: boolean; mateIn: number | null; bestMove: string }>;
  stockfishEval: EvalResult | null;
  prevEvalCp: number | null;
  autoPlay: boolean;
  llmConfig: LLMProviderConfig | null;
  viewingMoveIndex: number | null;
  abortedGames: Record<string, AbortedGameRecord>;
  resumeContext: ResumeContext | null;
  activeResumeKey: string | null;

  createTournament: (config: Omit<GauntletTournamentConfig, 'tournamentId' | 'createdAt'>) => void;
  startTournament: (llmConfig: LLMProviderConfig) => void;
  playNextGame: (llmConfig: LLMProviderConfig) => void;
  pauseTournament: () => void;
  resumeTournament: () => void;
  abortTournament: () => void;
  clearTournament: () => void;
  setCommentatorModel: (model: CommentatorConfig | undefined) => void;
  setAutoPlay: (enabled: boolean) => void;
  setViewingMoveIndex: (index: number | null) => void;
  skipMatch: () => void;
  goToMatch: (index: number) => void;
  retryGame: (matchIndex: number, pairIndex: number, slotIndex: 0 | 1) => void;
  resumeGame: (matchIndex: number, pairIndex: number, slotIndex: 0 | 1) => void;

  // Replay actions
  startReplay: (pgn: string, config: { historicalContext?: string; moveDelayMs?: number }) => void;
  stopReplay: () => void;

  // Multi-tournament actions
  parkTournament: () => void;
  loadTournament: (id: string) => void;
  deleteTournament: (id: string) => void;
  renameTournament: (id: string, name: string) => void;
  listTournaments: () => SavedTournament[];
  syncToMap: () => void;
}

/**
 * Global narration gate — CommentaryPanel registers a callback that returns
 * a promise resolving when all narration audio finishes playing.
 * `onGameComplete` awaits this before advancing to the next game.
 */
let _waitForNarration: (() => Promise<void>) | null = null;
let _stopNarration: (() => void) | null = null;
export function registerNarrationGate(fn: (() => Promise<void>) | null): void {
  _waitForNarration = fn;
}
export function registerNarrationStop(fn: (() => void) | null): void {
  _stopNarration = fn;
}
/** Stop all narration audio immediately and clear the queue. */
function stopNarrationNow(): void {
  _stopNarration?.();
}

/**
 * Global commentary queue reference — TournamentProgress registers its queue
 * so the store can use waitForMove() for replay pacing.
 */
import type { CommentaryQueue } from '../commentary/commentaryQueue';
let _commentaryQueue: CommentaryQueue | null = null;
export function registerCommentaryQueue(queue: CommentaryQueue | null): void {
  _commentaryQueue = queue;
}

export const useTournamentStore = create<TournamentStore>()(
  persist(
    (set, get) => ({
      tournaments: {},
      activeTournamentId: null,
      tournament: null,
      activeRuntime: null,
      activeGameState: null,
      isRunning: false,
      isPaused: false,
      waitingForStart: false,
      replayMode: false,
      replayHistoricalContext: null,
      replayCommentatorModel: null,
      setReplayCommentatorModel: (model) => set({ replayCommentatorModel: model }),
      streamingText: '',
      streamingModel: '',
      commentary: '',
      commentaryLog: {},
      evalLog: {},
      stockfishEval: null,
      prevEvalCp: null,
      autoPlay: false,
      llmConfig: null,
      viewingMoveIndex: null,
      abortedGames: {},
      resumeContext: null,
      activeResumeKey: null,

      createTournament: (config) => {
        const { activeTournamentId } = get();

        // Park current tournament if one exists
        if (activeTournamentId) {
          get().parkTournament();
        }

        const fullConfig: GauntletTournamentConfig = {
          ...config,
          tournamentId: uuid(),
          createdAt: Date.now(),
        };
        const state = createTournamentState(fullConfig);
        const id = fullConfig.tournamentId;

        const tournaments = { ...get().tournaments };
        tournaments[id] = {
          state,
          abortedGames: {},
          commentaryLog: {},
          evalLog: {},
          savedAt: Date.now(),
          name: autoName(fullConfig),
        };

        set({
          tournaments,
          activeTournamentId: id,
          tournament: state,
          activeGameState: null,
          activeRuntime: null,
          waitingForStart: false,
          abortedGames: {},
          resumeContext: null,
          activeResumeKey: null,
        });
      },

      startTournament: (llmConfig) => {
        if (llmConfig.provider !== 'codex' && !llmConfig.apiKey) return;
        const { tournament } = get();
        if (!tournament) return;

        // Find resume point
        let matchIdx = tournament.currentMatchIndex;
        while (matchIdx < tournament.matches.length && tournament.matches[matchIdx].status === 'completed') {
          matchIdx++;
        }

        set({
          tournament: {
            ...tournament,
            status: 'running',
            currentMatchIndex: matchIdx,
            startedAt: tournament.startedAt || Date.now(),
          },
          isRunning: true,
          isPaused: false,
          waitingForStart: true,
          llmConfig,
        });

        // Initialize Stockfish in background
        getStockfishEval().init().catch(err => {
          console.warn('Stockfish init failed (eval will be unavailable):', err);
        });
      },

      playNextGame: (llmConfig) => {
        set({ waitingForStart: false, commentary: '', stockfishEval: null, prevEvalCp: null, viewingMoveIndex: null, llmConfig });
        runNextGame(llmConfig);
      },

      setAutoPlay: (enabled) => set({ autoPlay: enabled }),
      setViewingMoveIndex: (index) => set({ viewingMoveIndex: index }),

      pauseTournament: () => {
        const { activeRuntime, tournament } = get();
        activeRuntime?.pause();
        if (tournament) {
          set({
            isPaused: true,
            tournament: { ...tournament, status: 'paused' },
          });
        }
      },

      resumeTournament: () => {
        const { activeRuntime, tournament } = get();
        activeRuntime?.resume();
        if (tournament) {
          set({
            isPaused: false,
            tournament: { ...tournament, status: 'running' },
          });
        }
      },

      abortTournament: () => {
        const { activeRuntime, tournament } = get();
        stopNarrationNow();
        activeRuntime?.abort('Tournament aborted');
        if (tournament) {
          set({
            isRunning: false,
            isPaused: false,
            waitingForStart: false,
            activeRuntime: null,
            activeGameState: null,
            streamingText: '',
            streamingModel: '',
            commentary: '',
            stockfishEval: null,
            prevEvalCp: null,
            viewingMoveIndex: null,
            tournament: { ...tournament, status: 'aborted', completedAt: Date.now() },
          });
          get().syncToMap();
        }
      },

      clearTournament: () => {
        const { activeRuntime, activeTournamentId, tournaments } = get();
        stopNarrationNow();
        activeRuntime?.abort('Tournament cleared');

        // Remove from tournaments map if it exists
        const updated = { ...tournaments };
        if (activeTournamentId) {
          delete updated[activeTournamentId];
        }

        set({
          tournaments: updated,
          activeTournamentId: null,
          tournament: null,
          activeRuntime: null,
          activeGameState: null,
          isRunning: false,
          isPaused: false,
          waitingForStart: false,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
          abortedGames: {},
          resumeContext: null,
          activeResumeKey: null,
        });
      },

      setCommentatorModel: (model) => {
        const { tournament } = get();
        if (!tournament) return;
        set({
          tournament: {
            ...tournament,
            config: { ...tournament.config, commentatorModel: model },
          },
        });
      },

      skipMatch: () => {
        const { tournament, activeRuntime } = get();
        if (!tournament) return;
        stopNarrationNow();
        const idx = tournament.currentMatchIndex;
        if (idx >= tournament.matches.length) return;

        // Abort any running game
        activeRuntime?.abort('Match skipped');

        const updated = { ...tournament };
        updated.matches = [...updated.matches];
        updated.matches[idx] = {
          ...updated.matches[idx],
          status: 'skipped',
        };

        // Find next playable match (pending or in_progress)
        let nextIdx = idx + 1;
        while (nextIdx < updated.matches.length &&
          (updated.matches[nextIdx].status === 'completed' || updated.matches[nextIdx].status === 'skipped')) {
          nextIdx++;
        }
        updated.currentMatchIndex = nextIdx;

        // All remaining matches are completed or skipped — don't end tournament, let user come back
        set({
          tournament: updated,
          waitingForStart: nextIdx < updated.matches.length,
          activeRuntime: null,
          activeGameState: null,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          commentaryLog: {},
          evalLog: {},
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
        });
      },

      goToMatch: (index) => {
        const { tournament, activeRuntime } = get();
        if (!tournament) return;
        if (index < 0 || index >= tournament.matches.length) return;

        // If already viewing this match and a game is running, just restore the view (resume)
        if (index === tournament.currentMatchIndex && activeRuntime) {
          set({ waitingForStart: false });
          return;
        }

        const match = tournament.matches[index];

        // Abort any running game when navigating to a different match
        stopNarrationNow();
        activeRuntime?.abort('Navigated to different match');

        const updated = { ...tournament };
        updated.matches = [...updated.matches];
        updated.currentMatchIndex = index;

        // Reset non-active matches back to a playable state
        if (match.status === 'skipped' || match.status === 'completed') {
          updated.matches[index] = { ...match, status: 'in_progress' };
        }

        set({
          tournament: updated,
          waitingForStart: true,
          activeRuntime: null,
          activeGameState: null,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          commentaryLog: {},
          evalLog: {},
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
        });
      },

      retryGame: (matchIndex, pairIndex, slotIndex) => {
        const { tournament, activeRuntime } = get();
        if (!tournament) return;
        if (matchIndex < 0 || matchIndex >= tournament.matches.length) return;

        // Abort any running game
        activeRuntime?.abort('Retrying game');

        const updated = { ...tournament };
        updated.matches = [...updated.matches];
        const match = { ...updated.matches[matchIndex] };
        const pairs = [...match.pairs] as typeof match.pairs;
        const pair = { ...pairs[pairIndex] };

        // Clear the game record at the specified slot
        const games: typeof pair.games = [...pair.games] as typeof pair.games;
        games[slotIndex] = null;
        pair.games = games;

        // Reset pair result and scores
        pair.result = null;
        pair.challengerScore = 0;
        pair.defenderScore = 0;

        // Recalculate remaining game scores if one game still exists
        const remaining = pair.games[slotIndex === 0 ? 1 : 0];
        if (remaining) {
          const r = remaining.gameState.result;
          if (r?.outcome === 'decisive') {
            if (r.winner === remaining.challengerColor) pair.challengerScore = 1;
            else pair.defenderScore = 1;
          } else if (r?.outcome === 'draw') {
            pair.challengerScore = 0.5;
            pair.defenderScore = 0.5;
          }
        }

        pairs[pairIndex] = pair;
        match.pairs = pairs;

        // Recalculate match result
        const matchCalc = computeMatchResult(match);
        match.challengerPairWins = matchCalc.challengerPairWins;
        match.defenderPairWins = matchCalc.defenderPairWins;
        match.result = matchCalc.result;
        match.status = matchCalc.result ? 'completed' : 'in_progress';

        // If match was completed but now has a cleared game, reopen it
        if (!matchCalc.result) {
          match.status = 'in_progress';
          match.result = null;
        }

        // Point to the pair we want to replay
        match.currentPairIndex = pairIndex;
        match.currentSlot = null;

        updated.matches[matchIndex] = match;
        updated.currentMatchIndex = matchIndex;

        // Clear any saved aborted state for this game
        const abortKey = `${matchIndex}-${pairIndex}-${slotIndex}`;
        const { [abortKey]: _removed, ...remainingAborted } = get().abortedGames;

        set({
          tournament: updated,
          waitingForStart: true,
          activeRuntime: null,
          activeGameState: null,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          commentaryLog: {},
          evalLog: {},
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
          abortedGames: remainingAborted,
          resumeContext: null,
        });
      },

      resumeGame: (matchIndex, pairIndex, slotIndex) => {
        const { tournament, activeRuntime, abortedGames } = get();
        if (!tournament) return;
        if (matchIndex < 0 || matchIndex >= tournament.matches.length) return;

        const abortKey = `${matchIndex}-${pairIndex}-${slotIndex}`;
        let aborted = abortedGames[abortKey] || null;

        // Fallback: check if the pair slot itself holds an aborted game (pre-migration)
        if (!aborted) {
          const match = tournament.matches[matchIndex];
          const pair = match?.pairs[pairIndex];
          const rec = pair?.games[slotIndex as 0 | 1];
          if (rec?.gameState.result?.outcome === 'aborted' && rec.gameState.moveHistory.length > 0) {
            aborted = {
              gameState: rec.gameState,
              matchIndex,
              pairIndex,
              slot: rec.slot,
              challengerColor: rec.challengerColor,
              openingId: rec.openingId,
              resumeAttempts: 0,
            };
          }
        }

        if (!aborted) return;

        // Abort any running game
        activeRuntime?.abort('Resuming aborted game');

        // Increment resume attempts and save to abortedGames map
        const updatedAborted = { ...abortedGames, [abortKey]: { ...aborted, resumeAttempts: aborted.resumeAttempts + 1 } };

        // Point tournament to the right match/pair, and clear pair slot if it has aborted game
        const updated = { ...tournament };
        updated.matches = [...updated.matches];
        const match = { ...updated.matches[matchIndex] };
        match.pairs = [...match.pairs] as [typeof match.pairs[0], typeof match.pairs[1], typeof match.pairs[2]];
        const pair = { ...match.pairs[pairIndex] };
        // Clear the pair slot if it held an aborted game
        if (pair.games[slotIndex as 0 | 1]?.gameState.result?.outcome === 'aborted') {
          pair.games = [...pair.games] as [typeof pair.games[0], typeof pair.games[1]];
          (pair.games as (TournamentGameRecord | null)[])[slotIndex] = null;
        }
        match.pairs[pairIndex] = pair;
        match.currentPairIndex = pairIndex;
        match.currentSlot = null;
        match.status = 'in_progress';
        updated.matches[matchIndex] = match;
        updated.currentMatchIndex = matchIndex;

        set({
          tournament: updated,
          waitingForStart: true,
          activeRuntime: null,
          activeGameState: null,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          commentaryLog: aborted.commentaryLog || {},
          evalLog: aborted.evalLog || {},
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
          abortedGames: updatedAborted,
          resumeContext: {
            fen: aborted.gameState.fen,
            priorMoveHistory: aborted.gameState.moveHistory,
            abortedKey: abortKey,
          },
        });
      },

      // --- Replay actions ---

      startReplay: (pgn: string, config: { historicalContext?: string; moveDelayMs?: number }) => {
        const { activeRuntime } = get();
        if (activeRuntime) {
          activeRuntime.abort('Starting replay');
          stopNarrationNow();
        }

        const game = parseSinglePgn(pgn);
        const replayMoves = game.moves.map(m => m.san);
        const replayResult = pgnResultToGameResult(game.headers.result) as GameResult;

        // Build replay PlayerConfigs
        const white = {
          id: uuid(),
          color: 'w' as const,
          model: 'historical',
          displayName: game.headers.white,
          temperature: 0,
          promptLevel: 'p1' as const,
          outputFormat: 'A' as const,
          maxRetries: 0,
          type: 'replay' as const,
        };
        const black = {
          id: uuid(),
          color: 'b' as const,
          model: 'historical',
          displayName: game.headers.black,
          temperature: 0,
          promptLevel: 'p1' as const,
          outputFormat: 'A' as const,
          maxRetries: 0,
          type: 'replay' as const,
        };

        // Dummy LLM config — replay players don't make LLM calls
        const dummyLlmConfig: import('../llm/client').LLMProviderConfig = {
          provider: 'openrouter',
          apiKey: 'replay-no-llm',
        };

        const runtime = new GameRuntime(white, black, dummyLlmConfig, {
          startingFen: game.headers.fen,
          replayMoves,
          replayResult,
        });

        // No gate needed — moves fire with a simple delay (like LLM think time),
        // commentary + TTS run async in the background at their own pace.
        // Board display follows narration via effectiveMoveIndex (same as tournament).

        runtime.subscribe((state: GameState, event: GameEvent) => {
          useTournamentStore.setState({ activeGameState: state });

          if (event.type === 'MoveApplied') {
            // Stockfish eval — same path as tournament mode
            handleReplayMoveApplied(state, event);
          }
        });

        runtime.onStream((text: string, model: string) => {
          useTournamentStore.setState({ streamingText: text, streamingModel: model });
        });

        set({
          activeRuntime: runtime,
          activeGameState: null,
          replayMode: true,
          replayHistoricalContext: config.historicalContext || null,
          isRunning: true,
          isPaused: false,
          waitingForStart: false,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          commentaryLog: {},
          evalLog: {},
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
        });

        runtime.start()
          .then(async () => {
            if (_waitForNarration) {
              console.log('[Replay] Game ended — waiting for narration to finish...');
              await _waitForNarration();
              console.log('[Replay] Narration complete.');
            }
            set({
              activeRuntime: null,
              isRunning: false,
              streamingText: '',
              streamingModel: '',
            });
          })
          .catch((err) => {
            console.error('Replay runtime failed:', err);
            set({
              activeRuntime: null,
              isRunning: false,
              streamingText: '',
              streamingModel: '',
            });
          });
      },

      stopReplay: () => {
        const { activeRuntime, replayMode } = get();
        if (!replayMode) return;
        activeRuntime?.abort('Replay stopped');
        stopNarrationNow();
        set({
          activeRuntime: null,
          activeGameState: null,
          replayMode: false,
          isRunning: false,
          isPaused: false,
          streamingText: '',
          streamingModel: '',
        });
      },

      // --- Multi-tournament actions ---

      syncToMap: () => {
        const { activeTournamentId, tournament, abortedGames, commentaryLog, evalLog, tournaments } = get();
        if (!activeTournamentId || !tournament) return;
        const updated = { ...tournaments };
        updated[activeTournamentId] = {
          ...updated[activeTournamentId],
          state: tournament,
          abortedGames: { ...abortedGames },
          commentaryLog: { ...commentaryLog },
          evalLog: { ...evalLog },
          savedAt: Date.now(),
        };
        set({ tournaments: updated });
      },

      parkTournament: () => {
        const { activeRuntime, tournament, activeTournamentId,
                abortedGames, commentaryLog, evalLog, tournaments } = get();
        if (!tournament || !activeTournamentId) return;

        // Pause if running
        activeRuntime?.pause();

        // Save current state snapshot into tournaments map
        const updated = { ...tournaments };
        updated[activeTournamentId] = {
          state: { ...tournament, status: tournament.status === 'running' ? 'paused' : tournament.status },
          abortedGames: { ...abortedGames },
          commentaryLog: { ...commentaryLog },
          evalLog: { ...evalLog },
          savedAt: Date.now(),
          name: updated[activeTournamentId]?.name || autoName(tournament.config),
        };

        set({
          tournaments: updated,
          activeTournamentId: null,
          tournament: null,
          activeRuntime: null,
          activeGameState: null,
          isRunning: false,
          isPaused: false,
          waitingForStart: false,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          commentaryLog: {},
          evalLog: {},
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
          abortedGames: {},
          resumeContext: null,
          activeResumeKey: null,
        });
      },

      loadTournament: (id: string) => {
        const { activeTournamentId } = get();

        // Park current if one is active
        if (activeTournamentId) {
          get().parkTournament();
        }

        const saved = get().tournaments[id];
        if (!saved) return;

        set({
          activeTournamentId: id,
          tournament: saved.state,
          abortedGames: saved.abortedGames,
          commentaryLog: saved.commentaryLog || {},
          evalLog: saved.evalLog || {},
          // Restore ephemeral flags
          isRunning: saved.state.status === 'running' || saved.state.status === 'paused',
          isPaused: saved.state.status === 'paused',
          waitingForStart: saved.state.status === 'running' || saved.state.status === 'paused',
          // Clear ephemeral game state
          activeRuntime: null,
          activeGameState: null,
          streamingText: '',
          streamingModel: '',
          commentary: '',
          stockfishEval: null,
          prevEvalCp: null,
          viewingMoveIndex: null,
          resumeContext: null,
          activeResumeKey: null,
        });
      },

      deleteTournament: (id: string) => {
        const { activeTournamentId } = get();
        const tournaments = { ...get().tournaments };
        delete tournaments[id];

        if (activeTournamentId === id) {
          // Also clear active state
          set({
            tournaments,
            activeTournamentId: null,
            tournament: null,
            activeRuntime: null,
            activeGameState: null,
            isRunning: false,
            isPaused: false,
            waitingForStart: false,
            streamingText: '',
            streamingModel: '',
            commentary: '',
            commentaryLog: {},
            evalLog: {},
            stockfishEval: null,
            prevEvalCp: null,
            viewingMoveIndex: null,
            abortedGames: {},
            resumeContext: null,
            activeResumeKey: null,
          });
        } else {
          set({ tournaments });
        }
      },

      renameTournament: (id: string, name: string) => {
        const tournaments = { ...get().tournaments };
        if (tournaments[id]) {
          tournaments[id] = { ...tournaments[id], name };
          set({ tournaments });
        }
      },

      listTournaments: () => {
        return Object.values(get().tournaments).sort((a, b) => b.savedAt - a.savedAt);
      },
    }),
    {
      name: 'llm-chess-tournament',
      partialize: (state) => ({
        tournaments: state.tournaments,
        activeTournamentId: state.activeTournamentId,
        // Keep singular fields for backward compat write (read migration handles old format)
        tournament: state.tournament,
        abortedGames: state.abortedGames,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Initialize tournaments map if missing
        if (!state.tournaments) state.tournaments = {};

        // MIGRATION: old format had { tournament, abortedGames } at top level
        // New format has { tournaments: Record<id, SavedTournament>, activeTournamentId }
        if (Object.keys(state.tournaments).length === 0 && state.tournament) {
          const id = state.tournament.config.tournamentId;
          state.tournaments = {
            [id]: {
              state: state.tournament,
              abortedGames: state.abortedGames || {},
              commentaryLog: {},
              evalLog: {},
              savedAt: Date.now(),
              name: autoName(state.tournament.config),
            },
          };
          state.activeTournamentId = id;
          console.info(`[Tournament] Migrated legacy tournament to multi-tournament format`);
        }

        // Restore active tournament from map if activeTournamentId is set but tournament is null
        if (state.activeTournamentId && !state.tournament && state.tournaments[state.activeTournamentId]) {
          const saved = state.tournaments[state.activeTournamentId];
          state.tournament = saved.state;
          state.abortedGames = saved.abortedGames;
        }

        // After hydration, restore ephemeral flags from persisted tournament status
        if (!state.tournament) return;
        const status = state.tournament.status;
        if (status === 'running') {
          state.isRunning = true;
          state.waitingForStart = true; // Let user manually resume from where they left off
          state.isPaused = false;
        } else if (status === 'paused') {
          state.isRunning = true;
          state.isPaused = true;
          state.waitingForStart = false;
        }

        // Migrate aborted games stuck in pair slots (from before the abort guard)
        // Move them to abortedGames map and null out the pair slot
        const t = state.tournament;
        let migrated = 0;
        for (let mi = 0; mi < t.matches.length; mi++) {
          const match = t.matches[mi];
          for (let pi = 0; pi < match.pairs.length; pi++) {
            const pair = match.pairs[pi];
            for (let si = 0; si < 2; si++) {
              const rec = pair.games[si as 0 | 1];
              if (rec && rec.gameState.result?.outcome === 'aborted') {
                const key = `${mi}-${pi}-${si}`;
                if (!state.abortedGames[key]) {
                  state.abortedGames[key] = {
                    gameState: rec.gameState,
                    matchIndex: mi,
                    pairIndex: pi,
                    slot: rec.slot,
                    challengerColor: rec.challengerColor,
                    openingId: rec.openingId,
                    resumeAttempts: 0,
                  };
                }
                // Clear the pair slot so tournament logic sees it as unplayed
                (pair.games as (TournamentGameRecord | null)[])[si] = null;
                migrated++;
              }
            }
          }
        }
        if (migrated > 0) {
          console.warn(`[Tournament] Migrated ${migrated} aborted game(s) from pair slots to resume map`);
        }

        // Sync migrated aborted games back into the tournaments map
        if (state.activeTournamentId && state.tournaments[state.activeTournamentId]) {
          state.tournaments[state.activeTournamentId] = {
            ...state.tournaments[state.activeTournamentId],
            state: state.tournament,
            abortedGames: state.abortedGames || {},
          };
        }
      },
    },
  ),
);

// --- Orchestration (outside store to avoid circular set() issues) ---

function runNextGame(llmConfig: LLMProviderConfig): void {
  const store = useTournamentStore.getState();
  const { tournament } = store;
  if (!tournament || tournament.status !== 'running') return;

  const matchIdx = tournament.currentMatchIndex;
  if (matchIdx >= tournament.matches.length) {
    // Check if there are skipped matches remaining
    const hasSkipped = tournament.matches.some(m => m.status === 'skipped');
    if (hasSkipped) {
      useTournamentStore.setState({ waitingForStart: false });
      return;
    }
    useTournamentStore.setState({
      isRunning: false,
      waitingForStart: false,
      tournament: { ...tournament, status: 'completed', completedAt: Date.now() },
    });
    return;
  }

  const match = tournament.matches[matchIdx];

  // Skip over skipped/completed matches
  if (match.status === 'skipped') {
    const updated = { ...tournament };
    updated.currentMatchIndex = matchIdx + 1;
    useTournamentStore.setState({ tournament: updated, waitingForStart: true });
    return;
  }

  // Check if this match is already resolved
  const matchCalc = computeMatchResult(match);
  if (matchCalc.result || match.status === 'completed') {
    const updated = { ...tournament };
    updated.matches = [...updated.matches];
    updated.matches[matchIdx] = { ...match, status: 'completed', result: matchCalc.result };
    updated.currentMatchIndex = matchIdx + 1;
    useTournamentStore.setState({ tournament: updated, waitingForStart: true });
    return;
  }

  // Find the current pair and slot to play
  let pairIdx = match.currentPairIndex;

  while (
    pairIdx < 3 &&
    (
      match.pairs[pairIdx].result !== null ||
      (match.pairs[pairIdx].games[0] !== null && match.pairs[pairIdx].games[1] !== null)
    )
  ) {
    pairIdx++;
  }

  if (pairIdx === 2 && matchCalc.canSkipPair3) {
    const updated = { ...tournament };
    updated.matches = [...updated.matches];
    updated.matches[matchIdx] = {
      ...match,
      status: 'completed',
      result: matchCalc.result!,
      challengerPairWins: matchCalc.challengerPairWins,
      defenderPairWins: matchCalc.defenderPairWins,
    };
    updated.currentMatchIndex = matchIdx + 1;
    useTournamentStore.setState({ tournament: updated, waitingForStart: true });
    return;
  }

  if (pairIdx >= 3) {
    const updated = { ...tournament };
    updated.matches = [...updated.matches];
    updated.matches[matchIdx] = {
      ...match,
      status: 'completed',
      result: matchCalc.result || 'drawn',
      challengerPairWins: matchCalc.challengerPairWins,
      defenderPairWins: matchCalc.defenderPairWins,
    };
    updated.currentMatchIndex = matchIdx + 1;
    useTournamentStore.setState({ tournament: updated, waitingForStart: true });
    return;
  }

  const pair = match.pairs[pairIdx];

  // Assign pair 3 opening if needed
  if (pairIdx === 2 && !pair.opening) {
    const opening = assignPair3Opening(match);
    const updatedPairs: typeof match.pairs = [...match.pairs] as typeof match.pairs;
    updatedPairs[2] = { ...pair, opening };
    const updatedMatch = { ...match, pairs: updatedPairs, currentPairIndex: pairIdx };
    const updated = { ...tournament };
    updated.matches = [...updated.matches];
    updated.matches[matchIdx] = updatedMatch;
    useTournamentStore.setState({ tournament: updated });
    setTimeout(() => runNextGame(llmConfig), 0);
    return;
  }

  // Determine slot
  const slot: PairGameSlot | null = pair.games[0] === null
    ? 'a'
    : (pair.games[1] === null ? 'b' : null);
  if (!slot) {
    // Pair already has two games recorded; advance to next scheduling step.
    setTimeout(() => runNextGame(llmConfig), 0);
    return;
  }
  const challengerColor = getChallengerColor(pairIdx, slot);
  const { white, black } = buildGamePlayers(match.config, challengerColor);
  const fen = getPairFen(pair);

  // Mark match as in_progress
  {
    const updated = { ...tournament };
    updated.matches = [...updated.matches];
    updated.matches[matchIdx] = {
      ...match,
      status: 'in_progress',
      currentPairIndex: pairIdx,
      currentSlot: slot,
    };
    useTournamentStore.setState({ tournament: updated });
  }

  // Check for resume context (resuming an aborted game from its last position)
  const { resumeContext } = useTournamentStore.getState();
  const runtimeOptions: { startingFen?: string; priorMoveHistory?: import('../engine/types').MoveRecord[] } = {};
  if (resumeContext) {
    runtimeOptions.startingFen = resumeContext.fen;
    runtimeOptions.priorMoveHistory = resumeContext.priorMoveHistory;
  } else if (fen) {
    runtimeOptions.startingFen = fen;
  }

  // Create and start game
  const runtime = new GameRuntime(white, black, llmConfig,
    Object.keys(runtimeOptions).length > 0 ? runtimeOptions : undefined);

  runtime.subscribe((state: GameState, event: GameEvent) => {
    useTournamentStore.setState({ activeGameState: state });

    // Trigger Stockfish eval + commentary on each MoveApplied
    if (event.type === 'MoveApplied') {
      handleMoveApplied(state, event, llmConfig);
    }
  });

  runtime.onStream((text: string, model: string) => {
    useTournamentStore.setState({ streamingText: text, streamingModel: model });
  });

  // Track the resume key so onGameComplete can clean up aborted state
  const activeResumeKey = resumeContext?.abortedKey || null;

  // When resuming, preserve prior commentary/eval logs; otherwise reset
  const currentStore = useTournamentStore.getState();
  useTournamentStore.setState({
    activeRuntime: runtime,
    activeGameState: null,
    streamingText: '',
    streamingModel: '',
    commentary: '',
    commentaryLog: resumeContext ? currentStore.commentaryLog : {},
    evalLog: resumeContext ? currentStore.evalLog : {},
    stockfishEval: null,
    prevEvalCp: null,
    viewingMoveIndex: null,
    resumeContext: null,  // consumed
    activeResumeKey,
  });

  runtime.start()
    .then(async (finalState) => {
      // Wait for all narration to finish before advancing — narrator controls the stream pace
      if (_waitForNarration) {
        console.log('[Tournament] Game ended — waiting for narration to finish...');
        await _waitForNarration();
        console.log('[Tournament] Narration complete — advancing.');
      }
      useTournamentStore.setState({
        activeRuntime: null,
        streamingText: '',
        streamingModel: '',
      });
      onGameComplete(finalState, matchIdx, pairIdx, slot, challengerColor, pair.opening?.id || null);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Tournament game runtime failed:', message);
      runtime.abort(`Runtime error: ${message}`);
      useTournamentStore.setState({
        activeRuntime: null,
        streamingText: '',
        streamingModel: '',
        waitingForStart: true,
      });
    });
}

async function handleMoveApplied(state: GameState, event: GameEvent, _llmConfig: LLMProviderConfig): Promise<void> {
  if (event.type !== 'MoveApplied') return;

  const store = useTournamentStore.getState();
  const tournament = store.tournament;
  if (!tournament) return;
  const commentatorModel = tournament.config.commentatorModel;
  const commentatorMode = commentatorModel?.mode ?? 'oracle';
  const useOracleDepth = !!commentatorModel?.id && commentatorMode === 'oracle';
  const evalDepth = useOracleDepth ? (commentatorModel?.stockfishDepth ?? 18) : 12;

  const prevEvalCp = store.stockfishEval?.scoreCp ?? null;
  const expectedGameId = state.gameId;
  const expectedMoveCount = state.moveHistory.length;
  const expectedFen = state.fen;

  // Run Stockfish eval — commentary is now handled by the CommentaryQueue in the component
  try {
    const sf = getStockfishEval();
    if (!sf.isReady()) {
      try { await sf.init(); } catch { /* will skip eval if init fails */ }
    }
    if (sf.isReady()) {
      const evalResult = await sf.evaluate(state.fen, evalDepth);
      const latestAfterEval = useTournamentStore.getState().activeGameState;
      if (
        !latestAfterEval ||
        latestAfterEval.gameId !== expectedGameId ||
        latestAfterEval.moveHistory.length !== expectedMoveCount ||
        latestAfterEval.fen !== expectedFen
      ) {
        return;
      }
      const moveIdx = state.moveHistory.length - 1;
      const prevEvalLog = useTournamentStore.getState().evalLog;
      useTournamentStore.setState({
        stockfishEval: evalResult,
        prevEvalCp: prevEvalCp,
        evalLog: {
          ...prevEvalLog,
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

/**
 * Stockfish eval for replay mode — uses replayCommentatorModel config instead of tournament.
 * Identical to handleMoveApplied but reads commentator config from replay state.
 */
async function handleReplayMoveApplied(state: GameState, event: GameEvent): Promise<void> {
  if (event.type !== 'MoveApplied') return;

  const store = useTournamentStore.getState();
  const commentatorModel = store.replayCommentatorModel;
  const commentatorMode = commentatorModel?.mode ?? 'oracle';
  const useOracleDepth = !!commentatorModel?.id && commentatorMode === 'oracle';
  const evalDepth = useOracleDepth ? (commentatorModel?.stockfishDepth ?? 18) : 12;

  const prevEvalCp = store.stockfishEval?.scoreCp ?? null;
  const expectedGameId = state.gameId;
  const expectedMoveCount = state.moveHistory.length;
  const expectedFen = state.fen;

  try {
    const sf = getStockfishEval();
    if (!sf.isReady()) {
      try { await sf.init(); } catch { /* will skip eval if init fails */ }
    }
    if (sf.isReady()) {
      const evalResult = await sf.evaluate(state.fen, evalDepth);
      const latestAfterEval = useTournamentStore.getState().activeGameState;
      if (
        !latestAfterEval ||
        latestAfterEval.gameId !== expectedGameId ||
        latestAfterEval.moveHistory.length !== expectedMoveCount ||
        latestAfterEval.fen !== expectedFen
      ) {
        return;
      }
      const moveIdx = state.moveHistory.length - 1;
      const prevEvalLog = useTournamentStore.getState().evalLog;
      useTournamentStore.setState({
        stockfishEval: evalResult,
        prevEvalCp: prevEvalCp,
        evalLog: {
          ...prevEvalLog,
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
    console.warn('Stockfish eval failed (replay):', err);
  }
}

// Abort reasons from user-initiated actions — these should NOT be saved for resume
const USER_ABORT_PATTERNS = [
  'Tournament aborted',
  'Match skipped',
  'Navigated to different match',
  'Retrying game',
  'Resuming aborted game',
  'Tournament cleared',
];

const MAX_AUTO_RESUME = 3;

function isUserInitiatedAbort(gameState: GameState): boolean {
  if (gameState.result?.outcome !== 'aborted') return false;
  const reason = gameState.result.reason;
  return USER_ABORT_PATTERNS.some(p => reason.startsWith(p));
}

function onGameComplete(
  gameState: GameState,
  matchIdx: number,
  pairIdx: number,
  slot: PairGameSlot,
  challengerColor: 'w' | 'b',
  openingId: string | null,
): void {
  const store = useTournamentStore.getState();
  const slotIdx = slot === 'a' ? 0 : 1;
  const abortKey = `${matchIdx}-${pairIdx}-${slotIdx}`;

  // Clean up resume tracking
  const activeResumeKey = store.activeResumeKey;
  if (activeResumeKey) {
    useTournamentStore.setState({ activeResumeKey: null });
  }

  // Handle aborted games
  if (gameState.status === 'aborted') {
    // User-initiated aborts: don't save, just return
    if (isUserInitiatedAbort(gameState)) {
      return;
    }

    // Transient error abort: save for resume if game had progress
    if (gameState.moveHistory.length > 0) {
      const existing = store.abortedGames[abortKey];
      const resumeAttempts = existing?.resumeAttempts ?? 0;

      const abortedRecord: AbortedGameRecord = {
        gameState,
        matchIndex: matchIdx,
        pairIndex: pairIdx,
        slot,
        challengerColor,
        openingId,
        resumeAttempts,
        commentaryLog: { ...store.commentaryLog },
        evalLog: { ...store.evalLog },
      };

      useTournamentStore.setState({
        abortedGames: { ...store.abortedGames, [abortKey]: abortedRecord },
      });

      // Auto-resume if auto-play is on and within retry limit
      const { autoPlay, llmConfig } = useTournamentStore.getState();
      if (autoPlay && llmConfig && resumeAttempts < MAX_AUTO_RESUME) {
        console.warn(`[Tournament] Game aborted, auto-resuming (attempt ${resumeAttempts + 1}/${MAX_AUTO_RESUME}) from move ${gameState.moveHistory.length}`);
        // Set up resume context and trigger next game
        useTournamentStore.setState({
          abortedGames: {
            ...useTournamentStore.getState().abortedGames,
            [abortKey]: { ...abortedRecord, resumeAttempts: resumeAttempts + 1 },
          },
          resumeContext: {
            fen: gameState.fen,
            priorMoveHistory: gameState.moveHistory,
            abortedKey: abortKey,
          },
          waitingForStart: false,
        });
        setTimeout(() => runNextGame(llmConfig), 2000);
        return;
      }

      // Not auto-playing or exceeded retries — wait for manual resume
      console.warn(`[Tournament] Game aborted at move ${gameState.moveHistory.length}. Use Resume to continue.`);
      useTournamentStore.setState({ waitingForStart: true });
      return;
    }

    // Aborted with no moves: just wait for user
    useTournamentStore.setState({ waitingForStart: true });
    return;
  }

  // Successful completion — clear any saved aborted state for this game
  if (store.abortedGames[abortKey] || activeResumeKey === abortKey) {
    const { [abortKey]: _removed, ...remaining } = store.abortedGames;
    useTournamentStore.setState({ abortedGames: remaining });
  }

  // Merge commentary + stockfish eval logs into move history before saving
  const cLog = store.commentaryLog;
  const eLog = store.evalLog;
  const hasCommentary = Object.keys(cLog).length > 0;
  const hasEval = Object.keys(eLog).length > 0;
  const enrichedState = (hasCommentary || hasEval)
    ? {
        ...gameState,
        moveHistory: gameState.moveHistory.map((m, i) => {
          let enriched = m;
          if (cLog[i]) enriched = { ...enriched, commentary: cLog[i] };
          if (eLog[i]) enriched = { ...enriched, ...eLog[i] };
          return enriched;
        }),
      }
    : gameState;

  const opening = openingId ? getOpeningById(openingId) : undefined;
  useBenchmarkStore.getState().recordGame(enrichedState, {
    source: 'tournament',
    matchStructure: 'gauntlet',
    openingId,
    openingName: opening?.name ?? null,
    openingEco: opening?.eco ?? null,
    startingFen: opening?.fen ?? null,
    commentatorModel: store.tournament?.config.commentatorModel ?? null,
  });

  // Sync to tournaments map after game completion
  useTournamentStore.getState().syncToMap();

  const gameRecord: TournamentGameRecord = {
    gameState: enrichedState,
    pairIndex: pairIdx,
    slot,
    challengerColor,
    openingId,
  };

  const tournament = store.tournament;
  if (!tournament) return;

  const updated = { ...tournament };
  updated.matches = [...updated.matches];
  const match = { ...updated.matches[matchIdx] };
  const pairs = [...match.pairs] as typeof match.pairs;
  const pair = { ...pairs[pairIdx] };

  const games: typeof pair.games = [...pair.games] as typeof pair.games;
  games[slotIdx] = gameRecord;
  pair.games = games;

  if (pair.games[0] && pair.games[1]) {
    const pairResult = computePairResult(pair);
    pair.result = pairResult;

    let cScore = 0, dScore = 0;
    for (const g of pair.games) {
      if (!g) continue;
      const r = g.gameState.result;
      if (!r) continue;
      if (r.outcome === 'decisive') {
        if (r.winner === g.challengerColor) cScore += 1;
        else dScore += 1;
      } else if (r.outcome === 'draw') {
        cScore += 0.5;
        dScore += 0.5;
      }
    }
    pair.challengerScore = cScore;
    pair.defenderScore = dScore;
  }

  pairs[pairIdx] = pair;
  match.pairs = pairs;

  const matchCalc = computeMatchResult(match);
  match.challengerPairWins = matchCalc.challengerPairWins;
  match.defenderPairWins = matchCalc.defenderPairWins;

  if (matchCalc.result) {
    match.result = matchCalc.result;
    match.status = 'completed';
    updated.currentMatchIndex = matchIdx + 1;
  } else if (pair.games[0] && pair.games[1]) {
    match.currentPairIndex = pairIdx + 1;
    match.currentSlot = null;
  }

  updated.matches[matchIdx] = match;

  if (updated.currentMatchIndex >= updated.matches.length) {
    // Check for remaining skipped matches
    const hasSkipped = updated.matches.some(m => m.status === 'skipped');
    if (!hasSkipped) {
      updated.status = 'completed';
      updated.completedAt = Date.now();
      useTournamentStore.setState({
        tournament: updated,
        isRunning: false,
        waitingForStart: false,
        activeGameState: null,
      });
      return;
    }
  }

  // Check autoPlay — if enabled, auto-start next game after a brief delay
  const { autoPlay, llmConfig } = useTournamentStore.getState();
  if (autoPlay && llmConfig) {
    useTournamentStore.setState({
      tournament: updated,
      activeGameState: null,
      waitingForStart: false,
      commentary: '',
      stockfishEval: null,
    });
    useTournamentStore.getState().syncToMap();
    setTimeout(() => runNextGame(llmConfig), 1500);
  } else {
    // Manual mode: wait for user to start next game
    useTournamentStore.setState({
      tournament: updated,
      activeGameState: null,
      waitingForStart: true,
    });
    useTournamentStore.getState().syncToMap();
  }
}
