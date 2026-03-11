import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useGameStore } from './store/gameStore';
import { useBenchmarkStore } from './store/benchmarkStore';
import { useSettingsStore } from './store/settingsStore';
import { ApiKeyInput } from './components/ApiKeyInput';
import { GameControls } from './components/GameControls';
import { GameLayout } from './components/GameLayout';
import { Leaderboard } from './components/Leaderboard';
import { TournamentSetup } from './components/TournamentSetup';
import { TournamentProgress } from './components/TournamentProgress';
import { TournamentResults } from './components/TournamentResults';
import { PgnImport } from './components/PgnImport';
import { useTournamentStore } from './store/tournamentStore';
import type { SavedTournament } from './engine/types';
import { CommentaryQueue, type CommentaryEntry, type QueuedMove } from './commentary/commentaryQueue';
import { createLLMClient } from './llm/client';
import { isTauri, startTtsServer, stopTtsServer } from './tauri-bridge';

type Tab = 'game' | 'leaderboard' | 'tournament' | 'replay';

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const { gameState, isRunning } = useGameStore();
  const recordGame = useBenchmarkStore(s => s.recordGame);
  const initializeBenchmark = useBenchmarkStore(s => s.initialize);
  const commentatorModel = useGameStore(s => s.commentatorModel);

  useEffect(() => {
    void initializeBenchmark();
  }, [initializeBenchmark]);

  // Auto-start TTS sidecar when running in Tauri and TTS is enabled
  const ttsEnabled = useSettingsStore(s => s.ttsEnabled);
  const ttsModel = useSettingsStore(s => s.ttsModel);
  const ttsPythonPath = useSettingsStore(s => s.ttsPythonPath);
  const ttsPort = useSettingsStore(s => s.ttsPort);

  useEffect(() => {
    if (ttsEnabled) {
      // In Tauri: launch sidecar. In browser: just health-check (server must be running externally).
      void startTtsServer({ pythonPath: ttsPythonPath, model: ttsModel, port: ttsPort })
        .then(status => {
          if (status.error && isTauri) {
            console.warn('[TTS] Auto-start issue:', status.error);
          }
        })
        .catch(err => console.warn('[TTS] Auto-start failed:', err));
    } else if (isTauri) {
      // Stop sidecar when TTS is disabled (Tauri only)
      void stopTtsServer().catch(() => {});
    }
  // Only run when TTS is toggled
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsEnabled]);

  // Record game when it ends
  const gameStatus = gameState?.status;
  const gameId = gameState?.gameId;
  const lastRecordedGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      gameState &&
      gameId &&
      gameId !== lastRecordedGameIdRef.current &&
      gameStatus &&
      gameStatus !== 'created' &&
      gameStatus !== 'in_progress' &&
      !isRunning
    ) {
      recordGame(gameState, {
        source: 'single_game',
        matchStructure: 'single',
        commentatorModel,
      });
      lastRecordedGameIdRef.current = gameId;
    }
  }, [gameState, gameStatus, gameId, isRunning, commentatorModel, recordGame]);

  // Extract last move for board highlighting
  let lastMove: { from: string; to: string } | undefined;
  if (gameState?.eventLog?.length) {
    for (let i = gameState.eventLog.length - 1; i >= 0; i--) {
      const evt = gameState.eventLog[i];
      if (evt.type === 'MoveApplied') {
        lastMove = { from: evt.payload.from, to: evt.payload.to };
        break;
      }
    }
  }

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Header */}
      <header className="border-b border-surface-2 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">LLM Chess</h1>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded">Benchmark</span>
        </div>
        <nav className="flex gap-1">
          <TabButton active={tab === 'game'} onClick={() => setTab('game')}>Game</TabButton>
          <TabButton active={tab === 'tournament'} onClick={() => setTab('tournament')}>Tournament</TabButton>
          <TabButton active={tab === 'replay'} onClick={() => setTab('replay')}>Replay</TabButton>
          <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>Leaderboard</TabButton>
        </nav>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-6">
        {tab === 'game' && <GameTab gameState={gameState} lastMove={lastMove} />}
        {tab === 'tournament' && <TournamentTab />}
        {tab === 'replay' && <ReplayTab />}
        {tab === 'leaderboard' && <Leaderboard />}
      </main>
    </div>
  );
}

