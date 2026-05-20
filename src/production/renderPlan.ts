/**
 * Render plan — the deterministic timeline a capture pipeline replays.
 *
 * A render plan describes every move and commentary segment of a game
 * with a planned start offset and duration. The capture pipeline opens
 * the SPA in broadcast mode, calls __CHESS_EXPORT__.start(), reads the
 * actual paint offsets back out as `segmentTimings`, then calls
 * `retimeRenderPlanWithSegmentTimings` to produce a plan whose
 * durations match what actually played.
 *
 * Shape mirrors Clio's RenderPlan / RenderTarget / TimelineItem
 * vocabulary so the lifted capture scaffolding (Phase 3) ports
 * cleanly.
 */

import { parseSinglePgn, type PgnGame, type PgnMove } from '../pgn/parser';

// ─── Types ──────────────────────────────────────────────────────────

export type TimelineItemKind = 'move' | 'commentary' | 'gap';

export interface TimelineItem {
  /** Monotonically increasing across the target's timeline. */
  index: number;
  kind: TimelineItemKind;
  /** Planned start offset within the target, in ms. */
  startMs: number;
  /** Planned duration, in ms. Re-measured by the capture pipeline. */
  durationMs: number;
  /**
   * Move index this item belongs to (0-indexed ply). Present on
   * 'move' and 'commentary' kinds; absent on 'gap'.
   */
  moveIndex?: number;
  /** SAN move text. Present on 'move' and 'commentary' kinds. */
  sanMove?: string;
  /** Color whose move this is. Present on 'move' and 'commentary' kinds. */
  color?: 'w' | 'b';
  /** FEN after the move. Present on 'move' kind. */
  fen?: string;
  /**
   * Planned commentary text. Present on 'commentary' kind in the
   * initial plan; replaced with the actual generated text after
   * playback by the export pipeline. May be empty when the plan is
   * built before commentary generation runs.
   */
  text?: string;
}

export interface Viewport {
  width: number;
  height: number;
  /** Informational, e.g. '16:9' or '9:16'. */
  aspectRatio?: string;
  deviceScaleFactor?: number;
}

export interface RenderArtifact {
  fileName: string;
  durationMs: number;
}

export type RenderTargetKind = 'full' | 'short';

export interface RenderTarget {
  id: string;
  kind: RenderTargetKind;
  viewport: Viewport;
  range: {
    startMs: number;
    endMs: number;
    /** Index of the last timeline item included. */
    endSegmentIndex: number;
  };
  timeline: TimelineItem[];
  artifact: RenderArtifact;
  outputPath: string;
  /** Phase 4 only — clip id this short was sliced from. Absent on 'full'. */
  shortId?: string;
}

export interface NarrationTiming {
  /** Per-character TTS speech rate, in ms. ~50 ms ≈ 200 wpm. */
  textMsPerChar: number;
  /** Floor duration for a commentary block. */
  textMinMs: number;
  /** Ceiling so an outlier doesn't dominate the timeline. */
  textMaxMs: number;
  /** Duration of a 'move' segment (board update, brief pause). */
  moveDurationMs: number;
  /** Duration of a 'gap' segment between move and commentary. */
  gapDurationMs: number;
}

/**
 * Default narration timing tuned for game-review pacing. Commentary
 * blocks land in the 4–18 s range; moves get ~1.5 s of board focus
 * before the narrator starts talking.
 *
 * These are PLANNED durations only — the capture pipeline replaces
 * them with measured durations via retimeRenderPlanWithSegmentTimings.
 */
export const NATURAL_NARRATION_TIMING: NarrationTiming = {
  textMsPerChar: 55,
  textMinMs: 4_000,
  textMaxMs: 18_000,
  moveDurationMs: 1_500,
  gapDurationMs: 600,
};

