/**
 * Clip manifest — episode-authored "shorts" lifted into the render
 * plan vocabulary.
 *
 * Phase 4 ships authored-shorts only: each episode's
 * `exports.shorts` array of `EpisodeShortClip` is converted into
 * `RenderTarget`s the capture pipeline can drive. Auto-detection
 * from Stockfish eval swings is a Phase 4.1 follow-up — the
 * detection produces the same `EpisodeShortClip` shape, so the
 * plumbing here is shared.
 */

import type { EpisodeShortClip } from '../episodes/types';
import {
  estimateCommentaryDuration,
  type NarrationTiming,
  type RenderTarget,
  type TimelineItem,
  type Viewport,
} from './renderPlan';

/**
 * Vertical 9:16 viewport for Shorts. Mobile-first consumption.
 * The capture pipeline opens a separate browser context at this
 * viewport, so the SPA layout is exercised at portrait dimensions.
 */
export const SHORTS_VIEWPORT: Viewport = {
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
  deviceScaleFactor: 1,
};

export interface ShortRenderInput {
  /** Authored clip. Either from Episode.exports.shorts or a detection pass. */
  clip: EpisodeShortClip;
  /** Episode slug used for path generation. */
  episodeSlug: string;
  /** Output root directory (default 'exports'). */
  outputRoot: string;
  /** Timing knobs (matches the full-episode plan). */
  timing: NarrationTiming;
  /**
   * Per-move commentary text indexed by 0-indexed ply. Optional —
   * when absent, commentary duration falls back to the floor.
   */
  commentaryByMoveIndex?: Record<number, string>;
  /** Full timeline of the source game, used to slice ply ranges. */
  fullTimeline: TimelineItem[];
}

/**
 * Convert an authored EpisodeShortClip into a RenderTarget.
 *
 * Ply mapping convention: `startMoveNumber` and `endMoveNumber` are
 * 1-indexed full-move numbers (white + black = 1 full move). A short
 * covering moves 8–12 captures plies 14 (white's 8th move) through
 * 23 (black's 12th move).
 *
 *   startPly = (startMoveNumber - 1) * 2
 *   endPly   = endMoveNumber * 2 - 1     # inclusive
 */
export function shortClipToRenderTarget(input: ShortRenderInput): RenderTarget {
  const startPly = Math.max(0, (input.clip.startMoveNumber - 1) * 2);
  const endPly = Math.max(startPly, input.clip.endMoveNumber * 2 - 1);

  // Walk the full timeline and grab items whose moveIndex falls in
  // [startPly, endPly]. 'gap' items are kept when they sit between
  // an included move and its commentary; orphan gaps are dropped.
  const sliced: TimelineItem[] = [];
  let cursor = 0;
  let index = 0;
  for (const item of input.fullTimeline) {
    const include =
      item.moveIndex !== undefined
        ? item.moveIndex >= startPly && item.moveIndex <= endPly
        : sliced.length > 0 && sliced[sliced.length - 1].moveIndex !== undefined;
    if (!include) continue;
    const reindexed: TimelineItem = {
      ...item,
      index: index++,
      startMs: cursor,
    };
    if (item.kind === 'commentary') {
      reindexed.durationMs = estimateCommentaryDuration(item.text ?? '', input.timing);
    }
    sliced.push(reindexed);
    cursor += reindexed.durationMs;
  }

  const lastItem = sliced[sliced.length - 1];
  const endMs = lastItem ? lastItem.startMs + lastItem.durationMs : 0;
  const fileName = `${input.episodeSlug}__${input.clip.id}.mp4`;
  return {
    id: `${input.episodeSlug}:${input.clip.id}`,
    kind: 'short',
    viewport: SHORTS_VIEWPORT,
    range: {
      startMs: 0,
      endMs,
      endSegmentIndex: lastItem?.index ?? 0,
    },
    timeline: sliced,
    artifact: {
      fileName,
      durationMs: endMs,
    },
    outputPath: joinPath(input.outputRoot, input.episodeSlug, 'shorts', fileName),
    shortId: input.clip.id,
  };
}

function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}