function GameTab({ gameState, lastMove }: {
  gameState: import('./engine/types').GameState | null;
  lastMove?: { from: string; to: string };
}) {
  const viewingMoveIndex = useGameStore(s => s.viewingMoveIndex);
  const setViewingMoveIndex = useGameStore(s => s.setViewingMoveIndex);
  const commentatorModel = useGameStore(s => s.commentatorModel);
  const stockfishEval = useGameStore(s => s.stockfishEval);
  const prevEvalCp = useGameStore(s => s.prevEvalCp);
  const provider = useSettingsStore(s => s.provider);
  const apiKey = useSettingsStore(s => s.apiKey);
  const ollamaBaseUrl = useSettingsStore(s => s.ollamaBaseUrl);

  const [commentaryEntries, setCommentaryEntries] = useState<CommentaryEntry[]>([]);
  const queueRef = useRef<CommentaryQueue | null>(null);
  const lastQueuedMoveCountRef = useRef(0);
  const gameIdRef = useRef<string | null>(null);

  // Stable callbacks for queue config
  const getClient = useCallback(() => createLLMClient({ provider, apiKey, ollamaBaseUrl }), [provider, apiKey, ollamaBaseUrl]);
  const getCommentatorModel = useCallback(() => commentatorModel, [commentatorModel]);

  // Create queue on mount, recreate when config changes
  useEffect(() => {
    if (queueRef.current) {
      queueRef.current.destroy();
    }
    const getTtsMode = () => useSettingsStore.getState().ttsEnabled;
    const getFillerEnabled = () => useSettingsStore.getState().fillerEnabled && useSettingsStore.getState().ttsEnabled;
    const queue = new CommentaryQueue({ getClient, getCommentatorModel, getTtsMode, getFillerEnabled, minCallIntervalMs: 10_000, maxBatchSize: 1 });
    queueRef.current = queue;
    const unsub = queue.onUpdate(setCommentaryEntries);
    return () => {
      unsub();
      queue.destroy();
    };
  }, [getClient, getCommentatorModel]);

  // Reset queue on new game
  useEffect(() => {
    if (!gameState) return;
    if (gameState.gameId !== gameIdRef.current) {
      gameIdRef.current = gameState.gameId;
      lastQueuedMoveCountRef.current = 0;
      queueRef.current?.reset();
      setCommentaryEntries([]);
    }
  }, [gameState?.gameId]);

  // Enqueue new moves into the commentary queue
  useEffect(() => {
    if (!gameState || !commentatorModel.id) return;
    if (!apiKey && provider !== 'codex' && provider !== 'ollama') return;

    const moveCount = gameState.moveHistory.length;
    if (moveCount <= lastQueuedMoveCountRef.current) return;

    for (let i = lastQueuedMoveCountRef.current; i < moveCount; i++) {
      const move = gameState.moveHistory[i];

      let isCheck = false;
      let isCapture = false;
      for (let j = gameState.eventLog.length - 1; j >= 0; j--) {
        const evt = gameState.eventLog[j];
        if (evt.type === 'MoveApplied' && evt.payload.san === move.move) {
          isCheck = evt.payload.isCheck;
          isCapture = evt.payload.isCapture;
          break;
        }
      }

      const item: QueuedMove = {
        moveIndex: i,
        move: move.move,
        color: move.color,
        turnNumber: move.turnNumber,
        fen: gameState.fen,
        isCheck,
        isCapture,
        whiteModel: gameState.white.displayName,
        blackModel: gameState.black.displayName,
        moveHistory: gameState.moveHistory.slice(0, i + 1).map(m => m.move),
        stockfishEval: stockfishEval ?? undefined,
        prevEvalCp: prevEvalCp ?? undefined,
      };
      queueRef.current?.enqueue(item);
    }
    lastQueuedMoveCountRef.current = moveCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.moveHistory.length, commentatorModel.id, stockfishEval, prevEvalCp, apiKey, provider]);

  // Resolve displayed FEN and lastMove based on stepper position
  const { displayFen, displayLastMove } = useMemo(() => {
    if (!gameState) return { displayFen: '', displayLastMove: lastMove };
    if (viewingMoveIndex === null) return { displayFen: gameState.fen, displayLastMove: lastMove };

    const moveEvents = gameState.eventLog.filter((e: import('./engine/events').GameEvent) => e.type === 'MoveApplied');
    const target = moveEvents[viewingMoveIndex];
    if (!target || target.type !== 'MoveApplied') return { displayFen: gameState.fen, displayLastMove: lastMove };

    return {
      displayFen: target.payload.fen,
      displayLastMove: { from: target.payload.from, to: target.payload.to },
    };
  }, [gameState, viewingMoveIndex, lastMove]);

  return (
    <div className="flex flex-col gap-4">
      <ApiKeyInput />
      <GameControls />

      {gameState && (
        <GameLayout
          gameState={gameState}
          displayFen={displayFen}
          lastMove={displayLastMove}
          commentaryEntries={commentaryEntries}
          commentatorModelName={commentatorModel.id ? commentatorModel.name : undefined}
          stockfishEval={stockfishEval}
          viewingMoveIndex={viewingMoveIndex}
          setViewingMoveIndex={setViewingMoveIndex}
          showHumanMoveInput
          showEventLog
        />
      )}
    </div>
  );
}

