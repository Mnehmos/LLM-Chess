/**
 * window.__CHESS_EXPORT__ bridge — the handshake contract between the
 * SPA and the headless-Chromium capture pipeline (Phase 3).
 *
 * The capture pipeline does, in order:
 *
 *   1. Open the SPA with ?export=1&broadcast=1&episode=<id>
 *   2. Wait for state().ready && painted && replayReady && audioReady
 *   3. Call reset() and start()
 *   4. Stream JPEG frames via CDP Page.startScreencast
 *   5. Wait for state().ended
 *   6. Read state().segmentTimings for audio/caption alignment
 *
 * Mirrors Clio's __CLIO_EXPORT__ contract so the lifted capture
 * scaffolding (Phase 3) ports with minimal modification.
 */

export interface ExportBridgeState {
  /** SPA has mounted and parsed broadcast config. */
  ready: boolean;
  /** Page has committed at least one React render plus one rAF tick. */
  painted: boolean;
  /** Broadcast layout is active (mirrors broadcastConfig.exportMode). */
  broadcastMode: boolean;
  /** PGN parsed, ChessBoard initialized, replay runtime ready to start. */
  replayReady: boolean;
  /** AudioContext is unlocked (or TTS is disabled). */
  audioReady: boolean;
  /** GameEnded / GameAborted has fired. */
  ended: boolean;
  /**
   * Map of {moveIndex → offsetMs from start()}. Populated by
   * AudioNarrationQueue when each commentary entry's first sentence
   * begins playing. Phase 3 uses this to retime the render plan so
   * composed audio sits at the exact paint moment.
   *
   * Keyed by 0-indexed ply (matching AudioNarrationQueue's
   * maxMoveIndex). The Phase 3 export pipeline calls
   * retimeRenderPlanWithSegmentTimings(plan, segmentTimings) to map
   * these back onto plan timeline indices.
   */
  segmentTimings: Record<number, number>;
  /**
   * Render plan attached by BroadcastView when start() is called.
   * Useful for diagnostics; the capture pipeline already has the plan
   * it built before opening the page, so this field is informational.
   * Optional to keep the contract backward-compatible with Phase 1.
   */
  renderPlan?: unknown;
  /**
   * Base64-encoded webm audio recorded by AudioNarrationQueue during
   * broadcast playback. Populated after `ended` fires. The Phase 3.1
   * capture pipeline decodes this, writes it to disk, and ffmpeg-muxes
   * it onto the frame sequence to produce an MP4 with audio.
   *
   * Empty string while recording is in progress or if recording was
   * never started (TTS off). The mime type is always
   * `audio/webm;codecs=opus` (MediaRecorder default on Chromium).
   */
  recordedAudio: string;
}

/**
 * Hooks supplied by BroadcastView so the bridge can drive the replay.
 * The bridge owns the state machine; the React view owns the runtime
 * lifecycle.
 */
export interface ExportBridgeHooks {
  start: () => void;
  reset: () => void;
}

export interface ExportBridge {
  reset(): void;
  start(): void;
  state(): ExportBridgeState;
  /** Internal: BroadcastView calls this after mount. */
  __register(hooks: ExportBridgeHooks): void;
  /** Internal: rAF callback after first paint. */
  __markPainted(): void;
  /** Internal: PGN loaded + ReplayRuntime ready. */
  __markReplayReady(ready: boolean): void;
  /** Internal: AudioContext unlocked (or TTS off). */
  __markAudioReady(ready: boolean): void;
  /** Internal: GameEnded / GameAborted fired. */
  __markEnded(): void;
  /**
   * Internal: AudioNarrationQueue records per-move paint offset (the
   * moment commentary for that move began playing).
   */
  __recordSegmentTiming(moveIndex: number, offsetMs: number): void;
  /** Internal: BroadcastView attaches the render plan when start() runs. */
  __setRenderPlan(plan: unknown): void;
  /** Internal: BroadcastView stores the final recorded audio after ended. */
  __setRecordedAudio(base64: string): void;
  /** Internal: installExportBridge sets broadcastMode at boot. */
  __setBroadcastMode(value: boolean): void;
}

const state: ExportBridgeState = {
  ready: false,
  painted: false,
  broadcastMode: false,
  replayReady: false,
  audioReady: false,
  ended: false,
  segmentTimings: {},
  recordedAudio: '',
};

let hooks: ExportBridgeHooks | null = null;

export const exportBridge: ExportBridge = {
  reset() {
    state.painted = false;
    state.replayReady = false;
    state.audioReady = false;
    state.ended = false;
    state.segmentTimings = {};
    state.recordedAudio = '';
    hooks?.reset();
  },
  start() {
    if (!hooks) {
      console.warn('[__CHESS_EXPORT__] start() called before BroadcastView mounted');
      return;
    }
    hooks.start();
  },
  state() {
    // Return a shallow copy so callers can't mutate internal state.
    // segmentTimings is also cloned because it grows during playback.
    return { ...state, segmentTimings: { ...state.segmentTimings } };
  },
  __register(newHooks) {
    hooks = newHooks;
    state.ready = true;
  },
  __markPainted() {
    state.painted = true;
  },
  __markReplayReady(ready) {
    state.replayReady = ready;
  },
  __markAudioReady(ready) {
    state.audioReady = ready;
  },
  __markEnded() {
    state.ended = true;
  },
  __recordSegmentTiming(moveIndex, offsetMs) {
    state.segmentTimings[moveIndex] = offsetMs;
  },
  __setRenderPlan(plan) {
    state.renderPlan = plan;
  },
  __setRecordedAudio(base64) {
    state.recordedAudio = base64;
  },
  __setBroadcastMode(value) {
    state.broadcastMode = value;
  },
};

/**
 * Install the bridge on the window object. Called once from main.tsx
 * during boot. Skipped in non-browser contexts (SSR, test runner).
 */
export function installExportBridge(broadcastMode: boolean): void {
  if (typeof window === 'undefined') return;
  exportBridge.__setBroadcastMode(broadcastMode);
  (window as unknown as { __CHESS_EXPORT__: ExportBridge }).__CHESS_EXPORT__ = exportBridge;
}
