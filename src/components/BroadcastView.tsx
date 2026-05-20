import { useEffect, useRef, useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useSettingsStore } from '../store/settingsStore';
import { getBroadcastConfig } from '../app/broadcastConfig';
import { exportBridge } from '../app/exportBridge';
import { getEpisode, DEFAULT_EPISODE_ID } from '../episodes';
import { TournamentProgress } from './TournamentProgress';
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

  // PGN source resolution. Broadcast config comes from URL params and
  // never changes during a page lifetime, so we resolve once with a
  // lazy useState initializer — no effect, no cascading renders.
  const [pgnText] = useState<string | null>(() => resolvePgnSource(config).pgnText);
  const [loadError] = useState<string | null>(() => resolvePgnSource(config).error);
  const [historicalContext] = useState<string | undefined>(() => resolvePgnSource(config).historicalContext);
  const [episodeCommentatorModel] = useState<string | null>(() => resolvePgnSource(config).commentatorModel);

  const startedRef = useRef(false);
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
        } else {
          console.warn(
            '[BroadcastView] No active AudioNarrationQueue at start() — segment timings will not be recorded',
          );
        }

        startReplay(pgnText, {
          historicalContext,
          moveDelayMs: 0,
          startFromPly: 0,
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
  }, [pgnText, historicalContext, startReplay, stopReplay, replayMode]);

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

  // End flag: replay reaches a terminal status. GameStatus is a
  // discriminated union — every value except 'created' and
  // 'in_progress' is terminal.
  useEffect(() => {
    if (!activeGameState) return;
    const status = activeGameState.status;
    if (status !== 'created' && status !== 'in_progress') {
      exportBridge.__markEnded();
    }
  }, [activeGameState]);

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

  return (
    <div className="min-h-screen bg-surface-0 p-3">
      <TournamentProgress />
    </div>
  );
}

interface ResolvedPgnSource {
  pgnText: string | null;
  error: string | null;
  historicalContext: string | undefined;
  commentatorModel: string | null;
}

/**
 * Resolve a BroadcastConfig to a PGN source, historical context, and
 * episode commentator model. Pure / synchronous so it can run inside
 * a useState initializer.
 */
function resolvePgnSource(config: ReturnType<typeof getBroadcastConfig>): ResolvedPgnSource {
  if (config.rawPgn) {
    return {
      pgnText: config.rawPgn,
      error: null,
      historicalContext: undefined,
      commentatorModel: null,
    };
  }
  const episodeId = config.episodeId ?? DEFAULT_EPISODE_ID;
  if (!episodeId) {
    return {
      pgnText: null,
      error: 'No episode id supplied and no default episode is registered.',
      historicalContext: undefined,
      commentatorModel: null,
    };
  }
  const episode = getEpisode(episodeId);
  if (!episode) {
    return {
      pgnText: null,
      error: `Unknown episode id "${episodeId}". Check src/episodes/registry.ts.`,
      historicalContext: undefined,
      commentatorModel: null,
    };
  }
  return {
    pgnText: episode.pgn,
    error: null,
    historicalContext: episode.historicalContext,
    commentatorModel: episode.commentator.model,
  };
}