function TournamentTab() {
  const tournament = useTournamentStore(s => s.tournament);
  const replayMode = useTournamentStore(s => s.replayMode);
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeTournamentId = useTournamentStore(s => s.activeTournamentId);
  const parkTournament = useTournamentStore(s => s.parkTournament);
  const loadTournament = useTournamentStore(s => s.loadTournament);
  const deleteTournament = useTournamentStore(s => s.deleteTournament);
  const renameTournament = useTournamentStore(s => s.renameTournament);
  const savedList = Object.entries(tournaments);
  const hasSaved = savedList.length > 0;

  // Show tournament list when no active tournament and there are saved tournaments
  if (!tournament && hasSaved) {
    return (
      <div className="flex flex-col gap-4">
        <TournamentList
          tournaments={tournaments}
          activeTournamentId={activeTournamentId}
          onLoad={loadTournament}
          onDelete={deleteTournament}
          onRename={renameTournament}
        />
        <TournamentSetup />
      </div>
    );
  }

  if (!tournament || tournament.status === 'setup') {
    return (
      <div className="flex flex-col gap-4">
        {hasSaved && (
          <TournamentList
            tournaments={tournaments}
            activeTournamentId={activeTournamentId}
            onLoad={loadTournament}
            onDelete={deleteTournament}
            onRename={renameTournament}
          />
        )}
        <TournamentSetup />
      </div>
    );
  }

  // Active tournament — show park button + progress/results
  const isParkable = tournament.status === 'running' || tournament.status === 'paused';
  const isCompleted = tournament.status === 'completed' || tournament.status === 'aborted';

  return (
    <div className="flex flex-col gap-4">
      {/* Park / saved tournaments bar */}
      <div className="flex items-center justify-between bg-surface-1 border border-surface-3 rounded-lg px-4 py-2">
        <span className="text-sm text-text-secondary">
          {tournaments[activeTournamentId || '']?.name || 'Active Tournament'}
        </span>
        <div className="flex items-center gap-2">
          {hasSaved && savedList.filter(([id]) => id !== activeTournamentId).length > 0 && (
            <span className="text-xs text-text-muted">
              {savedList.filter(([id]) => id !== activeTournamentId).length} parked
            </span>
          )}
          {isParkable && (
            <button
              onClick={parkTournament}
              className="px-3 py-1 text-xs bg-surface-2 hover:bg-surface-3 text-text-secondary rounded transition-colors"
            >
              Park & Switch
            </button>
          )}
        </div>
      </div>

      {isCompleted ? <TournamentResults /> : <TournamentProgress />}
    </div>
  );
}