export interface RenderPlan {
  id: string;
  runId: string;
  /** Game-review-specific provenance: episode id when one was selected. */
  episodeId?: string;
  title: string;
  createdAt: string;
  timing: NarrationTiming;
  fullEpisode: RenderTarget;
  /** Phase 4 will populate this from detected highlight clips. */
  shorts: RenderTarget[];
  /** Original parsed game for downstream consumers (e.g. retime). */
  pgnHeaders: Record<string, string | undefined>;
  /** Optional output root used by CLI scripts. */
  outputRoot?: string;
}

// ─── Plan construction ──────────────────────────────────────────────

export interface CreateRenderPlanOptions {
  id: string;
  runId: string;
  title: string;
  pgn: string;
  episodeId?: string;
  createdAt?: string;
  timing?: NarrationTiming;
  viewport?: Viewport;
  outputRoot?: string;
  /**
   * Per-move commentary text, keyed by 0-indexed move. When provided,
   * each commentary item's `text` is filled in and the duration is
   * estimated from the character count. Otherwise commentary items
   * carry empty text and the floor duration.
   */
  commentaryByMoveIndex?: Record<number, string>;
}

/**
 * Build a RenderPlan from a PGN string.
 *
 * The resulting plan interleaves move and commentary items in board
 * order:
 *
 *   move 0 → commentary 0 → move 1 → commentary 1 → …
 *
 * A small `gap` item between move and commentary lets the board
 * update animation settle before narration starts.
 *
 * Durations are PLANNED estimates; the capture pipeline re-times the
 * plan from measured segment paint offsets after recording.
 */
export function createRenderPlanFromPgn(options: CreateRenderPlanOptions): RenderPlan {
  const timing = options.timing ?? NATURAL_NARRATION_TIMING;
  const viewport: Viewport = options.viewport ?? {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    deviceScaleFactor: 1,
  };
  const createdAt = options.createdAt ?? new Date().toISOString();
  const game = parseSinglePgn(options.pgn);

  const timeline: TimelineItem[] = [];
  let cursor = 0;
  let index = 0;
  game.moves.forEach((move, moveIndex) => {
    const moveItem: TimelineItem = {
      index: index++,
      kind: 'move',
      startMs: cursor,
      durationMs: timing.moveDurationMs,
      moveIndex,
      sanMove: move.san,
      color: move.color,
      fen: move.fen,
    };
    timeline.push(moveItem);
    cursor += moveItem.durationMs;

    const gapItem: TimelineItem = {
      index: index++,
      kind: 'gap',
      startMs: cursor,
      durationMs: timing.gapDurationMs,
    };
    timeline.push(gapItem);
    cursor += gapItem.durationMs;

    const text = options.commentaryByMoveIndex?.[moveIndex] ?? '';
    const commentaryItem: TimelineItem = {
      index: index++,
      kind: 'commentary',
      startMs: cursor,
      durationMs: estimateCommentaryDurationMs(text, timing),
      moveIndex,
      sanMove: move.san,
      color: move.color,
      text,
    };
    timeline.push(commentaryItem);
    cursor += commentaryItem.durationMs;
  });

  const lastItem = timeline[timeline.length - 1];
  const endMs = lastItem ? lastItem.startMs + lastItem.durationMs : 0;
  const slug = sanitizeSlug(options.episodeId ?? options.id);

  const fullEpisode: RenderTarget = {
    id: `${options.id}:full`,
    kind: 'full',
    viewport,
    range: {
      startMs: 0,
      endMs,
      endSegmentIndex: lastItem?.index ?? 0,
    },
    timeline,
    artifact: {
      fileName: `${slug}.mp4`,
      durationMs: endMs,
    },
    outputPath: joinPath(options.outputRoot ?? 'exports', slug, `${slug}.mp4`),
  };

  return {
    id: options.id,
    runId: options.runId,
    episodeId: options.episodeId,
    title: options.title,
    createdAt,
    timing,
    fullEpisode,
    shorts: [],
    pgnHeaders: { ...game.headers },
    outputRoot: options.outputRoot,
  };
}

/**
 * Planned commentary duration for a text block. Used by the initial
 * plan builder and by clip-manifest slicing. Floors at textMinMs so
 * empty / pre-generation slots still pace; caps at textMaxMs so a
 * runaway commentary block doesn't dominate the timeline.
 */
