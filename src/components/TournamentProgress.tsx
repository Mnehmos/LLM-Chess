import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTournamentStore, registerCommentaryQueue } from '../store/tournamentStore';
import { useSettingsStore } from '../store/settingsStore';
import { Board } from './Board';
import { MoveHistory } from './MoveHistory';
import { Graveyard } from './Graveyard';
import { GameLayout } from './GameLayout';
import { InfoBanner } from './InfoBanner';
import { ModelSelector } from './ModelSelector';
import { downloadSingleGamePGN } from '../utils/export';
import { downloadSingleGameJSON } from '../utils/export';
import { CommentaryQueue, type CommentaryEntry } from '../commentary/commentaryQueue';
import { createLLMClient } from '../llm/client';
import { getHistoricalCommentatorPrompt, buildPuzzleBreakIntroPrompt, buildPuzzleSetupPromptWithOracle, buildPuzzleCommentaryTurnPromptWithOracle, buildPuzzleOutroPromptWithOracle } from '../llm/prompts';
import { runResilientTextGeneration } from '../llm/resilient-text';
import { fetchLichessPuzzle, getPuzzleFamilyId, prefillPuzzlePool, type LichessPuzzle, type PuzzleTurn } from '../commentary/puzzleBreak';
import { parseAnnotations, EMPTY_ANNOTATIONS, parsePuzzleMoves, hasAnnotations, mergeAnnotations, type BoardAnnotations } from '../utils/board-annotations';
import { parseMoveResponse } from '../llm/parser';
import { Chess } from 'chess.js';
import { PuzzleBreakPanel } from './PuzzleBreakPanel';
import { getModelCapability } from '../llm/model-capabilities';
import { formatEval, getStockfishEval, type EvalResult } from '../chess/stockfish';
import type { GauntletMatchState, PairRecord, TournamentGameRecord } from '../engine/types';
import type { GameEvent } from '../engine/events';

interface PausedPuzzleSession {
  phase: 'intro' | 'active';
  puzzle: LichessPuzzle;
  introText: string;
  setupText: string;
  setupNarrated: boolean;
  outroText: string;
  outroNarrated: boolean;
  turnHistory: PuzzleTurn[];
  isComplete: boolean;
}

const introGeneratedForGameIds = new Set<string>();
const queuedMoveCountByGameId = new Map<string, number>();

function getSavedCommentaryMoveCount(commentaryLog: Record<number, string>): number {
  const moveIndexes = Object.keys(commentaryLog)
    .map((key) => Number(key))
    .filter((value) => Number.isInteger(value) && value >= 0);
  return moveIndexes.length > 0 ? Math.max(...moveIndexes) + 1 : 0;
}