function ReplayTab() {
  const replayMode = useTournamentStore(s => s.replayMode);

  // Active replay — show TournamentProgress which handles replay rendering
  if (replayMode) {
    return <TournamentProgress />;
  }

  return <PgnImport />;
}

function TournamentList({ tournaments, activeTournamentId, onLoad, onDelete, onRename }: {
  tournaments: Record<string, SavedTournament>;
  activeTournamentId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const entries = Object.entries(tournaments)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt);

  if (entries.length === 0) return null;

  function getStatusBadge(status: string) {
    switch (status) {
      case 'running':
      case 'paused':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300">paused</span>;
      case 'completed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">completed</span>;
      case 'aborted':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">aborted</span>;
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">{status}</span>;
    }
  }

  function getProgress(saved: SavedTournament) {
    const t = saved.state;
    const totalMatches = t.matches.length;
    const completedMatches = t.matches.filter(m => m.status === 'completed').length;
    const totalGames = t.matches.reduce((sum, m) =>
      sum + m.pairs.reduce((ps, p) => ps + (p.games[0] ? 1 : 0) + (p.games[1] ? 1 : 0), 0), 0);
    return { totalMatches, completedMatches, totalGames };
  }

  return (
    <div className="bg-surface-1 border border-surface-3 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-surface-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Saved Tournaments</h3>
        <span className="text-xs text-text-muted">{entries.length} tournament{entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-surface-2">
        {entries.map(([id, saved]) => {
          const isActive = id === activeTournamentId;
          const progress = getProgress(saved);

          return (
            <div
              key={id}
              className={`px-4 py-3 flex items-center gap-3 ${isActive ? 'bg-purple-dim/30' : 'hover:bg-surface-2/50'} transition-colors`}
            >
              {/* Name / edit */}
              <div className="flex-1 min-w-0">
                {editingId === id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          onRename(id, editName);
                          setEditingId(null);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      className="px-2 py-0.5 bg-surface-0 border border-surface-3 rounded text-sm text-text-primary flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => { onRename(id, editName); setEditingId(null); }}
                      className="text-xs text-green-400 hover:text-green-300"
                    >Save</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm text-text-primary truncate cursor-pointer hover:text-purple-light"
                      onClick={() => { setEditingId(id); setEditName(saved.name); }}
                      title="Click to rename"
                    >
                      {saved.name}
                    </span>
                    {isActive && <span className="text-xs text-purple-light">(active)</span>}
                  </div>
                )}
                <div className="text-xs text-text-muted mt-0.5">
                  Match {progress.completedMatches}/{progress.totalMatches} &middot; {progress.totalGames} games played
                </div>
              </div>

              {/* Status */}
              {getStatusBadge(saved.state.status)}

              {/* Actions */}
              <div className="flex items-center gap-1">
                {!isActive && saved.state.status !== 'completed' && (
                  <button
                    onClick={() => onLoad(id)}
                    className="px-2 py-1 text-xs bg-purple-accent/20 hover:bg-purple-accent/30 text-purple-light rounded transition-colors"
                  >
                    Load
                  </button>
                )}
                {!isActive && saved.state.status === 'completed' && (
                  <button
                    onClick={() => onLoad(id)}
                    className="px-2 py-1 text-xs bg-surface-2 hover:bg-surface-3 text-text-secondary rounded transition-colors"
                  >
                    View
                  </button>
                )}
                {confirmDeleteId === id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onDelete(id); setConfirmDeleteId(null); }}
                      className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(id)}
                    className="px-2 py-1 text-xs text-text-muted hover:text-red-300 rounded transition-colors"
                    title="Delete tournament"
                  >
                    Del
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-accent text-white'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
