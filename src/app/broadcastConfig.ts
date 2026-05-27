/**
 * URL-driven broadcast mode for the MP4 export pipeline.
 *
 * The capture pipeline (Phase 3) opens the SPA with a fixed set of query
 * params and expects a deterministic, chrome-free layout that auto-plays
 * a known PGN. This module parses those params once at module load.
 *
 * The config is intentionally read-only and computed once. Re-running
 * the capture means reloading the page — there is no in-app way to
 * toggle broadcast mode.
 */

export interface BroadcastConfig {
  /** True when ?export=1 is set. Strips chrome and skips the normal tab UI. */
  exportMode: boolean;
  /** True when ?broadcast=1 is set. Disables interactive affordances. */
  broadcast: boolean;
  /** Episode id from ?episode=<id>. Resolves through CHESS_EPISODES. */
  episodeId: string | null;
  /** Raw PGN text from ?pgn=<encoded>. Bypasses the registry. */
  rawPgn: string | null;
  /**
   * Optional clip id from ?shortId=<id>. Phase 4 selects a highlight
   * range; ignored entirely in Phase 1.
   */
  shortId: string | null;
  /**
   * Optional variation id from ?variationId=<id>. Selects one of the
   * parent episode's `exports.variations` entries — its self-contained
   * PGN + lessonContext + title replace the long-form lesson for this
   * capture, while the commentator model / voice come from the parent
   * episode. Used to produce per-variation portrait Shorts on Track A.
   * Mutually exclusive with shortId (which slices the main PGN).
   */
  variationId: string | null;
  /**
   * Enable whiteboard scenes from ?whiteboard=1. When true, episodes
   * with authored `whiteboardScenes` will render those scenes as
   * full-frame overlays at the matching plies. Default off — same
   * episode renders cleanly with or without scenes.
   */
  whiteboard: boolean;
  /** Optional viewport width from ?w=<px>. Defaults to 1920. */
  viewportWidth: number | null;
  /** Optional viewport height from ?h=<px>. Defaults to 1080. */
  viewportHeight: number | null;
}

function parseFlag(params: URLSearchParams, key: string): boolean {
  const raw = params.get(key);
  if (raw === null) return false;
  return raw === '1' || raw === 'true';
}

function parsePositiveInt(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parse(): BroadcastConfig {
  if (typeof window === 'undefined') {
    return {
      exportMode: false,
      broadcast: false,
      episodeId: null,
      rawPgn: null,
      shortId: null,
      variationId: null,
      whiteboard: false,
      viewportWidth: null,
      viewportHeight: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    exportMode: parseFlag(params, 'export'),
    broadcast: parseFlag(params, 'broadcast'),
    episodeId: params.get('episode'),
    rawPgn: params.get('pgn'),
    shortId: params.get('shortId'),
    variationId: params.get('variationId'),
    whiteboard: parseFlag(params, 'whiteboard'),
    viewportWidth: parsePositiveInt(params, 'w'),
    viewportHeight: parsePositiveInt(params, 'h'),
  };
}

let cached: BroadcastConfig | null = null;

/**
 * Returns the parsed broadcast config. Parses once on first call;
 * subsequent calls return the cached value.
 */
export function getBroadcastConfig(): BroadcastConfig {
  if (!cached) cached = parse();
  return cached;
}

/** True if the current page load is a broadcast/export run. */
export function isBroadcastMode(): boolean {
  return getBroadcastConfig().exportMode;
}
