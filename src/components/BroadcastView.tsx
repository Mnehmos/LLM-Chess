import { useEffect, useRef, useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useSettingsStore } from '../store/settingsStore';
import { getBroadcastConfig } from '../app/broadcastConfig';
import { exportBridge } from '../app/exportBridge';
import { getEpisode, DEFAULT_EPISODE_ID } from '../episodes';
import { TournamentProgress } from './TournamentProgress';
import { BroadcastLayout } from './BroadcastLayout';
import { getActiveAudioNarrationQueue } from '../tts/audio-queue';
import { createRenderPlanFromPgn, type RenderPlan } from '../production/renderPlan';

/**
 * BroadcastView — the chrome-free, auto-playing layout used by the
 * MP4 export pipeline.
 *
 * Mounted by App.tsx when ?export=1 is present. Resolves the PGN
 * source (episode id or inline pgn), registers __CHESS_EXPORT__
 * hooks, and renders TournamentProgress — which already owns the
 * full commentary queue, TTS, narration gate, and game layout
 * wiring. Reusing it avoids duplicating ~1000 lines of orchestration.
 *
 * The bridge taps the lifecycle by watching the tournament store
 * (activeGameState.status) rather than reaching into
 * TournamentProgress internals.
 */
export function BroadcastView() {
  const config = getBroadcastConfig();
  const startReplay = useTournamentStore(s => s.startReplay);
  const stopReplay = useTournamentStore(s => s.stopReplay);
  const activeGameState = useTournamentStore(s => s.activeGameState);
  const replayMode = useTournamentStore(s => s.replayMode);
  const setReplayCommentatorModel = useTournamentStore(s => s.setReplayCommentatorModel);
  const ttsEnabled = useSettingsStore(s => s.ttsEnabled);
  // Subscribed via hook so changes trigger BroadcastLayout re-renders.
  const streamingText = useTournamentStore(s => s.streamingText);
  const stockfishEval = useTournamentStore(s => s.stockfishEval);
  const commentaryLog = useTournamentStore(s => s.commentaryLog);

  // PGN source resolution. Broadcast config comes from URL params and
  // never changes during a page lifetime, so we resolve once with a
  // lazy useState initializer — no effect, no cascading renders.
  const [pgnText] = useState<string | null>(() => resolvePgnSource(config).pgnText);
  const [loadError] = useState<string | null>(() => resolvePgnSource(config).error);
  const [historicalContext] = useState<string | undefined>(() => resolvePgnSource(config).historicalContext);
  const [episodeCommentatorModel] = useState<string | null>(() => resolvePgnSource(config).commentatorModel);
  // Phase 4: resolve a short's ply range when ?shortId= is set. null
  // means "play the full game" (full-episode capture).
  const [shortRange] = useState<{ startPly: number; endPly: number; clipId: string } | null>(
    () => resolvePgnSource(config).shortRange,
  );

  const startedRef = useRef(false);
  const endedRef = useRef(false);
  const commentatorAppliedRef = useRef(false);

  // Apply the episode's commentator model id to the replay store
  // once. Reads existing config via getState() inside the effect so we
  // don't re-stomp the user's reasoning/verbosity settings on every
  // store change.
  useEffect(() => {
    if (commentatorAppliedRef.current || !episodeCommentatorModel) return;
    commentatorAppliedRef.current = true;
    const existing = useTournamentStore.getState().replayCommentatorModel;
    setReplayCommentatorModel({
      ...(existing ?? {
        id: '',
        name: '',
        mode: 'llm' as const,
        reasoningEffort: 'high' as const,
        maxTokens: 16000,
        stockfishDepth: 18,
      }),
      id: episodeCommentatorModel,
      name: episodeCommentatorModel,
      mode: 'llm',
    });
  }, [episodeCommentatorModel, setReplayCommentatorModel]);

  // Register bridge hooks so the capture pipeline can drive start/reset.
  // On start(), build a render plan from the PGN, attach it to the
  // bridge for diagnostics, mark the active audio queue's playback
  // start time, and wire the segment-start callback so each commentary
  // entry's first sentence records a paint offset.
  useEffect(() => {
    exportBridge.__register({
      start: () => {
        if (startedRef.current) {
          console.warn('[BroadcastView] start() called twice; ignoring');
          return;
        }
        if (!pgnText) {
          console.warn('[BroadcastView] start() before PGN is loaded');
          return;
        }
        startedRef.current = true;

        const config = getBroadcastConfig();
        const plan: RenderPlan = createRenderPlanFromPgn({
          id: config.episodeId ?? 'inline-pgn',
          runId: `run:${Date.now()}`,
          title: 'Broadcast capture',
          pgn: pgnText,
          episodeId: config.episodeId ?? undefined,
        });
        exportBridge.__setRenderPlan(plan);

        const audioQueue = getActiveAudioNarrationQueue();
        if (audioQueue) {
          audioQueue.markPlaybackStart(performance.now());
          audioQueue.setSegmentStartCallback((moveIndex, offsetMs) => {
            exportBridge.__recordSegmentTiming(moveIndex, offsetMs);
          });
          // Phase 3.1: tap the queue's gain node via MediaRecorder
          // so the capture pipeline can mux the rendered narration
          // into the final MP4. No-op when TTS is disabled (queue
          // never plays anything).
          audioQueue.startRecording();
        } else {
          console.warn(
            '[BroadcastView] No active AudioNarrationQueue at start() — segment timings will not be recorded',
          );
        }

        startReplay(pgnText, {
          historicalContext,
          moveDelayMs: 0,
          startFromPly: shortRange?.startPly ?? 0,
        });
      },
      reset: () => {
        startedRef.current = false;
        const audioQueue = getActiveAudioNarrationQueue();
        if (audioQueue) {
          // Disable segment-timing emission; markPlaybackStart(0)
          // sets the gate field to 0 which the queue treats as "not
          // in broadcast mode."
          audioQueue.markPlaybackStart(0);
          audioQueue.setSegmentStartCallback(null);
        }
        if (replayMode) stopReplay();
      },
    });
  }, [pgnText, historicalContext, startReplay, stopReplay, replayMode, shortRange?.startPly]);

  useEffect(() => {
    exportBridge.__markReplayReady(Boolean(pgnText) && !loadError);
  }, [pgnText, loadError]);

  // Audio readiness: when TTS is disabled the page is trivially
  // audio-ready. When TTS is enabled the AudioContext is created
  // lazily by AudioNarrationQueue on first synth; under Chromium with
  // --autoplay-policy=no-user-gesture-required (the Phase 3 launch
  // flag) this happens immediately without a user gesture, so we
  // optimistically signal ready as soon as the bridge is installed.
  useEffect(() => {
    exportBridge.__markAudioReady(true);
  }, [ttsEnabled]);

  // Paint flag: rAF after first React commit guarantees layout is on
  // screen. Mirrors Clio's painted+mapIdle gate.
  useEffect(() => {
    const id = requestAnimationFrame(() => exportBridge.__markPainted());
    return () => cancelAnimationFrame(id);
  }, []);

  // End flag: replay reaches a terminal status, OR a short capture's
  // end ply has been replayed. GameStatus is a discriminated union —
  // every value except 'created' and 'in_progress' is terminal.
  //
  // Phase 3.1: also drain the audio queue, stop the MediaRecorder,
  // and store the recorded narration on the bridge as base64 so the
  // capture pipeline can mux it into the MP4.
  useEffect(() => {
    if (!activeGameState) return;
    const status = activeGameState.status;
    const isTerminal = status !== 'created' && status !== 'in_progress';
    const shortDone = shortRange && activeGameState.moveHistory.length >= shortRange.endPly + 1;
    if (!isTerminal && !shortDone) return;

    // Once-only: the effect re-runs on every game state change, but
    // we want to flip ended (and stop the recorder) exactly once.
    if (endedRef.current) return;
    endedRef.current = true;

    void finalizeRecording().finally(() => {
      exportBridge.__markEnded();
      if (shortDone && !isTerminal) stopReplay();
    });
  }, [activeGameState, shortRange, stopReplay]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="max-w-2xl text-center p-6">
          <div className="text-red-400 text-lg font-semibold mb-2">Broadcast load error</div>
          <div className="text-text-secondary text-sm whitespace-pre-wrap">{loadError}</div>
          <div className="text-text-muted text-xs mt-4">
            URL params: episode={config.episodeId ?? '(none)'} pgn={config.rawPgn ? 'inline' : '(none)'}
          </div>
        </div>
      </div>
    );
  }

  if (!pgnText) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading PGN…</div>
      </div>
    );
  }

  // Once the replay has started, hand off to TournamentProgress which
  // already owns the full commentary/TTS/board pipeline. Before
  // start(), show a wait card so the screencast doesn't capture the
  // landing chrome.
  if (!replayMode) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="text-text-muted text-sm">Waiting for __CHESS_EXPORT__.start()…</div>
      </div>
    );
  }

  // Compose two layers:
  //
  //   1. TournamentProgress rendered OFF-SCREEN so all of its existing
  //      wiring (CommentaryQueue setup, registerNarrationGate, the
  //      AudioNarrationQueue creation in CommentaryPanel) keeps running.
  //      Reusing it avoids replicating ~1000 lines of orchestration.
  //
  //   2. BroadcastLayout rendered ON-SCREEN as the captured frame. It
  //      reads the same tournament store, so it sees every move and
  //      commentary entry, but with a layout designed for video framing
  //      (board fills the frame, no dead space, no interactive controls).
  //
  // The off-screen TournamentProgress is moved to fixed `top: -10000px`
  // so it does not intercept paint nor inflate the captured viewport.
  const lastMove = computeLastMove(activeGameState);
  const commentaryEntries = computeCommentaryEntries(activeGameState, commentaryLog);
  const episode = config.episodeId ? getEpisode(config.episodeId) : undefined;
  return (
    <>
      <div style={{ position: 'fixed', top: -10000, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden>
        <TournamentProgress />
      </div>
      <BroadcastLayout
        gameState={activeGameState ?? emptyGameStatePlaceholder()}
        liveCommentaryText={streamingText || ''}
        commentaryEntries={commentaryEntries}
        stockfishEval={stockfishEval}
        title={episode?.title ?? 'Chess Game'}
        subtitle={episode?.summary?.split('.')[0]}
        orientation={
          (config.viewportHeight ?? 1080) > (config.viewportWidth ?? 1920) ? 'short' : 'full'
        }
        lastMove={lastMove}
      />
    </>
  );
}

function computeLastMove(gameState: import('../engine/types').GameState | null): { from: string; to: string } | undefined {
  if (!gameState) return undefined;
  for (let i = gameState.eventLog.length - 1; i >= 0; i--) {
    const evt = gameState.eventLog[i];
    if (evt.type === 'MoveApplied') return { from: evt.payload.from, to: evt.payload.to };
  }
  return undefined;
}

function computeCommentaryEntries(
  gameState: import('../engine/types').GameState | null,
  commentaryLog: Record<number, string>,
): import('../commentary/commentaryQueue').CommentaryEntry[] {
  if (!gameState) return [];
  const entries: import('../commentary/commentaryQueue').CommentaryEntry[] = [];
  for (const [moveIndexRaw, text] of Object.entries(commentaryLog)) {
    const moveIndex = Number(moveIndexRaw);
    const move = gameState.moveHistory[moveIndex];
    entries.push({
      id: `bc-${moveIndex}`,
      moves: move ? [{ moveNumber: move.turnNumber, move: move.move, color: move.color }] : [],
      text,
      streaming: false,
      timestamp: 0,
      maxMoveIndex: moveIndex,
    });
  }
  entries.sort((a, b) => (a.maxMoveIndex ?? 0) - (b.maxMoveIndex ?? 0));
  return entries;
}

function emptyGameStatePlaceholder(): import('../engine/types').GameState {
  // BroadcastLayout requires a GameState even before the replay starts;
  // the activeGameState is briefly null between bridge.start() and the
  // first runtime event. This placeholder shows the starting position
  // with empty player names so the frame isn't blank.
  return {
    gameId: 'broadcast:waiting',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moveHistory: [],
    currentTurn: 1,
    currentColor: 'w',
    startedAt: Date.now(),
    eventLog: [],
    status: 'created',
    white: { id: '', color: 'w', model: '', displayName: 'White', temperature: 0, promptLevel: 'p1', outputFormat: 'A', maxRetries: 0 },
    black: { id: '', color: 'b', model: '', displayName: 'Black', temperature: 0, promptLevel: 'p1', outputFormat: 'A', maxRetries: 0 },
  } as unknown as import('../engine/types').GameState;
}

interface ResolvedPgnSource {
  pgnText: string | null;
  error: string | null;
  historicalContext: string | undefined;
  commentatorModel: string | null;
  /** When ?shortId= matches an authored clip, its ply range. Else null. */
  shortRange: { startPly: number; endPly: number; clipId: string } | null;
}

/**
 * Resolve a BroadcastConfig to a PGN source, historical context,
 * commentator model, and (Phase 4) authored-short ply range. Pure /
 * synchronous so it can run inside a useState initializer.
 */
function resolvePgnSource(config: ReturnType<typeof getBroadcastConfig>): ResolvedPgnSource {
  if (config.rawPgn) {
    return {
      pgnText: config.rawPgn,
      error: null,
      historicalContext: undefined,
      commentatorModel: null,
      shortRange: null,
    };
  }
  const episodeId = config.episodeId ?? DEFAULT_EPISODE_ID;
  if (!episodeId) {
    return {
      pgnText: null,
      error: 'No episode id supplied and no default episode is registered.',
      historicalContext: undefined,
      commentatorModel: null,
      shortRange: null,
    };
  }
  const episode = getEpisode(episodeId);
  if (!episode) {
    return {
      pgnText: null,
      error: `Unknown episode id "${episodeId}". Check src/episodes/registry.ts.`,
      historicalContext: undefined,
      commentatorModel: null,
      shortRange: null,
    };
  }
  let shortRange: ResolvedPgnSource['shortRange'] = null;
  if (config.shortId) {
    const clip = episode.exports?.shorts.find((s) => s.id === config.shortId);
    if (!clip) {
      return {
        pgnText: episode.pgn,
        error: `Unknown shortId "${config.shortId}" for episode "${episode.id}". Available: ${
          episode.exports?.shorts.map((s) => s.id).join(', ') ?? '(none)'
        }`,
        historicalContext: episode.historicalContext,
        commentatorModel: episode.commentator.model,
        shortRange: null,
      };
    }
    shortRange = {
      startPly: Math.max(0, (clip.startMoveNumber - 1) * 2),
      endPly: Math.max(0, clip.endMoveNumber * 2 - 1),
      clipId: clip.id,
    };
  }
  return {
    pgnText: episode.pgn,
    error: null,
    historicalContext: episode.historicalContext,
    commentatorModel: episode.commentator.model,
    shortRange,
  };
}

/**
 * Drain the audio queue, stop the MediaRecorder, base64-encode the
 * resulting webm blob, and store it on the export bridge.
 *
 * The audio queue's narrationGate already waits for in-flight TTS
 * synthesis before the runtime advances, but it doesn't wait for
 * the FINAL clip to finish playing — so we waitUntilDone() and add
 * a small grace window to let the last MediaRecorder chunk land
 * before stopping. Anything else risks clipping the closing
 * narration.
 *
 * No-op when TTS was disabled (audio queue's stopRecording returns
 * null because startRecording was never called effectively).
 */
async function finalizeRecording(): Promise<void> {
  const audioQueue = getActiveAudioNarrationQueue();
  if (!audioQueue) return;
  try {
    await audioQueue.waitUntilDone();
  } catch {
    // waitUntilDone() throwing means there was nothing to drain.
  }
  // Grace window for the last MediaRecorder data chunk.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const blob = await audioQueue.stopRecording();
  if (!blob || blob.size === 0) return;
  const arrayBuffer = await blob.arrayBuffer();
  // Chunked encode — String.fromCharCode.apply with a large array
  // hits the JS engine's argument count limit (262144 on V8).
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  const base64 = btoa(binary);
  exportBridge.__setRecordedAudio(base64);
}