export function TournamentProgress() {
  const tournament = useTournamentStore(s => s.tournament);
  const activeGameState = useTournamentStore(s => s.activeGameState);
  const isPaused = useTournamentStore(s => s.isPaused);
  const waitingForStart = useTournamentStore(s => s.waitingForStart);
  const streamingText = useTournamentStore(s => s.streamingText);
  const streamingModel = useTournamentStore(s => s.streamingModel);
  const stockfishEval = useTournamentStore(s => s.stockfishEval);
  const evalLog = useTournamentStore(s => s.evalLog);
  const prevEvalCp = useTournamentStore(s => s.prevEvalCp);
  const viewingMoveIndex = useTournamentStore(s => s.viewingMoveIndex);
  const setViewingMoveIndex = useTournamentStore(s => s.setViewingMoveIndex);
  const pauseTournament = useTournamentStore(s => s.pauseTournament);
  const resumeTournament = useTournamentStore(s => s.resumeTournament);
  const abortTournament = useTournamentStore(s => s.abortTournament);
  const playNextGame = useTournamentStore(s => s.playNextGame);
  const setCommentatorModel = useTournamentStore(s => s.setCommentatorModel);
  const skipMatch = useTournamentStore(s => s.skipMatch);
  const goToMatch = useTournamentStore(s => s.goToMatch);
  const autoPlay = useTournamentStore(s => s.autoPlay);
  const setAutoPlay = useTournamentStore(s => s.setAutoPlay);
  const activeRuntime = useTournamentStore(s => s.activeRuntime);
  const replayMode = useTournamentStore(s => s.replayMode);
  const stopReplay = useTournamentStore(s => s.stopReplay);
  const replayCommentatorModel = useTournamentStore(s => s.replayCommentatorModel);
  const apiKey = useSettingsStore(s => s.apiKey);
  const provider = useSettingsStore(s => s.provider);
  const ollamaBaseUrl = useSettingsStore(s => s.ollamaBaseUrl);
  const ttsEnabled = useSettingsStore(s => s.ttsEnabled);
  const puzzleBreakEnabled = useSettingsStore(s => s.puzzleBreakEnabled);
  const startTournament = useTournamentStore(s => s.startTournament);
  const [showCommentatorPicker, setShowCommentatorPicker] = useState(false);
  const [livestreamMode, setLivestreamMode] = useState(false);
  const currentMatch = tournament ? tournament.matches[tournament.currentMatchIndex] : undefined;
  const challengerName = tournament
    ? (tournament.config.challenger.displayName.split('/').pop() || 'Challenger')
    : 'Challenger';

  const commentatorModel = replayMode ? replayCommentatorModel : tournament?.config.commentatorModel;

  const totalGamesPlayed = tournament
    ? tournament.matches.reduce((sum, m) =>
      sum + m.pairs.reduce((ps, p) =>
        ps + (p.games[0] ? 1 : 0) + (p.games[1] ? 1 : 0), 0), 0)
    : 0;

  const completedMatches = tournament
    ? tournament.matches.filter(m => m.status === 'completed').length
    : 0;

  // --- Commentary Queue ---
  const [commentaryEntries, setCommentaryEntries] = useState<CommentaryEntry[]>([]);
  const [narrationMoveIndex, setNarrationMoveIndex] = useState(-1);
  const [narrationSquares, setNarrationSquares] = useState<string[]>([]);
  const [narrationArrows, setNarrationArrows] = useState<{ from: string; to: string; color: 'w' | 'b' }[]>([]);
  const [narrationAnnotations, setNarrationAnnotations] = useState<import('../utils/board-annotations').BoardAnnotations | undefined>();
  const queueRef = useRef<CommentaryQueue | null>(null);
  const lastQueuedMoveCountRef = useRef(0);
  const gameIdRef = useRef<string | null>(null);
  /** Shared ref: CommentaryPanel writes avg dead air, CommentaryQueue reads it. */
  const deadAirRef = useRef(0);
  /** Shared ref: CommentaryPanel writes audio backlog count, filler reads it. */
  const audioBacklogRef = useRef(0);
  /** Shared ref: CommentaryPanel writes actual playback state, filler hard-blocks on it. */
  const audioPlayingRef = useRef(false);
  /** Timestamp of the last move applied — used for thinking-time indicator. */
  const lastMoveAtRef = useRef(Date.now());
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);

  // --- Puzzle Break state ---
  const [puzzlePhase, setPuzzlePhase] = useState<'hidden' | 'intro' | 'active'>('hidden');
  const [currentPuzzle, setCurrentPuzzle] = useState<LichessPuzzle | null>(null);
  const [puzzleIntroText, setPuzzleIntroText] = useState('');
  const [puzzleSetupText, setPuzzleSetupText] = useState('');
  const [puzzleSetupNarrated, setPuzzleSetupNarrated] = useState(false);
  const [puzzleOutroText, setPuzzleOutroText] = useState('');
  const [puzzleOutroNarrated, setPuzzleOutroNarrated] = useState(false);
  /** Completed turns generated by the commentator. */
  const [puzzleTurnHistory, setPuzzleTurnHistory] = useState<PuzzleTurn[]>([]);
  /** Streaming text for the current model turn */
  const [puzzleStreamText, setPuzzleStreamText] = useState('');
  /** Thinking tokens for the current model turn */
  const [puzzleThinkingText, setPuzzleThinkingText] = useState('');
  /** Side currently being narrated while the next turn is generated. */
  const [puzzleStreamingSide, setPuzzleStreamingSide] = useState<'w' | 'b' | null>(null);
  /** Set when all solution moves have been played */
  const [puzzleIsComplete, setPuzzleIsComplete] = useState(false);
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);
  const puzzleAbortRef = useRef<AbortController | null>(null);
  const puzzleTriggeredMoveCountRef = useRef(0);
  const pausedPuzzleRef = useRef<PausedPuzzleSession | null>(null);
  const seenPuzzleIdsRef = useRef<Set<string>>(new Set());
  const puzzleBreakBlockedUntilRef = useRef(0);
  const puzzleSetupRequestStartedRef = useRef(false);
  const puzzleTurnLoopStartedRef = useRef(false);
  const puzzleOutroRequestStartedRef = useRef(false);
  const puzzlePhaseRef = useRef<'hidden' | 'intro' | 'active'>('hidden');
  const puzzleEvalCacheRef = useRef<Map<string, EvalResult | null>>(new Map());
  puzzlePhaseRef.current = puzzlePhase;

  const handleNarrationStart = useCallback((maxMoveIndex: number, moves: { from: string; to: string; color: 'w' | 'b' }[]) => {
    setNarrationMoveIndex(prev => Math.max(prev, maxMoveIndex));
    setNarrationArrows(moves);
  }, []);

  const handleAudioDrained = useCallback(() => {
    queueRef.current?.notifyAudioDrained();
  }, []);

  const handleNarrationSquares = useCallback((squares: string[], annotations: import('../utils/board-annotations').BoardAnnotations) => {
    setNarrationSquares(squares);
    setNarrationAnnotations(annotations);
  }, []);

  const handleResumeTournament = useCallback((streamMode: boolean) => {
    setLivestreamMode(streamMode);
    resumeTournament();
    startTournament({ provider, apiKey, ollamaBaseUrl });
  }, [apiKey, ollamaBaseUrl, provider, resumeTournament, startTournament]);

  const handleStartNextGame = useCallback((streamMode: boolean) => {
    setLivestreamMode(streamMode);
    playNextGame({ provider, apiKey, ollamaBaseUrl });
  }, [apiKey, ollamaBaseUrl, playNextGame, provider]);

  // Use a ref so getClient identity never changes — prevents queue destruction mid-game.
  // The queue gets created once at mount; getClient always reads latest config from the ref.
  const clientConfigRef = useRef({ provider, apiKey, ollamaBaseUrl });
  clientConfigRef.current = { provider, apiKey, ollamaBaseUrl };
  const getClient = useCallback(() => createLLMClient(clientConfigRef.current), []);

  // Use a ref for the commentator model so the callback identity never changes.
  // This prevents the CommentaryQueue from being destroyed/recreated when replayMode
  // flips (which would orphan pending waitForMove promises).
  const commentatorModelRef = useRef(commentatorModel);
  commentatorModelRef.current = commentatorModel;
  const preGameNarrationActiveRef = useRef(false);
  const getCommentatorModelCb = useCallback(
    () => commentatorModelRef.current || { id: '', name: '', mode: 'oracle' as const, reasoningEffort: 'high', maxTokens: 1000, stockfishDepth: 18 },
    [],
  );

  useEffect(() => {
    console.log('[Commentary] Queue effect fired — creating new queue (replacingExisting=%s)', !!queueRef.current);
    if (queueRef.current) queueRef.current.destroy();
    const getTtsMode = () => useSettingsStore.getState().ttsEnabled;
    const getDeadAirMs = () => deadAirRef.current;
    const getFillerEnabled = () => useSettingsStore.getState().fillerEnabled && useSettingsStore.getState().ttsEnabled && !preGameNarrationActiveRef.current;
    const getAudioBacklog = () => audioBacklogRef.current;
    const getAudioPlaying = () => audioPlayingRef.current;
    const settings = useSettingsStore.getState();
    const channelInfo = settings.channelName ? {
      channelName: settings.channelName,
      website: settings.channelWebsite || undefined,
      donationUrl: settings.channelDonationUrl || undefined,
      customPlugLines: settings.channelCustomPlugLines ? settings.channelCustomPlugLines.split('\n').filter(Boolean) : undefined,
    } : undefined;
    const getPuzzleBreakEnabled = () => useSettingsStore.getState().puzzleBreakEnabled && Date.now() >= puzzleBreakBlockedUntilRef.current;
    const onPuzzleBreak = () => {
      console.log('[PuzzleBreak] Filler slot awarded to puzzle break — activating panel');
      const moveCount = useTournamentStore.getState().activeGameState?.moveHistory.length ?? 0;
      const paused = pausedPuzzleRef.current;
      puzzleTriggeredMoveCountRef.current = moveCount;
      puzzleAbortRef.current?.abort();
      puzzleAbortRef.current = new AbortController();
      setPuzzleError(null);
      setPuzzleStreamText('');
      setPuzzleThinkingText('');
      setPuzzleStreamingSide(null);
      if (paused) {
        puzzleSetupRequestStartedRef.current = !!paused.setupText;
        puzzleTurnLoopStartedRef.current = paused.turnHistory.length > 0 || paused.isComplete;
        puzzleOutroRequestStartedRef.current = !!paused.outroText;
        setPuzzleLoading(false);
        setCurrentPuzzle(paused.puzzle);
        setPuzzleIntroText(paused.introText);
        setPuzzleSetupText(paused.setupText);
        setPuzzleSetupNarrated(paused.setupNarrated);
        setPuzzleOutroText(paused.outroText);
        setPuzzleOutroNarrated(paused.outroNarrated);
        setPuzzleTurnHistory(paused.turnHistory);
        setPuzzleIsComplete(paused.isComplete);
        setPuzzlePhase(paused.phase);
        return;
      }
      setPuzzlePhase('intro');
      setPuzzleLoading(true);
      setCurrentPuzzle(null);
      setPuzzleIntroText('');
      setPuzzleSetupText('');
      setPuzzleSetupNarrated(false);
      setPuzzleOutroText('');
      setPuzzleOutroNarrated(false);
      setPuzzleTurnHistory([]);
      setPuzzleIsComplete(false);
      puzzleSetupRequestStartedRef.current = false;
      puzzleTurnLoopStartedRef.current = false;
      puzzleOutroRequestStartedRef.current = false;
    };
    const getPuzzleBreakActive = () => puzzlePhaseRef.current !== 'hidden';
    const queue = new CommentaryQueue({ getClient, getCommentatorModel: getCommentatorModelCb, getTtsMode, getDeadAirMs, getFillerEnabled, getAudioBacklog, getAudioPlaying, channelInfo, getPuzzleBreakEnabled, getPuzzleBreakActive, onPuzzleBreak, minCallIntervalMs: 10_000, maxBatchSize: 1 });
    queueRef.current = queue;
    // Register globally so the store can use waitForMove() for replay pacing
    registerCommentaryQueue(queue);

    // If a game is already in progress with no moves yet, seed dead-air tracking now.
    // This handles queue recreation (getClient dep change) after game start — the
    // game-change effect won't re-fire in that case because activeGameState didn't change.
    const existingGame = useTournamentStore.getState().activeGameState;
    if (existingGame && existingGame.moveHistory.length === 0 && existingGame.status === 'in_progress') {
      queue.seedPreMoveSnapshot({
        fen: existingGame.fen,
        whiteModel: existingGame.white.model,
        blackModel: existingGame.black.model,
        whiteReasoningEffort: existingGame.white.reasoningEffort,
        blackReasoningEffort: existingGame.black.reasoningEffort,
      });
    }
    const unsub = queue.onUpdate((entries) => {
      setCommentaryEntries(entries);

      const activeGame = useTournamentStore.getState().activeGameState;
      if (!activeGame) return;

      const currentLog = useTournamentStore.getState().commentaryLog;
      const nextLog = { ...currentLog };
      let changed = false;

      for (const entry of entries) {
        if (entry.streaming || entry.isFiller || !entry.text.trim() || entry.moves.length === 0) continue;

        const entryMoveCount = entry.moves.length;
        const maxMoveIndex = entry.maxMoveIndex;
        if (maxMoveIndex === undefined || maxMoveIndex < 0) continue;

        for (let i = 0; i < entryMoveCount; i++) {
          const moveIndex = maxMoveIndex - (entryMoveCount - 1 - i);
          if (moveIndex < 0) continue;
          if (nextLog[moveIndex] === entry.text) continue;
          nextLog[moveIndex] = entry.text;
          changed = true;
        }
      }

      if (changed) {
        useTournamentStore.setState({ commentaryLog: nextLog });
      }
    });
    return () => {
      unsub();
      queue.destroy();
      registerCommentaryQueue(null);
      // Reset refs so StrictMode remount (or real recreation) re-initializes correctly
      lastQueuedMoveCountRef.current = 0;
      gameIdRef.current = null;
    };
  }, [getClient, getCommentatorModelCb]);

  // Wire historical prompt and move-by-move narration for replay mode
  const replayHistoricalContext = useTournamentStore(s => s.replayHistoricalContext);
  useEffect(() => {
    if (!replayMode || !activeRuntime) return;
    if (queueRef.current) {
      // Replay: move-by-move commentary (batch size 1) + optional historical prompt
      queueRef.current.setMaxBatchSize(1);
      // Use model.maxTokens if set (controlled by Tokens dropdown), otherwise default to 16k.
      // No dead-air constraint in replay — we want rich commentary.
      queueRef.current.setMaxTokensOverride(commentatorModel?.maxTokens ?? 16000);
      if (replayHistoricalContext) {
        const ttsMode = useSettingsStore.getState().ttsEnabled;
        const verbosity = commentatorModel?.verbosity;
        const prompt = getHistoricalCommentatorPrompt(replayHistoricalContext, ttsMode, verbosity);
        queueRef.current.setSystemPromptOverride(prompt);
      }
    }
    return () => {
      queueRef.current?.setMaxBatchSize(undefined);
      queueRef.current?.setMaxTokensOverride(undefined);
      queueRef.current?.setSystemPromptOverride(undefined);
    };
  }, [replayMode, activeRuntime, replayHistoricalContext, commentatorModel?.verbosity, commentatorModel?.maxTokens]);

  // Reset queue on new game — identical for tournament + replay
  useEffect(() => {
    if (!activeGameState) return;
    if (activeGameState.gameId !== gameIdRef.current) {
      console.log('[Commentary] GameId changed: %s → %s (moves=%d, events=%d)', gameIdRef.current, activeGameState.gameId, activeGameState.moveHistory.length, activeGameState.eventLog.length);
      gameIdRef.current = activeGameState.gameId;
      // For replay mode, start from 0 — moves arrive via delay.
      // For resumed games, skip prior moves that already have commentary.
      // Check saved commentary to determine how many moves already have commentary.
      // If no saved commentary exists (fresh game or replay), start from 0.
      // This works identically for tournament (fresh start = 0, resume = has saved log)
      // and replay (always 0 since no saved commentary).
      const savedLog = useTournamentStore.getState().commentaryLog;
      const savedCommentaryMoveCount = getSavedCommentaryMoveCount(savedLog);
      const hasRestoredCommentary = savedCommentaryMoveCount > 0;
      const persistedQueuedMoveCount = queuedMoveCountByGameId.get(activeGameState.gameId) ?? 0;
      // In replay mode with a startFromPly offset, skip prior moves seeded into moveHistory.
      // In tournament mode, skip moves that already have saved commentary (resume case).
      const priorMoveCount = replayMode
        ? Math.max(useTournamentStore.getState().replayPriorMoveCount, persistedQueuedMoveCount)
        : Math.max(savedCommentaryMoveCount, persistedQueuedMoveCount);
      lastQueuedMoveCountRef.current = priorMoveCount;
      queueRef.current?.reset();
      queueRef.current?.notifyPuzzleBreakDismissed();
      audioPlayingRef.current = false;
      audioBacklogRef.current = 0;
      pausedPuzzleRef.current = null;
      seenPuzzleIdsRef.current = new Set();
      puzzleEvalCacheRef.current = new Map();
      puzzleBreakBlockedUntilRef.current = 0;
      puzzleAbortRef.current?.abort();
      setPuzzlePhase('hidden');
      setCurrentPuzzle(null);
      setPuzzleIntroText('');
      setPuzzleSetupText('');
      setPuzzleSetupNarrated(false);
      setPuzzleOutroText('');
      setPuzzleOutroNarrated(false);
      setPuzzleTurnHistory([]);
      setPuzzleStreamText('');
      setPuzzleThinkingText('');
      setPuzzleStreamingSide(null);
      setPuzzleIsComplete(false);
      puzzleSetupRequestStartedRef.current = false;
      puzzleTurnLoopStartedRef.current = false;
      puzzleOutroRequestStartedRef.current = false;
      setPuzzleLoading(false);
      setPuzzleError(null);
      setNarrationMoveIndex(-1);
      preGameNarrationActiveRef.current = false;

      // Seed dead-air tracking so fillers can fire before the first move arrives.
      // Without this, lastMoveSnapshot stays null and filler never starts on turn 1.
      if (priorMoveCount === 0) {
        queueRef.current?.seedPreMoveSnapshot({
          fen: activeGameState.fen,
          whiteModel: activeGameState.white.model,
          blackModel: activeGameState.black.model,
          whiteReasoningEffort: activeGameState.white.reasoningEffort,
          blackReasoningEffort: activeGameState.black.reasoningEffort,
        });
      }

      // Reconstruct commentary entries from saved commentaryLog for prior moves
      if (savedCommentaryMoveCount > 0) {
        const restoredEntries: CommentaryEntry[] = [];
        const savedMoveIndexes = Object.keys(savedLog)
          .map((key) => Number(key))
          .filter((value) => Number.isInteger(value) && value >= 0)
          .sort((a, b) => a - b);
        for (const i of savedMoveIndexes) {
          const text = savedLog[i];
          if (!text) continue;
          const m = activeGameState.moveHistory[i];
          if (!m) continue;
          restoredEntries.push({
            id: `restored-${i}`,
            moves: [{ moveNumber: m.turnNumber, move: m.move, color: m.color }],
            text,
            streaming: false,
            timestamp: Date.now(),
            maxMoveIndex: i,
          });
        }
        setCommentaryEntries(restoredEntries);
      } else {
        setCommentaryEntries([]);
      }

      // Generate intro for new games — fires while the first move is being computed.
      // Skip for resumed games (they already have commentary) and mid-game replay starts.
      if (
        queueRef.current &&
        commentatorModel?.id &&
        !hasRestoredCommentary &&
        !introGeneratedForGameIds.has(activeGameState.gameId)
      ) {
        preGameNarrationActiveRef.current = true;
        introGeneratedForGameIds.add(activeGameState.gameId);
        const white = activeGameState.white.displayName || activeGameState.white.model;
        const black = activeGameState.black.displayName || activeGameState.black.model;
        const priorPly = useTournamentStore.getState().replayPriorMoveCount;
        const created = activeGameState.eventLog.find((e: GameEvent) => e.type === 'GameCreated');
        const initialFen = created?.type === 'GameCreated' ? created.payload.initialFen : activeGameState.fen;
        const currentOpening = currentMatch?.pairs[currentMatch.currentPairIndex]?.opening;
        const openingLabel = currentOpening?.name
          ? `${currentOpening.name}${currentOpening.eco ? ` (${currentOpening.eco})` : ''}`
          : null;
        let introPrompt: string;
        let boardSetupPrompt: string | null = null;
        if (replayMode && replayHistoricalContext) {
          // Historical replay with context
          introPrompt = `You are about to narrate a famous historical chess game. ${replayHistoricalContext}\n\nSet the stage for the audience in 2-3 sentences. Build anticipation.`;
          if (priorPly === 0) {
            boardSetupPrompt = `You are looking at the opening position of a historical chess game between ${white} (White) and ${black} (Black). Initial board FEN: ${initialFen}. In 2-3 sentences, give viewers a quick board setup read: what both sides are contesting immediately, which opening tensions matter, and what to watch for in the first few moves. Keep it natural and broadcast-ready.`;
          }
        } else if (replayMode && priorPly > 0) {
          // Replay starting mid-game
          const startMove = Math.floor(priorPly / 2) + 1;
          introPrompt = `You are narrating a chess game between ${white} (White) and ${black} (Black). We're picking up the action from move ${startMove}. Briefly set the scene and welcome viewers joining mid-game.`;
        } else if (replayMode) {
          // Replay from move 1
          introPrompt = `You are about to narrate a chess game between ${white} (White) and ${black} (Black). Welcome the audience and introduce the players in 2-3 sentences.`;
          boardSetupPrompt = `The game begins from this opening position. Initial board FEN: ${initialFen}. In 2-3 sentences, give a quick setup read on the opening battle ahead: central tension, likely piece development, and the first strategic questions both sides will face. Keep it concise and spoken naturally.`;
        } else {
          // Live tournament / single game — AI vs AI
          introPrompt = `You are the host of an AI chess arena. Two language models are about to face each other on the board.\n\nWhite: ${white}\nBlack: ${black}\n\nWelcome the audience, introduce the two AI players, and build excitement for this match. Keep it punchy — 2-4 sentences.`;
          boardSetupPrompt = `The game is about to start from this opening position${openingLabel ? ` in ${openingLabel}` : ''}. Initial board FEN: ${initialFen}. Give the audience a short board-setup narration in 2-3 sentences: what both sides are fighting for immediately, the key central squares or structural tensions, and the opening themes to watch before the first move lands. Sound like a live commentator, not a textbook.`;
        }
        void (async () => {
          try {
            const prompts = boardSetupPrompt ? [introPrompt, boardSetupPrompt] : [introPrompt];
            await queueRef.current?.generateIntroSequence(prompts);
          } finally {
            preGameNarrationActiveRef.current = false;
          }
        })();
      } else {
        preGameNarrationActiveRef.current = false;
      }
    }
  }, [activeGameState?.gameId]);

  // Enqueue new moves into commentary queue (same path for tournament + replay)
  useEffect(() => {
    if (!activeGameState || !commentatorModel?.id) {
      console.log('[Commentary] Skipping enqueue: activeGameState=%s, commentatorModel=%s', !!activeGameState, commentatorModel?.id);
      return;
    }
    if (!apiKey && provider !== 'codex' && provider !== 'ollama') {
      console.log('[Commentary] Skipping enqueue: no apiKey for provider=%s', provider);
      return;
    }

    const moveCount = activeGameState.moveHistory.length;
    if (moveCount <= lastQueuedMoveCountRef.current) return;
    console.log('[Commentary] Enqueuing moves %d→%d (gameId=%s, queueExists=%s)', lastQueuedMoveCountRef.current, moveCount, activeGameState.gameId, !!queueRef.current);

    const created = activeGameState.eventLog.find((e: GameEvent) => e.type === 'GameCreated');
    const initialFen = created?.type === 'GameCreated'
      ? created.payload.initialFen
      : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const replay = new Chess(initialFen);
    const fenBeforeByMove: string[] = [];
    for (const historicalMove of activeGameState.moveHistory) {
      fenBeforeByMove.push(replay.fen());
      try {
        replay.move(historicalMove.move);
      } catch {
        // Keep best-effort reconstruction; fallback below uses the stored move FEN.
      }
    }

    // Pre-collect MoveApplied events for fast lookup by index
    const moveAppliedEvents = activeGameState.eventLog.filter((e: GameEvent) => e.type === 'MoveApplied');
    for (let i = lastQueuedMoveCountRef.current; i < moveCount; i++) {
      const move = activeGameState.moveHistory[i];
      const preMoveBestMove = evalLog[i]?.preMoveBestMove ?? undefined;
      let isCheck = false;
      let isCapture = false;
      let moveFrom = '';
      let moveTo = '';
      let moveFen = activeGameState.fen;
      // Use indexed lookup first (fast, correct for replay where events arrive in order)
      const matchedEvt = moveAppliedEvents[i];
      if (matchedEvt && matchedEvt.type === 'MoveApplied' && matchedEvt.payload.san === move.move) {
        isCheck = matchedEvt.payload.isCheck;
        isCapture = matchedEvt.payload.isCapture;
        moveFrom = matchedEvt.payload.from;
        moveTo = matchedEvt.payload.to;
        moveFen = matchedEvt.payload.fen;
      } else {
        // Fallback: reverse search (handles edge cases)
        for (let j = activeGameState.eventLog.length - 1; j >= 0; j--) {
          const evt = activeGameState.eventLog[j];
          if (evt.type === 'MoveApplied' && evt.payload.san === move.move) {
            isCheck = evt.payload.isCheck;
            isCapture = evt.payload.isCapture;
            moveFrom = evt.payload.from;
            moveTo = evt.payload.to;
            moveFen = evt.payload.fen;
            break;
          }
        }
      }
      // Check if this mover's format was downgraded (persistent session-level state)
      const moverModel = move.color === 'w' ? activeGameState.white.model : activeGameState.black.model;
      const formatDowngraded = getModelCapability(moverModel).responseFormat !== 'json_schema' ? true : undefined;
      queueRef.current?.enqueue({
        moveIndex: i,
        move: move.move,
        color: move.color,
        turnNumber: move.turnNumber,
        fenBefore: fenBeforeByMove[i] ?? moveFen,
        fen: moveFen,
        isCheck,
        isCapture,
        whiteModel: activeGameState.white.displayName,
        blackModel: activeGameState.black.displayName,
        moveHistory: activeGameState.moveHistory.slice(0, i + 1).map(m => m.move),
        stockfishEval: evalLog[i]
          ? {
              scoreCp: evalLog[i].evalCp,
              isMate: evalLog[i].isMate,
              mateIn: evalLog[i].mateIn,
              bestMove: evalLog[i].bestMove,
              pv: evalLog[i].pv,
              depth: evalLog[i].depth,
            }
          : (i === moveCount - 1 ? stockfishEval ?? undefined : undefined),
        prevEvalCp: evalLog[i]?.preMoveEvalCp ?? (i === moveCount - 1 ? prevEvalCp ?? undefined : undefined),
        preMoveBestMove,
        preMoveBestMoveSan: preMoveBestMove
          ? (uciToSan(fenBeforeByMove[i] ?? moveFen, preMoveBestMove) ?? undefined)
          : undefined,
        thinkingTimeMs: move.thinkingTimeMs,
        from: moveFrom,
        to: moveTo,
        illegalMovesAttempted: matchedEvt?.type === 'MoveApplied' ? matchedEvt.payload.illegalMovesAttempted : move.illegalMovesAttempted,
        formatDowngraded,
        whiteReasoningEffort: activeGameState.white.reasoningEffort,
        blackReasoningEffort: activeGameState.black.reasoningEffort,
      });
    }
    lastQueuedMoveCountRef.current = moveCount;
    queuedMoveCountByGameId.set(activeGameState.gameId, moveCount);
    // Reset thinking timer whenever a new move arrives
    lastMoveAtRef.current = Date.now();
    setThinkingElapsedMs(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGameState?.moveHistory.length, commentatorModel?.id, stockfishEval, prevEvalCp, evalLog, apiKey, provider]);

  // Memoized name of the model currently thinking
  const thinkingModelName = useMemo(() => {
    if (!activeGameState) return '';
    const moveCount = activeGameState.moveHistory.length;
    const color = moveCount % 2 === 0 ? 'w' : 'b';
    const cfg = color === 'w' ? activeGameState.white : activeGameState.black;
    return cfg.displayName || cfg.model;
  }, [activeGameState]);

  const thinkingReasoningEffort = useMemo(() => {
    if (!activeGameState) return 'high';
    const moveCount = activeGameState.moveHistory.length;
    const color = moveCount % 2 === 0 ? 'w' : 'b';
    const cfg = color === 'w' ? activeGameState.white : activeGameState.black;
    return cfg.reasoningEffort ?? 'high';
  }, [activeGameState]);

  const puzzleCommentaryReasoningEffort = useMemo(() => {
    return 'medium' as const;
  }, []);

  const puzzleActive = puzzlePhase !== 'hidden';

  useEffect(() => {
    if (!puzzleBreakEnabled) return;
    void prefillPuzzlePool(seenPuzzleIdsRef.current);
  }, [activeGameState?.gameId, puzzleBreakEnabled]);

  const clearPuzzleBreak = useCallback(() => {
    puzzleAbortRef.current?.abort();
    puzzleSetupRequestStartedRef.current = false;
    puzzleTurnLoopStartedRef.current = false;
    puzzleOutroRequestStartedRef.current = false;
    setPuzzlePhase('hidden');
    setCurrentPuzzle(null);
    setPuzzleIntroText('');
    setPuzzleSetupText('');
    setPuzzleSetupNarrated(false);
    setPuzzleOutroText('');
    setPuzzleOutroNarrated(false);
    setPuzzleTurnHistory([]);
    setPuzzleStreamText('');
    setPuzzleThinkingText('');
    setPuzzleStreamingSide(null);
    setPuzzleIsComplete(false);
    setPuzzleLoading(false);
    setPuzzleError(null);
    queueRef.current?.notifyPuzzleBreakDismissed();
  }, []);

  const finishPuzzleBreak = useCallback(() => {
    if (currentPuzzle?.id) seenPuzzleIdsRef.current.add(getPuzzleFamilyId(currentPuzzle.id));
    pausedPuzzleRef.current = null;
    clearPuzzleBreak();
  }, [clearPuzzleBreak, currentPuzzle?.id]);

  const pausePuzzleBreak = useCallback(() => {
    if (currentPuzzle) {
      pausedPuzzleRef.current = {
        phase: puzzlePhase === 'active' ? 'active' : 'intro',
        puzzle: currentPuzzle,
        introText: puzzleIntroText,
        setupText: puzzleSetupText,
        setupNarrated: puzzleSetupNarrated,
        outroText: puzzleOutroText,
        outroNarrated: puzzleOutroNarrated,
        turnHistory: puzzleTurnHistory,
        isComplete: puzzleIsComplete,
      };
    }
    clearPuzzleBreak();
  }, [clearPuzzleBreak, currentPuzzle, puzzleIntroText, puzzleIsComplete, puzzleOutroNarrated, puzzleOutroText, puzzlePhase, puzzleSetupNarrated, puzzleSetupText, puzzleTurnHistory]);

  // Tick thinking elapsed every second
  useEffect(() => {
    const interval = setInterval(() => {
      setThinkingElapsedMs(Date.now() - lastMoveAtRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function normalizePuzzleMove(fen: string, move: string): string | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move)) return move;
    try {
      const chess = new Chess(fen);
      return chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4]?.toLowerCase() })?.san ?? null;
    } catch {}
    return null;
  }

  function applyPuzzleMove(fen: string, move: string): { fen: string; san: string; uci: string } | null {
    try {
      const san = normalizePuzzleMove(fen, move);
      if (!san) return null;
      const chess = new Chess(fen);
      const result = chess.move(san);
      if (result) return { fen: chess.fen(), san: result.san, uci: result.from + result.to + (result.promotion ?? '') };
    } catch {}
    return null;
  }

  function puzzleSideToMove(fen: string): 'w' | 'b' {
    return fen.split(' ')[1] === 'b' ? 'b' : 'w';
  }

  function uciToSan(fen: string, uci: string): string | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;
    try {
      const chess = new Chess(fen);
      return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4]?.toLowerCase() })?.san ?? null;
    } catch {}
    return null;
  }

  function pvToSanLine(fen: string, pv: string, maxPlies = 64): string {
    const tokens = pv.trim().split(/\s+/).filter(Boolean).slice(0, maxPlies);
    if (tokens.length === 0) return '';
    try {
      const chess = new Chess(fen);
      const sans: string[] = [];
      for (const token of tokens) {
        const move = chess.move({ from: token.slice(0, 2), to: token.slice(2, 4), promotion: token[4]?.toLowerCase() });
        if (!move) break;
        sans.push(move.san);
      }
      return sans.join(' ');
    } catch {}
    return '';
  }

  function summarizeLegalMoves(fen: string): string {
    try {
      const legal = new Chess(fen).moves();
      return legal.join(', ');
    } catch {
      return '';
    }
  }

  async function evaluatePuzzleFen(fen: string, timeoutMs = 4500): Promise<EvalResult | null> {
    if (puzzleEvalCacheRef.current.has(fen)) {
      return puzzleEvalCacheRef.current.get(fen) ?? null;
    }
    try {
      const result = await Promise.race([
        getStockfishEval().evaluateQuick(fen),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      puzzleEvalCacheRef.current.set(fen, result);
      return result;
    } catch (err) {
      console.warn('[PuzzleBreak] Stockfish eval failed:', err);
      puzzleEvalCacheRef.current.set(fen, null);
      return null;
    }
  }

  function evalBenefitForSide(evalResult: EvalResult, side: 'w' | 'b'): number {
    return side === 'w' ? evalResult.scoreCp : -evalResult.scoreCp;
  }

  async function buildPuzzleOracleContext(params: {
    fen: string;
    actualMoveUci?: string;
    resultingFen?: string;
  }): Promise<string> {
    const side = puzzleSideToMove(params.fen);
    const mover = side === 'w' ? 'White' : 'Black';
    const legalMoves = summarizeLegalMoves(params.fen);
    const preEval = await evaluatePuzzleFen(params.fen);

    const lines: string[] = [
      `${mover} to move.`,
      legalMoves ? `Legal moves: ${legalMoves}` : '',
    ].filter(Boolean);

    if (!preEval) return lines.join('\n');

    const bestSan = uciToSan(params.fen, preEval.bestMove) ?? preEval.bestMove;
    const pvSan = pvToSanLine(params.fen, preEval.pv);
    lines.push(`Stockfish eval: ${formatEval(preEval)} at depth ${preEval.depth}.`);
    lines.push(`Engine best move: ${bestSan} (${preEval.bestMove}).`);
    if (pvSan) lines.push(`Principal variation: ${pvSan}.`);

    if (params.actualMoveUci && params.resultingFen) {
      const playedSan = uciToSan(params.fen, params.actualMoveUci) ?? params.actualMoveUci;
      const postEval = await evaluatePuzzleFen(params.resultingFen);
      if (postEval) {
        const cpl = Math.max(0, Math.round(evalBenefitForSide(preEval, side) - evalBenefitForSide(postEval, side)));
        lines.push(`Played move: ${playedSan} (${params.actualMoveUci}).`);
        lines.push(`Resulting eval: ${formatEval(postEval)} at depth ${postEval.depth}.`);
        lines.push(`Approximate centipawn loss versus the oracle: ${cpl}.`);
      }
    }

    return lines.join('\n');
  }

  async function buildPuzzleOutroOracleContext(puzzle: LichessPuzzle, turns: PuzzleTurn[]): Promise<string> {
    const lines: string[] = [];
    const startEval = await evaluatePuzzleFen(puzzle.fen);
    const finalFen = turns[turns.length - 1]?.fenAfter;
    const finalEval = finalFen ? await evaluatePuzzleFen(finalFen) : null;
    if (startEval) {
      const startBestSan = uciToSan(puzzle.fen, startEval.bestMove) ?? startEval.bestMove;
      const startPv = pvToSanLine(puzzle.fen, startEval.pv);
      lines.push(`Starting eval: ${formatEval(startEval)} at depth ${startEval.depth}.`);
      lines.push(`Engine best move at the start: ${startBestSan} (${startEval.bestMove}).`);
      if (startPv) lines.push(`Starting principal variation: ${startPv}.`);
    }
    if (finalEval) {
      lines.push(`Final evaluated position: ${formatEval(finalEval)} at depth ${finalEval.depth}.`);
    }
    return lines.join('\n');
  }

  function parsePuzzleOracleContext(oracleContext?: string): {
    legalMoves: string[];
    evalSummary: string | null;
    bestMove: string | null;
    pv: string | null;
    resultingEval: string | null;
    cpl: number | null;
  } {
    if (!oracleContext) {
      return { legalMoves: [], evalSummary: null, bestMove: null, pv: null, resultingEval: null, cpl: null };
    }
    const lines = oracleContext.split('\n').map(line => line.trim()).filter(Boolean);
    const legalMovesLine = lines.find(line => line.startsWith('Legal moves: '));
    const evalLine = lines.find(line => line.startsWith('Stockfish eval: ')) ?? null;
    const bestMoveLine = lines.find(line => line.startsWith('Engine best move: ')) ?? null;
    const pvLine = lines.find(line => line.startsWith('Principal variation: ')) ?? null;
    const resultingEvalLine = lines.find(line => line.startsWith('Resulting eval: ')) ?? null;
    const cplLine = lines.find(line => line.startsWith('Approximate centipawn loss versus the oracle: ')) ?? null;
    const legalMoves = legalMovesLine
      ? legalMovesLine.slice('Legal moves: '.length).split(',').map(move => move.trim()).filter(Boolean)
      : [];
    const bestMove = bestMoveLine
      ? bestMoveLine.slice('Engine best move: '.length).replace(/\s+\([a-h][1-8][a-h][1-8][qrbn]?\)\.?$/i, '').trim()
      : null;
    const pv = pvLine ? pvLine.slice('Principal variation: '.length).replace(/\.$/, '').trim() : null;
    const resultingEval = resultingEvalLine ? resultingEvalLine.slice('Resulting eval: '.length).replace(/\.$/, '').trim() : null;
    const cpl = cplLine ? Number.parseInt(cplLine.replace(/\D+/g, ''), 10) || 0 : null;
    return {
      legalMoves,
      evalSummary: evalLine ? evalLine.slice('Stockfish eval: '.length).replace(/\.$/, '').trim() : null,
      bestMove,
      pv,
      resultingEval,
      cpl,
    };
  }

  function summarizeOraclePv(pv: string | null, maxPlies = 4): string | null {
    if (!pv) return null;
    const tokens = pv.trim().split(/\s+/).filter(Boolean).slice(0, maxPlies);
    return tokens.length > 0 ? tokens.join(' ') : null;
  }

  function buildPuzzleSetupFallback(puzzle: LichessPuzzle, oracleContext?: string): string {
    const sideToMove = puzzle.fen.split(' ')[1] === 'b' ? 'Black' : 'White';
    const defendingColor = sideToMove === 'White' ? 'Black' : 'White';
    const themes = puzzle.themes.slice(0, 2).join(' and ');
    const oracle = parsePuzzleOracleContext(oracleContext);
    const altMoves = oracle.legalMoves.filter(move => move !== oracle.bestMove).slice(0, 2).join(' or ');
    const evalText = oracle.evalSummary ? ` Stockfish already likes ${sideToMove}'s chances here: ${oracle.evalSummary}.` : '';
    const bestMoveText = oracle.bestMove ? ` The engine's first choice is ${oracle.bestMove}, which tells you the position is about concrete force rather than slow maneuvering.` : '';
    const altText = altMoves ? ` Other legal tries like ${altMoves} exist, but they do not carry the same punch.` : '';
    return `${sideToMove} to move. ${themes ? `This position lives in the ${themes} family, with ${sideToMove} holding the dangerous idea and ${defendingColor} already walking a tightrope.` : `${sideToMove} has the favorable tactical idea here, and ${defendingColor} is the side under pressure.`}${evalText}${bestMoveText}${altText}`;
  }

  function buildPuzzleIntroFallback(modelName: string, reasoningEffort?: string): string {
    return `The live game is waiting on ${modelName}${reasoningEffort ? ` at ${reasoningEffort} reasoning` : ''}, so we are sliding into a quick puzzle break while the model thinks.`;
  }

  function buildPuzzleTurnFallback(
    side: 'w' | 'b',
    san: string,
    uci: string,
    isFinal: boolean,
    hostSide: 'w' | 'b',
    oracleContext?: string,
  ): string {
    const mover = side === 'w' ? 'White' : 'Black';
    const defender = side === 'w' ? 'Black' : 'White';
    const isHostMove = side === hostSide;
    const isCapture = san.includes('x');
    const isCheck = san.includes('+') || san.includes('#');
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const boardTags = from && to ? ` [arrow ${from} ${to}] [highlight ${to}]` : '';
    const oracle = parsePuzzleOracleContext(oracleContext);
    const altMoves = oracle.legalMoves.filter(move => move !== san && move !== oracle.bestMove).slice(0, 2).join(' or ');
    const evalText = oracle.resultingEval ? ` Stockfish's resulting verdict is ${oracle.resultingEval}.` : (oracle.evalSummary ? ` Stockfish had the position at ${oracle.evalSummary} going in.` : '');
    const cplText = oracle.cpl !== null
      ? oracle.cpl === 0
        ? ' It matches the engine’s top choice.'
        : ` It costs roughly ${oracle.cpl} centipawns versus the engine’s best move.`
      : '';
    const shortPv = summarizeOraclePv(oracle.pv);
    const pvText = shortPv ? ` Stockfish's practical point starts ${shortPv}, and that is where the line becomes hard to hold together for ${defender}.` : '';
    const altText = altMoves ? ` Alternatives such as ${altMoves} were available, but they were not as accurate.` : '';
    if (isFinal) {
      return `${san} is the clean payoff: ${mover} cashes in at exactly the right moment, and ${defender} is out of useful resources.${evalText}${pvText}${cplText}${boardTags}`;
    }
    if (isHostMove) {
      if (isCheck && isCapture) return `${san} is exactly the forcing move ${mover} wants here: it wins time, rips at the defensive structure, and keeps ${defender} under direct pressure.${evalText}${pvText}${altText}${cplText}${boardTags}`;
      if (isCheck) return `${san} is the tempo move that matters: ${mover} uses check to seize the initiative and herd ${defender} onto the squares this tactic is built around.${evalText}${pvText}${altText}${cplText}${boardTags}`;
      if (isCapture) return `${san} converts the pressure into something concrete: ${mover} removes a defender or loose pawn and keeps the attack rolling.${evalText}${pvText}${altText}${cplText}${boardTags}`;
      return `${san} is the positional-tactical move Stockfish wants: ${mover} improves the key piece, tightens control over the critical squares, and keeps ${defender} short on good replies.${evalText}${pvText}${altText}${cplText}${boardTags}`;
    }
    if (isCheck) return `${san} is ${mover}'s best practical resistance: it sidesteps the immediate threat, but the pressure is still flowing the wrong way.${evalText}${pvText}${altText}${cplText}${boardTags}`;
    if (isCapture) return `${san} is the defensive capture ${mover} more or less has to make, but it only reduces the damage instead of solving the deeper problem.${evalText}${pvText}${altText}${cplText}${boardTags}`;
    return `${san} is the most stubborn practical try ${mover} can find, but the tactical pressure is still with ${hostSide === 'w' ? 'White' : 'Black'}.${evalText}${pvText}${altText}${cplText}${boardTags}`;
  }

  function buildPuzzleMoveAnnotations(uci: string, side: 'w' | 'b'): BoardAnnotations {
    if (!uci || uci.length < 4) return EMPTY_ANNOTATIONS;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    return {
      arrows: [
        {
          from,
          to,
          color: side === 'w' ? 'rgba(0, 200, 83, 0.78)' : 'rgba(255, 145, 0, 0.82)',
        },
      ],
      highlights: [
        { square: from, color: side === 'w' ? 'rgba(0, 200, 83, 0.2)' : 'rgba(255, 145, 0, 0.22)' },
        { square: to, color: 'rgba(255, 214, 0, 0.6)' },
      ],
      circles: [],
    };
  }

  function buildPuzzleOutroFallback(turns: PuzzleTurn[], hostSide: 'w' | 'b', oracleContext?: string): string {
    const finalSan = turns[turns.length - 1]?.san;
    const winner = hostSide === 'w' ? 'White' : 'Black';
    const opener = turns[0]?.san;
    const oracle = parsePuzzleOracleContext(oracleContext);
    const evalText = oracle.resultingEval ? ` Stockfish closes the book on the line at ${oracle.resultingEval}.` : '';
    const shortPv = summarizeOraclePv(oracle.pv);
    const pvText = shortPv ? ` The clean engine route starts ${shortPv}.` : '';
    if (finalSan && opener) {
      return `${winner}'s idea was coherent from start to finish: ${opener} started the forcing sequence, and ${finalSan} was the clean payoff once the defense ran out of resources.${evalText}${pvText}`;
    }
    return `${winner} kept the initiative from the first critical move onward and converted the tactic cleanly once the defensive resources were exhausted.${evalText}${pvText}`;
  }

  function getPuzzleStageMaxTokens(modelMaxTokens?: number): number {
    const providerBudget = modelMaxTokens ?? 3_200;
    return Math.max(900, Math.min(providerBudget, 3_200));
  }

  async function runPuzzleStageRequest(params: {
    client: ReturnType<typeof createLLMClient>;
    abortCtrl: AbortController;
    modelId: string;
    messages: import('../llm/prompts').ChatMessage[];
    maxTokens: number;
    reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    timeoutMs: number;
    stageLabel: string;
    onText: (text: string) => void;
    onThinking: (text: string) => void;
    textTransform?: (text: string) => string;
  }): Promise<{ text: string; timedOut: boolean }> {
    const hardTimeoutMs = Math.max(params.timeoutMs * 8, params.timeoutMs + 10 * 60_000);
    const result = await runResilientTextGeneration({
      client: params.client,
      model: params.modelId,
      messages: params.messages,
      temperature: 0.8,
      responseOptions: { maxTokens: params.maxTokens, reasoningEffort: params.reasoningEffort, promptLevel: 'p0' },
      abortSignal: params.abortCtrl.signal,
      onText: (text) => params.onText(params.textTransform ? params.textTransform(text) : text),
      onThinking: params.onThinking,
      stallTimeoutMs: params.timeoutMs,
      hardTimeoutMs,
      maxAttempts: 4,
      classifyFailure: (attempt) => {
        const trimmed = attempt.text.trim();
        if (attempt.aborted) return null;
        if (attempt.error) return 'error';
        if (!trimmed) return attempt.timedOut ? 'timeout' : 'empty';
        return null;
      },
      buildRetryPlan: ({ result: attemptResult, responseOptions }) => {
        if (attemptResult.text.trim()) return undefined;
        return {
          messages: [
            ...params.messages,
            {
              role: 'user',
              content: `Your previous ${params.stageLabel.toLowerCase()} attempt produced no visible broadcast text. Retry with a shorter spoken answer and start with actual commentary immediately.`,
            },
          ],
          responseOptions: {
            ...responseOptions,
            promptLevel: 'p0',
          },
        };
      },
    });

    if ((result.timedOut || result.failureReason === 'timeout') && !result.text.trim()) {
      console.warn(`[PuzzleBreak] ${params.stageLabel} timed out (stall=${params.timeoutMs}ms, hard=${hardTimeoutMs}ms)`);
    }

    return {
      text: result.text,
      timedOut: result.timedOut || result.failureReason === 'timeout',
    };
  }

  // Stage 1: fetch the puzzle and generate the commentator intro before the popup appears.
  useEffect(() => {
    if (puzzlePhase !== 'intro') return;
    const abortCtrl = puzzleAbortRef.current;
    if (!abortCtrl || abortCtrl.signal.aborted) return;

    void (async () => {
      try {
        if (!commentatorModel?.id) throw new Error('No commentator model selected');

        const puzzle = await fetchLichessPuzzle(seenPuzzleIdsRef.current);
        if (abortCtrl.signal.aborted) return;
        setCurrentPuzzle(puzzle);
        setPuzzleLoading(false);

        const client = createLLMClient({ provider, apiKey, ollamaBaseUrl });
        const messages = buildPuzzleBreakIntroPrompt(thinkingModelName, thinkingReasoningEffort);
        const introResult = await runResilientTextGeneration({
          client,
          model: commentatorModel.id,
          messages,
          temperature: 0.8,
          responseOptions: { maxTokens: getPuzzleStageMaxTokens(commentatorModel.maxTokens), reasoningEffort: 'low', promptLevel: 'p0' },
          abortSignal: abortCtrl.signal,
          onThinking: setPuzzleThinkingText,
          stallTimeoutMs: 30000,
          hardTimeoutMs: 120000,
          maxAttempts: 3,
        });

        if (abortCtrl.signal.aborted) return;

        console.log('[PuzzleBreak] Intro ready:', puzzle.id, '| solution:', puzzle.solution.join(' '));
        setPuzzleIntroText(introResult.text.trim() || buildPuzzleIntroFallback(thinkingModelName, thinkingReasoningEffort));
        setPuzzleThinkingText('');
        setPuzzlePhase('active');
      } catch (err) {
        if (abortCtrl.signal.aborted) return;
        console.error('[PuzzleBreak] Intro error:', err);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('No eligible puzzle available from local catalog or daily fallback')) {
          puzzleBreakBlockedUntilRef.current = Date.now() + 5 * 60_000;
          console.warn('[PuzzleBreak] Source unavailable; backing off puzzle break retries for 5 minutes');
        }
        setPuzzleError(err instanceof Error ? err.message : String(err));
        setPuzzleLoading(false);
        clearPuzzleBreak();
      }
    })();
  }, [apiKey, clearPuzzleBreak, commentatorModel?.id, commentatorModel?.reasoningEffort, ollamaBaseUrl, provider, puzzlePhase, thinkingModelName, thinkingReasoningEffort]);

  // Stage 2: once the popup is open, let the commentator frame the puzzle before giving moves away.
  useEffect(() => {
    if (!currentPuzzle || !puzzleIntroText || puzzleSetupText || puzzleSetupRequestStartedRef.current) return;
    const abortCtrl = puzzleAbortRef.current;
    if (!abortCtrl || abortCtrl.signal.aborted) return;
    puzzleSetupRequestStartedRef.current = true;

    void (async () => {
      try {
        if (!commentatorModel?.id) throw new Error('No commentator model selected');

        const client = createLLMClient({ provider, apiKey, ollamaBaseUrl });
        const oracleContext = await buildPuzzleOracleContext({ fen: currentPuzzle.fen });
        const messages = buildPuzzleSetupPromptWithOracle(currentPuzzle, currentPuzzle.fen, oracleContext);

        setPuzzleStreamingSide(null);
        setPuzzleStreamText('');
        setPuzzleThinkingText('');

        const { text } = await runPuzzleStageRequest({
          client,
          abortCtrl,
          modelId: commentatorModel.id,
          messages,
          maxTokens: getPuzzleStageMaxTokens(commentatorModel.maxTokens),
          reasoningEffort: puzzleCommentaryReasoningEffort,
          timeoutMs: 90_000,
          stageLabel: 'Setup',
          onText: setPuzzleStreamText,
          onThinking: setPuzzleThinkingText,
        });

        if (abortCtrl.signal.aborted) return;

        const setupText = text.trim()
          || buildPuzzleSetupFallback(currentPuzzle, oracleContext);
        setPuzzleSetupText(setupText);
        setPuzzleStreamText('');
        setPuzzleThinkingText('');
      } catch (err) {
        if (abortCtrl.signal.aborted) return;
        console.error('[PuzzleBreak] Setup error:', err);
        setPuzzleError(err instanceof Error ? err.message : String(err));
        puzzleSetupRequestStartedRef.current = false;
      }
    })();
  }, [apiKey, commentatorModel?.id, currentPuzzle, ollamaBaseUrl, provider, puzzleIntroText, puzzleSetupText]);

  // Stage 3: once the setup text exists, start generating the puzzle line in the background.
  // Reveal still stays gated by the panel's narration clock, but we don't burn dead time
  // waiting for the full setup audio to finish before the first move starts thinking.
  useEffect(() => {
    if (!currentPuzzle || !puzzleSetupText || puzzleTurnLoopStartedRef.current) return;
    const abortCtrl = puzzleAbortRef.current;
    if (!abortCtrl || abortCtrl.signal.aborted) return;
    puzzleTurnLoopStartedRef.current = true;

    void (async () => {
      try {
        if (!commentatorModel?.id) throw new Error('No commentator model selected');

        const client = createLLMClient({ provider, apiKey, ollamaBaseUrl });
        let currentFen = puzzleTurnHistory[puzzleTurnHistory.length - 1]?.fenAfter ?? currentPuzzle.fen;
        const turns: PuzzleTurn[] = [...puzzleTurnHistory];

        for (let solutionIdx = turns.length; solutionIdx < currentPuzzle.solution.length; solutionIdx++) {
          if (abortCtrl.signal.aborted) return;

          const solutionUci = currentPuzzle.solution[solutionIdx];
          const side = puzzleSideToMove(currentFen);
          const solutionPreview = applyPuzzleMove(currentFen, solutionUci);
          const oracleContext = await buildPuzzleOracleContext({
            fen: currentFen,
            actualMoveUci: solutionPreview?.uci ?? solutionUci,
            resultingFen: solutionPreview?.fen,
          });
          const messages = buildPuzzleCommentaryTurnPromptWithOracle(currentPuzzle, currentFen, solutionIdx, turns, oracleContext);
          setPuzzleStreamingSide(side);
          setPuzzleStreamText('');
          setPuzzleThinkingText('');

          const { text, timedOut } = await runPuzzleStageRequest({
            client,
            abortCtrl,
            modelId: commentatorModel.id,
            messages,
            maxTokens: getPuzzleStageMaxTokens(commentatorModel.maxTokens),
            reasoningEffort: puzzleCommentaryReasoningEffort,
            timeoutMs: 120_000,
            stageLabel: `Turn ${solutionIdx + 1}`,
            onText: (raw) => {
              let display = raw;
              if (display.trimStart().startsWith('{')) {
                const match = display.match(/"reasoning"\s*:\s*"([\s\S]*?)(?:"|$)/);
                display = match ? match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
              }
              setPuzzleStreamText(display);
            },
            onThinking: setPuzzleThinkingText,
          });

          if (abortCtrl.signal.aborted) return;

          const parsed = parseMoveResponse({ content: text, model: commentatorModel.id, responseTimeMs: 0, finishReason: timedOut ? 'length' : 'stop' });
          const candidateMove = parsePuzzleMoves(text)[0]?.uci ?? parsed?.move ?? solutionUci;
          const solutionMoveResult = applyPuzzleMove(currentFen, solutionUci);
          const commentatorMoveResult = candidateMove ? applyPuzzleMove(currentFen, candidateMove) : null;
          const commentaryMatchesSolution = commentatorMoveResult?.uci === solutionMoveResult?.uci;
          if (candidateMove !== solutionUci) {
            if (!commentatorMoveResult) {
              console.warn(`[PuzzleBreak] Commentator move "${candidateMove}" invalid - keeping canonical solution: ${solutionUci}`);
            } else if (!commentaryMatchesSolution) {
              console.warn(
                `[PuzzleBreak] Commentator suggested alternate line "${candidateMove}" (${commentatorMoveResult.uci}) - keeping canonical solution: ${solutionUci}`,
              );
            }
          }
          const moveResult = solutionMoveResult;
          if (!commentatorMoveResult && candidateMove !== solutionUci) {
            console.warn(`[PuzzleBreak] Commentator move "${candidateMove}" invalid — falling back to solution: ${solutionUci}`);
          }
          if (!moveResult) {
            console.error(`[PuzzleBreak] Solution UCI "${solutionUci}" invalid for puzzle ${currentPuzzle.id}`);
            continue;
          }

          const rawCommentary = commentaryMatchesSolution && text.trim()
            ? text.trim()
            : buildPuzzleTurnFallback(
              side,
              moveResult.san,
              moveResult.uci,
              solutionIdx === currentPuzzle.solution.length - 1,
              currentPuzzle.fen.split(' ')[1] === 'b' ? 'b' : 'w',
              oracleContext,
            );
          const { clean: commentary, annotations } = parseAnnotations(rawCommentary, { fen: currentFen, sideToMove: side });
          const defaultAnnotations = buildPuzzleMoveAnnotations(moveResult.uci, side);
          const finalAnnotations = hasAnnotations(annotations)
            ? mergeAnnotations(defaultAnnotations, annotations)
            : defaultAnnotations;
          const turn: PuzzleTurn = {
            side,
            uci: moveResult.uci,
            san: moveResult.san,
            fenBefore: currentFen,
            fenAfter: moveResult.fen,
            commentary,
            rawCommentary,
            annotations: finalAnnotations,
          };

          turns.push(turn);
          setPuzzleTurnHistory([...turns]);
          setPuzzleStreamText('');
          setPuzzleThinkingText('');
          currentFen = moveResult.fen;
        }

        if (abortCtrl.signal.aborted) return;
        setPuzzleStreamingSide(null);
        setPuzzleStreamText('');
        setPuzzleThinkingText('');
        setPuzzleIsComplete(true);
      } catch (err) {
        if (abortCtrl.signal.aborted) return;
        console.error('[PuzzleBreak] Turn loop error:', err);
        setPuzzleError(err instanceof Error ? err.message : String(err));
        puzzleTurnLoopStartedRef.current = false;
      }
    })();
  }, [apiKey, commentatorModel?.id, commentatorModel?.maxTokens, currentPuzzle, ollamaBaseUrl, provider, puzzleCommentaryReasoningEffort, puzzleSetupText]);

  // Stage 4: once the full line is solved, generate a short outro before closing the segment.
  useEffect(() => {
    if (!currentPuzzle || !puzzleIsComplete || puzzleOutroText || puzzleOutroRequestStartedRef.current) return;
    const abortCtrl = puzzleAbortRef.current;
    if (!abortCtrl || abortCtrl.signal.aborted) return;
    puzzleOutroRequestStartedRef.current = true;

    void (async () => {
      try {
        if (!commentatorModel?.id) throw new Error('No commentator model selected');

        const client = createLLMClient({ provider, apiKey, ollamaBaseUrl });
        const oracleContext = await buildPuzzleOutroOracleContext(currentPuzzle, puzzleTurnHistory);
        const messages = buildPuzzleOutroPromptWithOracle(currentPuzzle, puzzleTurnHistory, oracleContext);

        setPuzzleStreamingSide(null);
        setPuzzleStreamText('');
        setPuzzleThinkingText('');

        const { text } = await runPuzzleStageRequest({
          client,
          abortCtrl,
          modelId: commentatorModel.id,
          messages,
          maxTokens: getPuzzleStageMaxTokens(commentatorModel.maxTokens),
          reasoningEffort: puzzleCommentaryReasoningEffort,
          timeoutMs: 90_000,
          stageLabel: 'Outro',
          onText: setPuzzleStreamText,
          onThinking: setPuzzleThinkingText,
        });

        if (abortCtrl.signal.aborted) return;

        const outroText = text.trim()
          || buildPuzzleOutroFallback(
            puzzleTurnHistory,
            currentPuzzle.fen.split(' ')[1] === 'b' ? 'b' : 'w',
            oracleContext,
          );
        setPuzzleOutroText(outroText);
        setPuzzleStreamText('');
        setPuzzleThinkingText('');
      } catch (err) {
        if (abortCtrl.signal.aborted) return;
        console.error('[PuzzleBreak] Outro error:', err);
        setPuzzleError(err instanceof Error ? err.message : String(err));
        puzzleOutroRequestStartedRef.current = false;
      }
    })();
  }, [apiKey, commentatorModel?.id, currentPuzzle, ollamaBaseUrl, provider, puzzleCommentaryReasoningEffort, puzzleIsComplete, puzzleOutroText, puzzleTurnHistory]);

  // Auto-dismiss puzzle when the waiting player makes their move
  useEffect(() => {
    if (!puzzleActive) return;
    const moveCount = activeGameState?.moveHistory.length ?? 0;
    if (moveCount > puzzleTriggeredMoveCountRef.current) {
      pausePuzzleBreak();
    }
  }, [activeGameState?.moveHistory.length, pausePuzzleBreak, puzzleActive]);

  // Cleanup on unmount
  useEffect(() => () => { puzzleAbortRef.current?.abort(); }, []);

  // --- Last move + FEN resolution ---
  let lastMove: { from: string; to: string } | undefined;
  if (activeGameState?.eventLog?.length) {
    for (let i = activeGameState.eventLog.length - 1; i >= 0; i--) {
      const evt = activeGameState.eventLog[i];
      if (evt.type === 'MoveApplied') {
        lastMove = { from: evt.payload.from, to: evt.payload.to };
        break;
      }
    }
  }

  // Board follows narration pace:
  // - TTS on: board advances when audio starts playing each entry (narrationMoveIndex)
  // - TTS off + replay: board advances when commentary finishes generating (commentaryMoveIndex)
  // - TTS off + tournament: board shows latest position (no pacing needed)
  const [commentaryMoveIndex, setCommentaryMoveIndex] = useState(-1);

  // Track commentary completion for non-TTS replay pacing
  useEffect(() => {
    if (!replayMode || ttsEnabled) return;
    const queue = queueRef.current;
    if (!queue) return;
    const unsub = queue.onUpdate(() => {
      const idx = queue.lastCommentedMoveIndex;
      setCommentaryMoveIndex(idx);
    });
    return unsub;
  }, [replayMode, ttsEnabled]);

  const effectiveMoveIndex = useMemo(() => {
    if (viewingMoveIndex !== null) return viewingMoveIndex;
    // TTS on: board always follows narrator's clock, including the frozen pre-move state (-1)
    if (ttsEnabled) return narrationMoveIndex;
    // Replay-specific: show starting position during intro, or follow commentary when TTS off
    if (replayMode) {
      if (commentaryMoveIndex >= 0) return commentaryMoveIndex;
    }
    // Default (TTS off in tournament): show latest position
    return null;
  }, [viewingMoveIndex, ttsEnabled, narrationMoveIndex, replayMode, commentaryMoveIndex]);

  const { displayFen, displayLastMove } = useMemo(() => {
    if (!activeGameState) return { displayFen: '', displayLastMove: lastMove };
    if (effectiveMoveIndex === null) return { displayFen: activeGameState.fen, displayLastMove: lastMove };
    // -1 means "before any moves" — show starting position
    if (effectiveMoveIndex < 0) {
      const created = activeGameState.eventLog.find((e: GameEvent) => e.type === 'GameCreated');
      const initialFen = created?.type === 'GameCreated' ? created.payload.initialFen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      return { displayFen: initialFen, displayLastMove: undefined };
    }

    const moveEvents = activeGameState.eventLog.filter((e: GameEvent) => e.type === 'MoveApplied');
    const target = moveEvents[effectiveMoveIndex];
    if (!target || target.type !== 'MoveApplied') return { displayFen: activeGameState.fen, displayLastMove: lastMove };

    return {
      displayFen: target.payload.fen,
      displayLastMove: { from: target.payload.from, to: target.payload.to },
    };
  }, [activeGameState, effectiveMoveIndex, lastMove]);

  // When narration controls the view, eval/turn should match the narrated position
  const displayEval = useMemo(() => {
    if (effectiveMoveIndex === null) return stockfishEval;
    const logged = evalLog[effectiveMoveIndex];
    if (!logged) return null; // No eval for this narrated position yet — don't show live eval
    return { scoreCp: logged.evalCp, isMate: logged.isMate, mateIn: logged.mateIn, bestMove: logged.bestMove, pv: logged.pv, depth: logged.depth } as typeof stockfishEval;
  }, [effectiveMoveIndex, evalLog, stockfishEval]);

  const displayTurn = useMemo(() => {
    if (!activeGameState) return 0;
    if (effectiveMoveIndex === null) return activeGameState.currentTurn;
    if (effectiveMoveIndex < 0) return 1;
    return Math.floor(effectiveMoveIndex / 2) + 1;
  }, [activeGameState, effectiveMoveIndex]);

  // Limit visible moves in move list/stats to match narrated position
  const displayMoveCount = effectiveMoveIndex !== null
    ? Math.max(0, effectiveMoveIndex + 1)
    : undefined;

  // Suppress annotations when viewer is browsing a different move
  const isViewerBrowsing = viewingMoveIndex !== null;
  const activeHighlightSquares = isViewerBrowsing ? undefined : narrationSquares;
  const activeArrows = isViewerBrowsing ? undefined : narrationArrows;
  const activeAnnotations = isViewerBrowsing ? undefined : narrationAnnotations;

  // --- Completed games for inspection ---
  const completedGamesList = useMemo(() => {
    if (!tournament) return [];
    const games: { record: TournamentGameRecord; matchIndex: number; defenderName: string; openingName?: string; openingEco?: string }[] = [];
    for (let mi = 0; mi < tournament.matches.length; mi++) {
      const m = tournament.matches[mi];
      const dName = m.config.defender.displayName.split('/').pop() || 'Defender';
      for (const pair of m.pairs) {
        for (const g of pair.games) {
          if (g) games.push({ record: g, matchIndex: mi, defenderName: dName, openingName: pair.opening?.name, openingEco: pair.opening?.eco });
        }
      }
    }
    return games;
  }, [tournament]);

  const [inspectingIndex, setInspectingIndex] = useState<number | null>(null);
  const inspectedGame = inspectingIndex !== null ? completedGamesList[inspectingIndex] : null;

  let inspectedLastMove: { from: string; to: string } | undefined;
  if (inspectedGame) {
    const log = inspectedGame.record.gameState.eventLog;
    for (let i = log.length - 1; i >= 0; i--) {
      const evt = log[i];
      if (evt.type === 'MoveApplied') {
        inspectedLastMove = { from: evt.payload.from, to: evt.payload.to };
        break;
      }
    }
  }

  const abortedGames = useTournamentStore(s => s.abortedGames);
  const resumeGame = useTournamentStore(s => s.resumeGame);

  const nextGameDescription = useMemo(() => {
    if (!tournament) return '';
    if (!currentMatch || currentMatch.status === 'completed') {
      const nextIdx = tournament.currentMatchIndex;
      if (nextIdx >= tournament.matches.length) return 'Tournament complete!';
      const next = tournament.matches[nextIdx];
      return `Next: vs ${next.config.defender.displayName.split('/').pop()}`;
    }
    const pairIdx = currentMatch.currentPairIndex;
    const pair = currentMatch.pairs[pairIdx];
    const slot = pair?.games[0] === null ? 'A' : 'B';
    const pairLabel = pair?.opening?.name || `Opening ${pairIdx + 1}`;
    return `Pair ${pairIdx + 1} (${pairLabel}), Game ${slot} — vs ${currentMatch.config.defender.displayName.split('/').pop()}`;
  }, [tournament, currentMatch]);

  // Check if the next game to play has a saved aborted state
  const nextGameResume = useMemo(() => {
    if (!tournament || !currentMatch) return null;
    const matchIdx = tournament.currentMatchIndex;
    const pairIdx = currentMatch.currentPairIndex;
    const pair = currentMatch.pairs[pairIdx];
    if (!pair) return null;

    // Check abortedGames map first (primary source after migration)
    const slotIdx = pair.games[0] === null ? 0 : 1;
    const key = `${matchIdx}-${pairIdx}-${slotIdx}`;
    if (abortedGames[key]) return abortedGames[key];

    // Fallback: check both slots in the map (handles edge cases)
    const altKey = `${matchIdx}-${pairIdx}-${slotIdx === 0 ? 1 : 0}`;
    if (abortedGames[altKey]) return abortedGames[altKey];

    // Fallback: check if pair slot itself holds an aborted game (pre-migration data)
    for (let si = 0; si < 2; si++) {
      const rec = pair.games[si as 0 | 1];
      if (rec?.gameState.result?.outcome === 'aborted' && rec.gameState.moveHistory.length > 0) {
        return {
          gameState: rec.gameState,
          matchIndex: matchIdx,
          pairIndex: pairIdx,
          slot: rec.slot,
          challengerColor: rec.challengerColor,
          openingId: rec.openingId,
          resumeAttempts: 0,
        } as import('../engine/types').AbortedGameRecord;
      }
    }

    return null;
  }, [tournament, currentMatch, abortedGames]);

  // --- Replay mode: show game layout without tournament chrome ---
  if (replayMode && activeGameState) {
    const replayWhite = activeGameState.white.displayName;
    const replayBlack = activeGameState.black.displayName;

    if (livestreamMode) {
      return (
        <div className="flex flex-col gap-4">
          <GameLayout
            gameState={activeGameState}
            displayFen={displayFen}
            lastMove={displayLastMove}
            commentaryEntries={commentaryEntries}
            commentatorModelName={commentatorModel?.id ? commentatorModel.name : undefined}
            stockfishEval={displayEval}
            streamingText={streamingText}
            streamingModel={streamingModel}
            viewingMoveIndex={viewingMoveIndex}
            setViewingMoveIndex={setViewingMoveIndex}
            displayTurn={displayTurn}
            displayMoveCount={displayMoveCount}
            livestreamMode
            onToggleLivestream={() => setLivestreamMode(false)}
            onNarrationStart={handleNarrationStart}
            onNarrationSquares={handleNarrationSquares}
            highlightSquares={narrationSquares}
            arrows={narrationArrows}
            boardAnnotations={narrationAnnotations}
            deadAirRef={deadAirRef}
            audioBacklogRef={audioBacklogRef}
            audioPlayingRef={audioPlayingRef}
            onAudioDrained={handleAudioDrained}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {/* Replay header */}
        <div className="bg-surface-1 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              Replay: {replayWhite} vs {replayBlack}
            </h2>
            <p className="text-sm text-text-muted">
              {activeGameState.moveHistory.length} moves played
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLivestreamMode(true)}
              className="px-3 py-1.5 rounded text-xs font-medium bg-purple-dim text-purple-light hover:bg-purple-accent hover:text-white transition-colors"
            >
              Livestream
            </button>
            <button
              type="button"
              onClick={stopReplay}
              className="px-3 py-1.5 bg-error/20 text-error hover:bg-error/30 rounded text-xs font-medium transition-colors"
            >
              Stop
            </button>
          </div>
        </div>

        <GameLayout
          gameState={activeGameState}
          displayFen={displayFen}
          lastMove={displayLastMove}
          commentaryEntries={commentaryEntries}
          commentatorModelName={commentatorModel?.id ? commentatorModel.name : undefined}
          stockfishEval={displayEval}
          streamingText={streamingText}
          streamingModel={streamingModel}
          viewingMoveIndex={viewingMoveIndex}
          setViewingMoveIndex={setViewingMoveIndex}
          displayTurn={displayTurn}
            displayMoveCount={displayMoveCount}
          onNarrationStart={handleNarrationStart}
          onNarrationSquares={handleNarrationSquares}
          highlightSquares={activeHighlightSquares}
          arrows={activeArrows}
          boardAnnotations={activeAnnotations}
          deadAirRef={deadAirRef}
          audioBacklogRef={audioBacklogRef}
          audioPlayingRef={audioPlayingRef}
          onAudioDrained={handleAudioDrained}
        />
      </div>
    );
  }

  if (!tournament) return null;

  // In livestream mode with an active game, show only the game layout
  if (livestreamMode && activeGameState) {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative">
          <GameLayout
            gameState={activeGameState}
            displayFen={displayFen}
            lastMove={displayLastMove}
            commentaryEntries={commentaryEntries}
            commentatorModelName={commentatorModel?.id ? commentatorModel.name : undefined}
            stockfishEval={displayEval}
            streamingText={streamingText}
            streamingModel={streamingModel}
            viewingMoveIndex={viewingMoveIndex}
            setViewingMoveIndex={setViewingMoveIndex}
            displayTurn={displayTurn}
              displayMoveCount={displayMoveCount}
            livestreamMode
            onToggleLivestream={() => setLivestreamMode(false)}
            onNarrationStart={handleNarrationStart}
            onNarrationSquares={handleNarrationSquares}
            highlightSquares={activeHighlightSquares}
            arrows={activeArrows}
            boardAnnotations={activeAnnotations}
            deadAirRef={deadAirRef}
            audioBacklogRef={audioBacklogRef}
            audioPlayingRef={audioPlayingRef}
            onAudioDrained={handleAudioDrained}
          />
          <PuzzleBreakPanel
            phase={puzzlePhase}
            puzzle={currentPuzzle}
            commentatorName={commentatorModel?.name ?? 'Commentator'}
            thinkingModelName={thinkingModelName}
            thinkingReasoningEffort={thinkingReasoningEffort}
            elapsedMs={thinkingElapsedMs}
            introText={puzzleIntroText}
            setupText={puzzleSetupText}
            setupNarrated={puzzleSetupNarrated}
            outroText={puzzleOutroText}
            outroNarrated={puzzleOutroNarrated}
            turnHistory={puzzleTurnHistory}
            streamingText={puzzleStreamText}
            thinkingText={puzzleThinkingText}
            streamingSide={puzzleStreamingSide}
            isComplete={puzzleIsComplete}
            isLoading={puzzleLoading}
            error={puzzleError}
            onIntroComplete={() => setPuzzlePhase('active')}
            onSetupComplete={() => setPuzzleSetupNarrated(true)}
            onOutroComplete={() => setPuzzleOutroNarrated(true)}
            onCommentaryComplete={finishPuzzleBreak}
            onDismiss={finishPuzzleBreak}
          />
        </div>
        <InfoBanner
          white={activeGameState.white}
          black={activeGameState.black}
          thinkingModel={thinkingModelName}
          thinkingElapsedMs={thinkingElapsedMs}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-surface-1 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">
            Gauntlet: {challengerName}
          </h2>
          <p className="text-sm text-text-muted">
            Match {Math.min(tournament.currentMatchIndex + 1, tournament.matches.length)}/{tournament.matches.length}
            {' \u00B7 '}{totalGamesPlayed} games played
            {' \u00B7 '}{completedMatches} matches complete
          </p>
          {/* Inline commentator control */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-muted">Commentator:</span>
            {showCommentatorPicker ? (
              <div className="w-64">
                <ModelSelector
                  label=""
                  value={commentatorModel?.id || ''}
                  onChange={(id, name) => {
                    setCommentatorModel({
                      ...(commentatorModel || {
                        mode: 'oracle',
                        reasoningEffort: 'high',
                        maxTokens: 1000,
                        stockfishDepth: 18,
                      }),
                      id,
                      name,
                    });
                    setShowCommentatorPicker(false);
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowCommentatorPicker(true)}
                className="text-xs text-purple-light hover:text-purple-accent transition-colors"
              >
                {commentatorModel?.name?.split('/').pop() || 'Off'}
              </button>
            )}
            {commentatorModel && (
              <button
                onClick={() => { setCommentatorModel(undefined); setShowCommentatorPicker(false); }}
                className="text-xs text-text-muted hover:text-error transition-colors"
                title="Disable commentary"
              >
                x
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {tournament.status === 'paused' && (
            <>
              <button
                onClick={() => handleResumeTournament(false)}
                className="px-4 py-2 bg-purple-accent text-white rounded text-sm font-medium hover:bg-purple-accent/80"
              >
                Resume
              </button>
              <button
                onClick={() => handleResumeTournament(true)}
                className="px-4 py-2 bg-surface-2 text-text-primary rounded text-sm font-medium hover:bg-surface-3"
              >
                Resume Stream
              </button>
            </>
          )}
          {tournament.status === 'running' && !waitingForStart && (
            <button
              onClick={pauseTournament}
              className="px-4 py-2 bg-surface-2 text-text-primary rounded text-sm font-medium hover:bg-surface-3"
            >
              Pause
            </button>
          )}
          {(tournament.status === 'running' || tournament.status === 'paused') && (
            <button
              onClick={abortTournament}
              className="px-4 py-2 bg-error/20 text-error rounded text-sm font-medium hover:bg-error/30"
            >
              Abort
            </button>
          )}
          {(tournament.status === 'running' || tournament.status === 'paused') && (
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(e) => setAutoPlay(e.target.checked)}
                className="accent-purple-accent w-4 h-4"
              />
              <span className="text-xs text-text-secondary">Auto-play</span>
            </label>
          )}
        </div>
      </div>

      {/* Resume Game Banner */}
      {waitingForStart && activeRuntime && tournament.status === 'running' && (
        <div className="bg-purple-dim/30 border border-purple-accent/30 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-text-secondary">A game is still in progress.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLivestreamMode(false);
                goToMatch(tournament.currentMatchIndex);
              }}
              className="px-6 py-2 bg-purple-accent text-white rounded-lg font-semibold text-sm hover:bg-purple-accent/80 transition-colors"
            >
              Resume Game
            </button>
            <button
              onClick={() => {
                setLivestreamMode(true);
                goToMatch(tournament.currentMatchIndex);
              }}
              className="px-6 py-2 bg-surface-2 text-text-primary rounded-lg font-semibold text-sm hover:bg-surface-3 transition-colors"
            >
              Resume Stream
            </button>
          </div>
        </div>
      )}

      {/* Manual Start Button + Game Inspector */}
      {waitingForStart && !activeRuntime && tournament.status === 'running' && currentMatch && (
        <div className="bg-surface-1 rounded-lg p-6 flex flex-col items-center gap-4">
          <p className="text-sm text-text-secondary">{nextGameDescription}</p>

          {/* Resume banner for aborted games */}
          {nextGameResume && (
            <div className="w-full bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-yellow-400 font-medium">Game aborted at move {nextGameResume.gameState.moveHistory.length}</span>
                <span className="text-text-muted ml-2">
                  ({nextGameResume.resumeAttempts > 0 ? `${nextGameResume.resumeAttempts} resume attempt(s)` : 'can resume'})
                </span>
              </div>
              <button
                onClick={() => {
                  setLivestreamMode(false);
                  const slotIdx: 0 | 1 = nextGameResume.slot === 'a' ? 0 : 1;
                  resumeGame(nextGameResume.matchIndex, nextGameResume.pairIndex, slotIdx);
                  handleStartNextGame(false);
                }}
                className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded font-semibold text-sm hover:bg-yellow-500/30 transition-colors"
              >
                Resume from move {nextGameResume.gameState.moveHistory.length}
              </button>
              <button
                onClick={() => {
                  setLivestreamMode(true);
                  const slotIdx: 0 | 1 = nextGameResume.slot === 'a' ? 0 : 1;
                  resumeGame(nextGameResume.matchIndex, nextGameResume.pairIndex, slotIdx);
                  handleStartNextGame(true);
                }}
                className="px-4 py-2 bg-surface-2 text-text-primary rounded font-semibold text-sm hover:bg-surface-3 transition-colors"
              >
                Resume Stream
              </button>
            </div>
          )}

          <div className="flex gap-3 items-center">
            <button
              onClick={() => handleStartNextGame(false)}
              className="px-8 py-3 bg-purple-accent text-white rounded-lg font-semibold text-sm hover:bg-purple-accent/80 transition-colors"
            >
              {nextGameResume ? 'Restart from Scratch' : (autoPlay ? 'Start (Auto-Play On)' : 'Start Next Game')}
            </button>
            <button
              onClick={() => handleStartNextGame(true)}
              className="px-6 py-3 bg-surface-2 text-text-primary rounded-lg font-semibold text-sm hover:bg-surface-3 transition-colors"
            >
              Start In Stream Mode
            </button>
            <button
              onClick={skipMatch}
              className="px-4 py-3 bg-surface-2 text-text-muted rounded-lg text-sm font-medium hover:bg-surface-3 hover:text-text-primary transition-colors"
              title="Skip this matchup entirely"
            >
              Skip Match
            </button>
            <label className="flex items-center gap-2 cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(e) => setAutoPlay(e.target.checked)}
                className="accent-purple-accent w-4 h-4"
              />
              <span className="text-xs text-text-secondary">Auto-play</span>
            </label>
          </div>

          {/* Game Inspector */}
          {completedGamesList.length > 0 && (
            <div className="w-full mt-2 border-t border-surface-2 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  Review Completed Games ({completedGamesList.length})
                </h3>
                {inspectingIndex !== null && (
                  <button
                    onClick={() => setInspectingIndex(null)}
                    className="text-xs text-text-muted hover:text-text-primary"
                  >
                    Close
                  </button>
                )}
              </div>

              {/* Game selector strip */}
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {completedGamesList.map((entry, i) => {
                  const gs = entry.record.gameState;
                  const r = gs.result;
                  let badge = 'bg-surface-2 text-text-muted';
                  let label = '?';
                  if (r?.outcome === 'decisive') {
                    const challengerWon = r.winner === entry.record.challengerColor;
                    badge = challengerWon ? 'bg-success/20 text-success' : 'bg-error/20 text-error';
                    label = challengerWon ? 'W' : 'L';
                  } else if (r?.outcome === 'draw') {
                    badge = 'bg-warning/20 text-warning';
                    label = 'D';
                  } else if (r?.outcome === 'aborted') {
                    badge = 'bg-surface-2 text-text-muted';
                    label = 'X';
                  }
                  const isSelected = inspectingIndex === i;
                  return (
                    <button
                      key={i}
                      onClick={() => setInspectingIndex(isSelected ? null : i)}
                      className={`flex-shrink-0 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'border-purple-accent bg-purple-dim text-purple-light'
                          : 'border-surface-2 hover:border-surface-3 bg-surface-1'
                      }`}
                    >
                      <span className="text-text-muted mr-1">#{i + 1}</span>
                      <span className={`inline-block px-1 rounded ${badge}`}>{label}</span>
                      <span className="ml-1 text-text-muted">{entry.defenderName}</span>
                    </button>
                  );
                })}
              </div>

              {inspectedGame && (
                <GameInspector game={inspectedGame.record} defenderName={inspectedGame.defenderName} challengerName={challengerName} lastMove={inspectedLastMove} openingName={inspectedGame.openingName} openingEco={inspectedGame.openingEco} />
              )}
            </div>
          )}
        </div>
      )}

      {/* No current match but skipped matches remain */}
      {!currentMatch && tournament.status === 'running' && tournament.matches.some(m => m.status === 'skipped') && (
        <div className="bg-surface-1 rounded-lg p-6 text-center">
          <p className="text-sm text-text-secondary mb-2">All sequential matches done.</p>
          <p className="text-xs text-text-muted">Click a skipped match below to play it.</p>
        </div>
      )}

      {/* Match overview strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tournament.matches.map((match, i) => (
          <MatchCard
            key={match.config.matchId}
            match={match}
            index={i}
            isCurrent={i === tournament.currentMatchIndex}
            challengerName={challengerName}
            onClick={() => goToMatch(i)}
          />
        ))}
      </div>

      {/* Skipped matches indicator */}
      {tournament.matches.some(m => m.status === 'skipped') && (
        <div className="bg-surface-1 rounded-lg px-4 py-2 text-xs text-text-muted flex items-center gap-2">
          <span className="text-warning">*</span>
          {tournament.matches.filter(m => m.status === 'skipped').length} skipped match(es) — click a match card to go back and play it
        </div>
      )}

      {/* Current match detail */}
      {currentMatch && currentMatch.status !== 'skipped' && (
        <div className="bg-surface-1 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">
            vs {currentMatch.config.defender.displayName.split('/').pop()}
          </h3>
          <div className="flex gap-3">
            {currentMatch.pairs.map((pair, i) => (
              <PairStatus
                key={i}
                pair={pair}
                pairIndex={i}
                matchIndex={tournament.currentMatchIndex}
                isActive={i === currentMatch.currentPairIndex}
                skipped={i === 2 && (currentMatch.challengerPairWins >= 2 || currentMatch.defenderPairWins >= 2)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Live game — uses shared GameLayout */}
      {activeGameState && (
        <div className="relative">
          <GameLayout
            gameState={activeGameState}
            displayFen={displayFen}
            lastMove={displayLastMove}
            commentaryEntries={commentaryEntries}
            commentatorModelName={commentatorModel?.id ? commentatorModel.name : undefined}
            stockfishEval={displayEval}
            streamingText={streamingText}
            streamingModel={streamingModel}
            viewingMoveIndex={viewingMoveIndex}
            setViewingMoveIndex={setViewingMoveIndex}
            displayTurn={displayTurn}
              displayMoveCount={displayMoveCount}
            livestreamMode={livestreamMode}
            onToggleLivestream={() => setLivestreamMode(!livestreamMode)}
            onNarrationStart={handleNarrationStart}
            onNarrationSquares={handleNarrationSquares}
            highlightSquares={activeHighlightSquares}
            arrows={activeArrows}
            boardAnnotations={activeAnnotations}
            deadAirRef={deadAirRef}
            audioBacklogRef={audioBacklogRef}
            audioPlayingRef={audioPlayingRef}
            onAudioDrained={handleAudioDrained}
          />
          <PuzzleBreakPanel
            phase={puzzlePhase}
            puzzle={currentPuzzle}
            commentatorName={commentatorModel?.name ?? 'Commentator'}
            thinkingModelName={thinkingModelName}
            thinkingReasoningEffort={thinkingReasoningEffort}
            elapsedMs={thinkingElapsedMs}
            introText={puzzleIntroText}
            setupText={puzzleSetupText}
            setupNarrated={puzzleSetupNarrated}
            outroText={puzzleOutroText}
            outroNarrated={puzzleOutroNarrated}
            turnHistory={puzzleTurnHistory}
            streamingText={puzzleStreamText}
            thinkingText={puzzleThinkingText}
            streamingSide={puzzleStreamingSide}
            isComplete={puzzleIsComplete}
            isLoading={puzzleLoading}
            error={puzzleError}
            onIntroComplete={() => setPuzzlePhase('active')}
            onSetupComplete={() => setPuzzleSetupNarrated(true)}
            onOutroComplete={() => setPuzzleOutroNarrated(true)}
            onCommentaryComplete={finishPuzzleBreak}
            onDismiss={finishPuzzleBreak}
          />
        </div>
      )}

      {/* Waiting state between games */}
      {!activeGameState && !waitingForStart && !isPaused && tournament.status === 'running' && (
        <div className="text-center py-8 text-text-muted text-sm">
          Preparing next game...
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, index, isCurrent, challengerName, onClick }: {
  match: GauntletMatchState;
  index: number;
  isCurrent: boolean;
  challengerName: string;
  onClick: () => void;
}) {
  const defenderName = match.config.defender.displayName.split('/').pop() || 'Defender';

  let statusColor = 'bg-surface-2 text-text-muted';
  let statusText = 'Pending';
  const isClickable = match.status !== 'completed';

  if (match.status === 'completed') {
    if (match.result === 'challenger_wins') {
      statusColor = 'bg-success/20 text-success';
      statusText = `${challengerName} wins`;
    } else if (match.result === 'defender_wins') {
      statusColor = 'bg-error/20 text-error';
      statusText = `${defenderName} wins`;
    } else {
      statusColor = 'bg-warning/20 text-warning';
      statusText = 'Draw';
    }
  } else if (match.status === 'skipped') {
    statusColor = 'bg-surface-2 text-warning';
    statusText = 'Skipped';
  } else if (match.status === 'in_progress') {
    statusColor = 'bg-purple-dim text-purple-light';
    statusText = `${match.challengerPairWins}-${match.defenderPairWins}`;
  }

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`flex-shrink-0 w-40 rounded-lg p-3 border transition-colors ${
        isCurrent ? 'border-purple-accent bg-surface-1' : 'border-surface-2 bg-surface-1/50'
      } ${isClickable ? 'cursor-pointer hover:border-purple-accent/50' : ''}`}
    >
      <div className="text-xs text-text-muted mb-1">Match {index + 1}</div>
      <div className="text-sm text-text-primary font-medium truncate mb-2">{defenderName}</div>
      <div className={`text-xs px-2 py-0.5 rounded text-center ${statusColor}`}>
        {statusText}
      </div>
    </div>
  );
}

function PairStatus({ pair, pairIndex, matchIndex, isActive, skipped }: {
  pair: PairRecord;
  pairIndex: number;
  matchIndex: number;
  isActive: boolean;
  skipped: boolean;
}) {
  const retryGame = useTournamentStore(s => s.retryGame);
  const resumeGame = useTournamentStore(s => s.resumeGame);
  const abortedGames = useTournamentStore(s => s.abortedGames);
  const labels = [
    pair.opening?.name || 'Opening 1',
    pair.opening?.name || 'Opening 2',
    pair.opening?.name || 'Tiebreaker',
  ];

  const gameAResult = pair.games[0]?.gameState.result;
  const gameBResult = pair.games[1]?.gameState.result;

  const gameADone = gameAResult != null;
  const gameBDone = gameBResult != null;

  const abortedA = abortedGames[`${matchIndex}-${pairIndex}-0`];
  const abortedB = abortedGames[`${matchIndex}-${pairIndex}-1`];

  return (
    <div className={`flex-1 rounded p-3 text-xs ${
      isActive ? 'bg-purple-dim/30 border border-purple-accent/30' : 'bg-surface-2/50'
    }`}>
      <div className="font-medium text-text-secondary mb-2">
        Pair {pairIndex + 1}: {labels[pairIndex]}
      </div>

      {skipped ? (
        <div className="text-text-muted">Skipped</div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <GameSlotResult label="A" result={gameAResult} isPlaying={isActive && !gameAResult && !gameBResult} />
              </div>
              {!gameADone && abortedA && (
                <button
                  onClick={() => resumeGame(matchIndex, pairIndex, 0)}
                  className="text-yellow-400 hover:text-yellow-300 transition-colors px-1"
                  title={`Resume Game A from move ${abortedA.gameState.moveHistory.length}`}
                >
                  ▶
                </button>
              )}
              {gameADone && (
                <button
                  onClick={() => retryGame(matchIndex, pairIndex, 0)}
                  className="text-text-muted hover:text-text-primary transition-colors px-1"
                  title="Restart Game A"
                >
                  ↻
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <GameSlotResult label="B" result={gameBResult} isPlaying={isActive && gameADone && !gameBResult} />
              </div>
              {!gameBDone && abortedB && (
                <button
                  onClick={() => resumeGame(matchIndex, pairIndex, 1)}
                  className="text-yellow-400 hover:text-yellow-300 transition-colors px-1"
                  title={`Resume Game B from move ${abortedB.gameState.moveHistory.length}`}
                >
                  ▶
                </button>
              )}
              {gameBDone && (
                <button
                  onClick={() => retryGame(matchIndex, pairIndex, 1)}
                  className="text-text-muted hover:text-text-primary transition-colors px-1"
                  title="Restart Game B"
                >
                  ↻
                </button>
              )}
            </div>
          </div>
          {pair.result && (
            <div className={`mt-2 text-center font-medium ${
              pair.result === 'challenger' ? 'text-success' :
              pair.result === 'defender' ? 'text-error' : 'text-text-muted'
            }`}>
              {pair.result === 'challenger' ? 'C wins' : pair.result === 'defender' ? 'D wins' : 'Drawn'}
              {' '}({pair.challengerScore}-{pair.defenderScore})
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GameInspector({ game, defenderName, challengerName, lastMove, openingName, openingEco }: {
  game: TournamentGameRecord;
  defenderName: string;
  challengerName: string;
  lastMove?: { from: string; to: string };
  openingName?: string;
  openingEco?: string;
}) {
  const gs = game.gameState;
  const r = gs.result;
  const pairLabel = `Pair ${game.pairIndex + 1}, Game ${game.slot.toUpperCase()}`;
  const cColor = game.challengerColor === 'w' ? 'White' : 'Black';

  let resultText = '';
  if (r?.outcome === 'decisive') {
    const winner = r.winner === game.challengerColor ? challengerName : defenderName;
    resultText = `${winner} wins (${r.reason})`;
  } else if (r?.outcome === 'draw') {
    resultText = `Draw (${r.reason})`;
  } else if (r?.outcome === 'aborted') {
    resultText = `Aborted: ${r.reason}`;
  }

  const duration = gs.endedAt && gs.startedAt
    ? Math.round((gs.endedAt - gs.startedAt) / 1000)
    : null;

  return (
    <div className="mt-3 bg-surface-2/30 rounded-lg p-4">
      {/* Game header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-text-primary">{pairLabel}</span>
          <span className="text-xs text-text-muted ml-2">vs {defenderName}</span>
          <span className="text-xs text-text-muted ml-2">({challengerName} as {cColor})</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {duration !== null && <span>{duration}s</span>}
          <span>{gs.moveHistory.length} moves</span>
          <span className={`font-medium ${
            r?.outcome === 'decisive' && r.winner === game.challengerColor ? 'text-success' :
            r?.outcome === 'decisive' ? 'text-error' :
            r?.outcome === 'draw' ? 'text-warning' : 'text-text-muted'
          }`}>
            {resultText}
          </span>
          <button
            onClick={() => downloadSingleGamePGN(gs, {
              event: 'LLM Chess Gauntlet',
              round: `P${game.pairIndex + 1}${game.slot.toUpperCase()}`,
              opening: openingName,
              eco: openingEco,
              challengerColor: game.challengerColor,
            })}
            className="text-purple-light hover:text-purple-accent transition-colors"
            title="Export PGN with reasoning"
          >
            PGN
          </button>
          <button
            onClick={() => downloadSingleGameJSON(gs, {
              event: 'LLM Chess Gauntlet',
              round: `P${game.pairIndex + 1}${game.slot.toUpperCase()}`,
              opening: openingName,
              eco: openingEco,
              challengerColor: game.challengerColor,
            })}
            className="text-purple-light hover:text-purple-accent transition-colors"
            title="Export full JSON with reasoning + commentary"
          >
            JSON
          </button>
        </div>
      </div>

      {/* Board + Moves */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
        <div className="flex flex-col items-center lg:items-start gap-2">
          <Graveyard eventLog={gs.eventLog} />
          <Board fen={gs.fen} lastMove={lastMove} />
        </div>
        <div className="min-w-0">
          <MoveHistory moves={gs.moveHistory} />
        </div>
      </div>
    </div>
  );
}

function GameSlotResult({ label, result, isPlaying }: {
  label: string;
  result: import('../engine/types').GameResult | undefined;
  isPlaying: boolean;
}) {
  if (isPlaying) {
    return <div className="text-purple-light">Game {label}: Playing...</div>;
  }
  if (!result) {
    return <div className="text-text-muted">Game {label}: --</div>;
  }
  if (result.outcome === 'decisive') {
    return (
      <div>
        Game {label}: <span className="text-text-primary">{result.winner === 'w' ? 'White' : 'Black'} wins</span>
        <span className="text-text-muted ml-1">({result.reason})</span>
      </div>
    );
  }
  if (result.outcome === 'draw') {
    return <div>Game {label}: <span className="text-text-muted">Draw ({result.reason})</span></div>;
  }
  return <div>Game {label}: <span className="text-warning">Aborted</span></div>;
}