export function estimateCommentaryDuration(text: string, timing: NarrationTiming): number {
  if (!text) return timing.textMinMs;
  const estimated = text.length * timing.textMsPerChar;
  return Math.min(timing.textMaxMs, Math.max(timing.textMinMs, estimated));
}

function estimateCommentaryDurationMs(text: string, timing: NarrationTiming): number {
  return estimateCommentaryDuration(text, timing);
}

// ─── Retiming from measured offsets ─────────────────────────────────

/**
 * Map of {moveIndex → offsetMs from playback start}, populated by the
 * broadcast bridge during capture. Keys are 0-indexed plies, matching
 * the `maxMoveIndex` AudioNarrationQueue records when each commentary
 * entry's first sentence begins playing.
 */
export type SegmentTimingsByMove = Record<number, number>;

/**
 * Given a render plan and a SegmentTimingsByMove map produced by the
 * broadcast bridge, produce a new plan whose commentary start offsets
 * and durations reflect what actually played. Items without a measured
 * offset keep their planned values, anchored against the previous
 * measured item where possible.
 *
 * The capture pipeline uses the retimed plan when composing the final
 * audio track — caption / narration alignment within ~50 ms of paint.
 */
export function retimeRenderPlanWithSegmentTimings(
  plan: RenderPlan,
  timingsByMove: SegmentTimingsByMove,
): RenderPlan {
  const retimedTimeline = retimeTimeline(plan.fullEpisode.timeline, timingsByMove);
  const lastItem = retimedTimeline[retimedTimeline.length - 1];
  const endMs = lastItem ? lastItem.startMs + lastItem.durationMs : 0;
  const retimedFull: RenderTarget = {
    ...plan.fullEpisode,
    timeline: retimedTimeline,
    range: {
      ...plan.fullEpisode.range,
      endMs,
      endSegmentIndex: lastItem?.index ?? plan.fullEpisode.range.endSegmentIndex,
    },
    artifact: {
      ...plan.fullEpisode.artifact,
      durationMs: endMs,
    },
  };
  return {
    ...plan,
    fullEpisode: retimedFull,
  };
}

function retimeTimeline(timeline: TimelineItem[], timingsByMove: SegmentTimingsByMove): TimelineItem[] {
  // Anchor commentary items at their measured paint offsets when
  // available. Move and gap items keep their planned durations but
  // their startMs slides to sit immediately before the next measured
  // commentary anchor. This preserves the move-before-commentary
  // ordering while honoring the real audio clock.
  //
  // Walk the timeline once. Track a running cursor that advances by
  // planned duration; whenever a measured anchor is encountered, snap
  // the cursor to that anchor (with a sanity floor so we never go
  // backward).
  const result: TimelineItem[] = [];
  let cursor = 0;
  for (const item of timeline) {
    const measured = measuredOffsetFor(item, timingsByMove);
    const startMs = measured !== null ? Math.max(cursor, measured) : cursor;
    const nextMeasured = findNextMeasuredAfter(timeline, timingsByMove, item.index);
    const durationMs =
      nextMeasured !== null && nextMeasured > startMs
        ? nextMeasured - startMs
        : item.durationMs;
    result.push({ ...item, startMs, durationMs });
    cursor = startMs + durationMs;
  }
  return result;
}

function measuredOffsetFor(item: TimelineItem, timingsByMove: SegmentTimingsByMove): number | null {
  if (item.kind !== 'commentary' || item.moveIndex === undefined) return null;
  const measured = timingsByMove[item.moveIndex];
  return measured !== undefined ? measured : null;
}

function findNextMeasuredAfter(
  timeline: TimelineItem[],
  timingsByMove: SegmentTimingsByMove,
  afterIndex: number,
): number | null {
  for (const item of timeline) {
    if (item.index <= afterIndex) continue;
    const measured = measuredOffsetFor(item, timingsByMove);
    if (measured !== null) return measured;
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

// ─── Public re-exports for downstream consumers ────────────────────

export type { PgnGame, PgnMove };
