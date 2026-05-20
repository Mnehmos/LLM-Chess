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
   * Map of timeline-segment-index to milliseconds-since-start(),
   * populated by AudioNarrationQueue in Phase 2. Empty in Phase 1.
   */
  segmentTimings: Record<number, number>;
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
  /** Internal: AudioNarrationQueue records per-segment paint offset. */
  __recordSegmentTiming(segmentIndex: number, offsetMs: number): void;
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
};

let hooks: ExportBridgeHooks | null = null;

export const exportBridge: ExportBridge = {
  reset() {
    state.painted = false;
    state.replayReady = false;
    state.audioReady = false;
    state.ended = false;
    state.segmentTimings = {};
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
  __recordSegmentTiming(segmentIndex, offsetMs) {
    state.segmentTimings[segmentIndex] = offsetMs;
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
