/**
 * Board annotation system for commentator-driven visual overlays.
 *
 * The commentator model embeds inline annotation tags in its text output.
 * We parse these out, strip them from display/TTS text, and render them
 * as SVG overlays on the chess board.
 *
 * Tag syntax (case-insensitive, flexible whitespace):
 *   [arrow e2 e4]           — green arrow (default)
 *   [arrow e2 e4 red]       — colored arrow
 *   [highlight d5]          — yellow highlight (default)
 *   [highlight d5 red]      — colored highlight
 *   [circle f3]             — blue circle (default)
 *   [circle f3 red]         — colored circle
 *
 * Colors: green, red, yellow, blue, orange, purple, white, cyan
 */

export interface AnnotationArrow {
  from: string;
  to: string;
  color: string;
}

export interface AnnotationHighlight {
  square: string;
  color: string;
}

export interface AnnotationCircle {
  square: string;
  color: string;
}

export interface BoardAnnotations {
  arrows: AnnotationArrow[];
  highlights: AnnotationHighlight[];
  circles: AnnotationCircle[];
}

export const EMPTY_ANNOTATIONS: BoardAnnotations = { arrows: [], highlights: [], circles: [] };

// Annotation tag patterns — [type square(s) color?]
const TAG_PATTERN = /\[(?:arrow|highlight|circle)\s+[^\]]+\]/gi;

const ARROW_RE = /\[arrow\s+([a-h][1-8])\s+([a-h][1-8])(?:\s+(\w+))?\s*\]/gi;
const HIGHLIGHT_RE = /\[highlight\s+([a-h][1-8])(?:\s+(\w+))?\s*\]/gi;
const CIRCLE_RE = /\[circle\s+([a-h][1-8])(?:\s+(\w+))?\s*\]/gi;

const COLOR_MAP: Record<string, string> = {
  green:  'rgba(0, 200, 83, 0.7)',
  red:    'rgba(255, 23, 68, 0.7)',
  yellow: 'rgba(255, 214, 0, 0.6)',
  blue:   'rgba(41, 121, 255, 0.7)',
  orange: 'rgba(255, 145, 0, 0.7)',
  purple: 'rgba(180, 130, 255, 0.7)',
  white:  'rgba(255, 255, 255, 0.7)',
  cyan:   'rgba(0, 229, 255, 0.7)',
};

function resolveColor(name?: string, fallback = 'green'): string {
  if (!name) return COLOR_MAP[fallback] || COLOR_MAP.green;
  return COLOR_MAP[name.toLowerCase()] || COLOR_MAP[fallback];
}

/**
 * Parse annotation tags from commentary text.
 * Returns structured annotations and the cleaned text (tags removed).
 */
export function parseAnnotations(text: string): { clean: string; annotations: BoardAnnotations } {
  const arrows: AnnotationArrow[] = [];
  const highlights: AnnotationHighlight[] = [];
  const circles: AnnotationCircle[] = [];

  // Parse arrows
  for (const m of text.matchAll(ARROW_RE)) {
    arrows.push({ from: m[1], to: m[2], color: resolveColor(m[3], 'green') });
  }

  // Parse highlights
  for (const m of text.matchAll(HIGHLIGHT_RE)) {
    highlights.push({ square: m[1], color: resolveColor(m[2], 'yellow') });
  }

  // Parse circles
  for (const m of text.matchAll(CIRCLE_RE)) {
    circles.push({ square: m[1], color: resolveColor(m[2], 'blue') });
  }

  // Strip all annotation tags from text, then clean up artifacts
  const clean = cleanAfterStrip(text.replace(TAG_PATTERN, ''));

  return {
    clean,
    annotations: { arrows, highlights, circles },
  };
}

/**
 * Strip annotation tags from text without parsing them.
 * Used for TTS where we just need clean spoken text.
 */
export function stripAnnotationTags(text: string): string {
  return cleanAfterStrip(text.replace(TAG_PATTERN, ''));
}

/** Clean up text artifacts left after stripping annotation tags. */
function cleanAfterStrip(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')          // collapse multiple spaces
    .replace(/\s+([.,;:!?])/g, '$1')  // remove space before punctuation
    .replace(/([.,;:!?])\1+/g, '$1')  // collapse repeated punctuation
    .replace(/\s{2,}/g, ' ')          // re-collapse after removals
    .trim();
}

/**
 * Merge two annotation sets (e.g., move arrows + model annotations).
 */
export function mergeAnnotations(a: BoardAnnotations, b: BoardAnnotations): BoardAnnotations {
  return {
    arrows: [...a.arrows, ...b.arrows],
    highlights: [...a.highlights, ...b.highlights],
    circles: [...a.circles, ...b.circles],
  };
}

/**
 * Check if annotations set is empty.
 */
export function hasAnnotations(a: BoardAnnotations): boolean {
  return a.arrows.length > 0 || a.highlights.length > 0 || a.circles.length > 0;
}
