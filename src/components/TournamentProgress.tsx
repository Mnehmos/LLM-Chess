import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTournamentStore, registerCommentaryQueue } from '../store/tournamentStore';
import { useSettingsStore } from '../store/settingsStore';
import { Board } from './Board';
import { MoveHistory } from './MoveHistory';
import { Graveyard } from './Graveyard';
import { GameLayout } from './GameLayout';
import { ModelSelector } from './ModelSelector';
import { downloadSingleGamePGN } from '../utils/export';
import { downloadSingleGameJSON } from '../utils/export';
import { PgnImport } from './PgnImport';
import { CommentaryQueue, type CommentaryEntry, type QueuedMove } from '../commentary/commentaryQueue';
import { createLLMClient } from '../llm/client';
import { getHistoricalCommentatorPrompt } from '../llm/prompts';
import type { GauntletMatchState, PairRecord, TournamentGameRecord } from '../engine/types';
import type { GameEvent } from '../engine/events';

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
  const setReplayCommentatorModel = useTournamentStore(s => s.setReplayCommentatorModel);
  const apiKey = useSettingsStore(s => s.apiKey);
  const provider = useSettingsStore(s => s.provider);
  const ollamaBaseUrl = useSettingsStore(s => s.ollamaBaseUrl);
  const ttsEnabled = useSettingsStore(s => s.ttsEnabled);
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

  const handleNarrationStart = useCallback((maxMoveIndex: number, moves: { from: string; to: string; color: 'w' | 'b' }[]) => {
    setNarrationMoveIndex(prev => Math.max(prev, maxMoveIndex));
    setNarrationArrows(moves);
  }, []);

  const handleNarrationSquares = useCallback((squares: string[], annotations: import('../utils/board-annotations').BoardAnnotations) => {
    setNarrationSquares(squares);
    setNarrationAnnotations(annotations);
  }, []);

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
  const getCommentatorModelCb = useCallback(
    () => commentatorModelRef.current || { id: '', name: '', mode: 'oracle' as const, reasoningEffort: 'high', maxTokens: 1000, stockfishDepth: 18 },
    [],
  );

  useEffect(() => {
    console.log('[Commentary] Queue effect fired — creating new queue (getClient changed=%s)', !!queueRef.current);
    if (queueRef.current) queueRef.current.destroy();
    const getTtsMode = () => useSettingsStore.getState().ttsEnabled;
    const getDeadAirMs = () => deadAirRef.current;
    const getFillerEnabled = () => useSettingsStore.getState().fillerEnabled && useSettingsStore.getState().ttsEnabled;
    const getAudioBacklog = () => audioBacklogRef.current;
    const settings = useSettingsStore.getState();
    const channelInfo = settings.channelName ? {
      channelName: settings.channelName,
      website: settings.channelWebsite || undefined,
      donationUrl: settings.channelDonationUrl || undefined,
      customPlugLines: settings.channelCustomPlugLines ? settings.channelCustomPlugLines.split('\n').filter(Boolean) : undefined,
    } : undefined;
    const queue = new CommentaryQueue({ getClient, getCommentatorModel: getCommentatorModelCb, getTtsMode, getDeadAirMs, getFillerEnabled, getAudioBacklog, channelInfo });
    queueRef.current = queue;
    // Register globally so the store can use waitForMove() for replay pacing
    registerCommentaryQueue(queue);
    const unsub = queue.onUpdate(setCommentaryEntries);
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
      if (replayHistoricalContext) {
        const ttsMode = useSettingsStore.getState().ttsEnabled;
        const verbosity = commentatorModel?.verbosity;
        const prompt = getHistoricalCommentatorPrompt(replayHistoricalContext, ttsMode, verbosity);
        queueRef.current.setSystemPromptOverride(prompt);
      }
    }
    return () => {
      queueRef.current?.setMaxBatchSize(undefined);
      queueRef.current?.setSystemPromptOverride(undefined);
    };
  }, [replayMode, activeRuntime, replayHistoricalContext, commentatorModel?.verbosity]);

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
      const priorMoveCount = Object.keys(savedLog).length > 0
        ? activeGameState.moveHistory.length
        : 0;
      lastQueuedMoveCountRef.current = priorMoveCount;
      queueRef.current?.reset();
      setNarrationMoveIndex(-1);

      // Reconstruct commentary entries from saved commentaryLog for prior moves
      if (priorMoveCount > 0 && Object.keys(savedLog).length > 0) {
        const restoredEntries: CommentaryEntry[] = [];
        for (let i = 0; i < priorMoveCount; i++) {
          const text = savedLog[i];
          if (!text) continue;
          const m = activeGameState.moveHistory[i];
          restoredEntries.push({
            id: `restored-${i}`,
            moves: [{ moveNumber: m.turnNumber, move: m.move, color: m.color }],
            text,
            streaming: false,
            timestamp: Date.now(),
          });
        }
        setCommentaryEntries(restoredEntries);
      } else {
        setCommentaryEntries([]);
      }

      // Generate intro for replay mode (after reset so entries aren't cleared)
      if (replayMode && queueRef.current && commentatorModel?.id) {
        const introPrompt = replayHistoricalContext
          ? `You are about to narrate a famous historical chess game. ${replayHistoricalContext}\n\nSet the stage for the audience in 2-3 sentences. Build anticipation.`
          : `A chess game is about to begin. Briefly welcome the audience.`;
        void queueRef.current.generateIntro(introPrompt);
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

    // Pre-collect MoveApplied events for fast lookup by index
    const moveAppliedEvents = activeGameState.eventLog.filter((e: GameEvent) => e.type === 'MoveApplied');
    for (let i = lastQueuedMoveCountRef.current; i < moveCount; i++) {
      const move = activeGameState.moveHistory[i];
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
      queueRef.current?.enqueue({
        moveIndex: i,
        move: move.move,
        color: move.color,
        turnNumber: move.turnNumber,
        fen: moveFen,
        isCheck,
        isCapture,
        whiteModel: activeGameState.white.displayName,
        blackModel: activeGameState.black.displayName,
        moveHistory: activeGameState.moveHistory.slice(0, i + 1).map(m => m.move),
        stockfishEval: stockfishEval ?? undefined,
        prevEvalCp: prevEvalCp ?? undefined,
        thinkingTimeMs: move.thinkingTimeMs,
        from: moveFrom,
        to: moveTo,
      });
    }
    lastQueuedMoveCountRef.current = moveCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGameState?.moveHistory.length, commentatorModel?.id, stockfishEval, prevEvalCp, apiKey, provider]);

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
    // TTS on and narration has started: board follows narrator's clock
    if (ttsEnabled && narrationMoveIndex >= 0) return narrationMoveIndex;
    // Replay-specific: show starting position during intro, or follow commentary when TTS off
    if (replayMode) {
      if (ttsEnabled) return narrationMoveIndex; // -1 for intro
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
    return { scoreCp: logged.evalCp, isMate: logged.isMate, mateIn: logged.mateIn, bestMove: logged.bestMove } as typeof stockfishEval;
  }, [effectiveMoveIndex, evalLog, stockfishEval]);

  const displayTurn = useMemo(() => {
    if (!activeGameState) return 0;
    if (effectiveMoveIndex === null) return activeGameState.currentTurn;
    if (effectiveMoveIndex < 0) return 0;
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
        />
      </div>
    );
  }

  if (!tournament) return null;

  // In livestream mode with an active game, show only the game layout
  if (livestreamMode && activeGameState) {
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
          highlightSquares={activeHighlightSquares}
          arrows={activeArrows}
          boardAnnotations={activeAnnotations}
          deadAirRef={deadAirRef}
          audioBacklogRef={audioBacklogRef}
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
            <button
              onClick={() => { resumeTournament(); startTournament({ provider, apiKey, ollamaBaseUrl }); }}
              className="px-4 py-2 bg-purple-accent text-white rounded text-sm font-medium hover:bg-purple-accent/80"
            >
              Resume
            </button>
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
          <button
            onClick={() => goToMatch(tournament.currentMatchIndex)}
            className="px-6 py-2 bg-purple-accent text-white rounded-lg font-semibold text-sm hover:bg-purple-accent/80 transition-colors"
          >
            Resume Game
          </button>
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
                  const slotIdx: 0 | 1 = nextGameResume.slot === 'a' ? 0 : 1;
                  resumeGame(nextGameResume.matchIndex, nextGameResume.pairIndex, slotIdx);
                  playNextGame({ provider, apiKey, ollamaBaseUrl });
                }}
                className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded font-semibold text-sm hover:bg-yellow-500/30 transition-colors"
              >
                Resume from move {nextGameResume.gameState.moveHistory.length}
              </button>
            </div>
          )}

          <div className="flex gap-3 items-center">
            <button
              onClick={() => playNextGame({ provider, apiKey, ollamaBaseUrl })}
              className="px-8 py-3 bg-purple-accent text-white rounded-lg font-semibold text-sm hover:bg-purple-accent/80 transition-colors"
            >
              {nextGameResume ? 'Restart from Scratch' : (autoPlay ? 'Start (Auto-Play On)' : 'Start Next Game')}
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
        />
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
