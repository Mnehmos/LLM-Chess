import { Chess } from 'chess.js';
import { extractChessSquares } from './chess-squares';

/**
 * Board annotation system for commentator-driven visual overlays.
 *
 * Supported explicit tags:
 *   [arrow e2 e4]
 *   [highlight d5]
 *   [circle f3]
 *   [move e2 e4]
 *
 * Supported natural-language schema:
 *   queen on d2
 *   queen to d2
 *   bishop from c4 to d5
 *   pressure on f7
 *   targeting d6
 *   weak square e5
 *   line from d2 to h6
 *   diagonal c2 to h7
 *   file on e-file
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

export type SemanticCueKind =
  | 'piece_on'
  | 'piece_to'
  | 'piece_route'
  | 'square_focus'
  | 'line'
  | 'file';

export type SemanticPiece = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface SemanticCue {
  kind: SemanticCueKind;
  piece?: SemanticPiece;
  from?: string;
  to?: string;
  square?: string;
  label: string;
  confidence: 'high' | 'medium';
  source: 'tag' | 'natural_language' | 'passive';
}

export interface ParsedAnnotationResult {
  clean: string;
  annotations: BoardAnnotations;
  semanticCues: SemanticCue[];
}

export interface AnnotationParseOptions {
  fen?: string;
  sideToMove?: 'w' | 'b';
  includePassiveSquares?: boolean;
}

export const EMPTY_ANNOTATIONS: BoardAnnotations = { arrows: [], highlights: [], circles: [] };

const TAG_PATTERN = /\[(?:arrow|highlight|circle|move)\s+[^\]]+\]/gi;
const RESIDUAL_TAG_PATTERN = /\[\/?(?:arrow|highlight|circle|move)\b[^\]]*\]/gi;
const RESIDUAL_HTML_TAG_PATTERN = /<\/?(?:arrow|highlight|circle|move)\b[^>]*>/gi;

const ARROW_RE = /\[arrow\s+([a-h][1-8])\s+([a-h][1-8])(?:\s+(\w+))?\s*\]/gi;
const HIGHLIGHT_RE = /\[highlight\s+([a-h][1-8])(?:\s+(\w+))?\s*\]/gi;
const CIRCLE_RE = /\[circle\s+([a-h][1-8])(?:\s+(\w+))?\s*\]/gi;
const MOVE_RE = /\[move\s+([a-h][1-8])\s+([a-h][1-8])(?:\s+([qrbn]))?\s*\]/gi;

const PIECE_NAME_TO_TYPE: Record<SemanticPiece, string> = {
  king: 'k',
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
};

const COLOR_MAP: Record<string, string> = {
  green: 'rgba(0, 200, 83, 0.7)',
  red: 'rgba(255, 23, 68, 0.7)',
  yellow: 'rgba(255, 214, 0, 0.6)',
  blue: 'rgba(41, 121, 255, 0.7)',
  orange: 'rgba(255, 145, 0, 0.7)',
  purple: 'rgba(180, 130, 255, 0.7)',
  white: 'rgba(255, 255, 255, 0.7)',
  cyan: 'rgba(0, 229, 255, 0.7)',
};

const COLOR_FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: 'green', pattern: /0,\s*200,\s*83/i },
  { family: 'red', pattern: /255,\s*23,\s*68/i },
  { family: 'yellow', pattern: /255,\s*214,\s*0/i },
  { family: 'blue', pattern: /41,\s*121,\s*255/i },
  { family: 'orange', pattern: /255,\s*145,\s*0/i },
  { family: 'purple', pattern: /180,\s*130,\s*255/i },
  { family: 'white', pattern: /255,\s*255,\s*255/i },
  { family: 'cyan', pattern: /0,\s*229,\s*255/i },
];

type AnnotationSource = 'tag' | 'natural_language' | 'passive';

interface SourcedArrow extends AnnotationArrow {
  source: AnnotationSource;
}

interface SourcedHighlight extends AnnotationHighlight {
  source: AnnotationSource;
}

interface SourcedCircle extends AnnotationCircle {
  source: AnnotationSource;
}

function resolveColor(name?: string, fallback = 'green'): string {
  if (!name) return COLOR_MAP[fallback] || COLOR_MAP.green;
  return COLOR_MAP[name.toLowerCase()] || COLOR_MAP[fallback];
}

function normalizeSquare(square: string | undefined): string | undefined {
  return square?.toLowerCase();
}

function normalizeAnnotationSyntax(text: string): string {
  return text
    .replace(/\[(arrow|move)\]\s*([a-h][1-8])([a-h][1-8])([qrbn])?\s*\[\/\1\]/gi, (_m, kind, from, to, extra) =>
      `[${String(kind).toLowerCase()} ${String(from).toLowerCase()} ${String(to).toLowerCase()}${extra ? ` ${String(extra).toLowerCase()}` : ''}]`)
    .replace(/\[(arrow|move)\s+([a-h][1-8])([a-h][1-8])([qrbn])?\s*\]/gi, (_m, kind, from, to, extra) =>
      `[${String(kind).toLowerCase()} ${String(from).toLowerCase()} ${String(to).toLowerCase()}${extra ? ` ${String(extra).toLowerCase()}` : ''}]`)
    .replace(/\[(highlight|circle)\]\s*([a-h][1-8])(?:\s+(\w+))?\s*\[\/\1\]/gi, (_m, kind, square, color) =>
      `[${String(kind).toLowerCase()} ${String(square).toLowerCase()}${color ? ` ${String(color).toLowerCase()}` : ''}]`)
    .replace(/\[(highlight|circle)\]\s*([a-h][1-8])(?:\s+(\w+))?/gi, (_m, kind, square, color) =>
      `[${String(kind).toLowerCase()} ${String(square).toLowerCase()}${color ? ` ${String(color).toLowerCase()}` : ''}]`)
    .replace(/\[(arrow|move)\]\s*([a-h][1-8])\s*(?:->|,|\s)\s*([a-h][1-8])(?:\s+([qrbn]|\w+))?\s*\[\/\1\]/gi, (_m, kind, from, to, extra) =>
      `[${String(kind).toLowerCase()} ${String(from).toLowerCase()} ${String(to).toLowerCase()}${extra ? ` ${String(extra).toLowerCase()}` : ''}]`)
    .replace(/\[(arrow|move)\]\s*([a-h][1-8])\s*(?:->|,|\s)\s*([a-h][1-8])(?:\s+([qrbn]|\w+))?/gi, (_m, kind, from, to, extra) =>
      `[${String(kind).toLowerCase()} ${String(from).toLowerCase()} ${String(to).toLowerCase()}${extra ? ` ${String(extra).toLowerCase()}` : ''}]`)
    .replace(RESIDUAL_HTML_TAG_PATTERN, ' ')
    .replace(RESIDUAL_TAG_PATTERN, ' ');
}

function cleanAfterStrip(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.,;:!?])\1+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sourcePriority(source: AnnotationSource): number {
  if (source === 'tag') return 3;
  if (source === 'natural_language') return 2;
  return 1;
}

function normalizeColorFamily(color: string): string {
  const normalized = color.toLowerCase().replace(/\s+/g, '');
  for (const [name, value] of Object.entries(COLOR_MAP)) {
    if (normalized === value.toLowerCase().replace(/\s+/g, '')) return name;
  }
  for (const entry of COLOR_FAMILY_PATTERNS) {
    if (entry.pattern.test(color)) return entry.family;
  }
  return normalized;
}

function dedupeAnnotations(
  arrows: SourcedArrow[],
  highlights: SourcedHighlight[],
  circles: SourcedCircle[],
): BoardAnnotations {
  const arrowMap = new Map<string, SourcedArrow>();
  for (const arrow of arrows) {
    const key = `${arrow.from}->${arrow.to}:${normalizeColorFamily(arrow.color)}`;
    const existing = arrowMap.get(key);
    if (!existing || sourcePriority(arrow.source) >= sourcePriority(existing.source)) {
      arrowMap.set(key, arrow);
    }
  }

  const highlightMap = new Map<string, SourcedHighlight>();
  for (const highlight of highlights) {
    const key = `${highlight.square}:${normalizeColorFamily(highlight.color)}`;
    const existing = highlightMap.get(key);
    if (!existing || sourcePriority(highlight.source) >= sourcePriority(existing.source)) {
      highlightMap.set(key, highlight);
    }
  }

  const circleMap = new Map<string, SourcedCircle>();
  for (const circle of circles) {
    const key = `${circle.square}:${normalizeColorFamily(circle.color)}`;
    const existing = circleMap.get(key);
    if (!existing || sourcePriority(circle.source) >= sourcePriority(existing.source)) {
      circleMap.set(key, circle);
    }
  }

  return {
    arrows: [...arrowMap.values()].map(({ source: _source, ...arrow }) => arrow),
    highlights: [...highlightMap.values()].map(({ source: _source, ...highlight }) => highlight),
    circles: [...circleMap.values()].map(({ source: _source, ...circle }) => circle),
  };
}

function parseTagAnnotations(normalized: string): {
  arrows: SourcedArrow[];
  highlights: SourcedHighlight[];
  circles: SourcedCircle[];
  semanticCues: SemanticCue[];
} {
  const arrows: SourcedArrow[] = [];
  const highlights: SourcedHighlight[] = [];
  const circles: SourcedCircle[] = [];
  const semanticCues: SemanticCue[] = [];

  for (const match of normalized.matchAll(ARROW_RE)) {
    const from = normalizeSquare(match[1])!;
    const to = normalizeSquare(match[2])!;
    arrows.push({ from, to, color: resolveColor(match[3], 'green'), source: 'tag' });
    semanticCues.push({
      kind: 'line',
      from,
      to,
      label: `arrow ${from} ${to}`,
      confidence: 'high',
      source: 'tag',
    });
  }

  for (const match of normalized.matchAll(HIGHLIGHT_RE)) {
    const square = normalizeSquare(match[1])!;
    highlights.push({ square, color: resolveColor(match[2], 'yellow'), source: 'tag' });
    semanticCues.push({
      kind: 'square_focus',
      square,
      label: `highlight ${square}`,
      confidence: 'high',
      source: 'tag',
    });
  }

  for (const match of normalized.matchAll(CIRCLE_RE)) {
    const square = normalizeSquare(match[1])!;
    circles.push({ square, color: resolveColor(match[2], 'blue'), source: 'tag' });
    semanticCues.push({
      kind: 'piece_on',
      square,
      label: `circle ${square}`,
      confidence: 'high',
      source: 'tag',
    });
  }

  return { arrows, highlights, circles, semanticCues };
}

function resolveUniquePieceMoveOrigin(
  fen: string | undefined,
  sideToMove: 'w' | 'b' | undefined,
  piece: SemanticPiece,
  to: string,
): string | undefined {
  if (!fen || !sideToMove) return undefined;
  try {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });
    const pieceType = PIECE_NAME_TO_TYPE[piece];
    const candidates = legalMoves.filter((move) => move.color === sideToMove && move.piece === pieceType && move.to === to);
    if (candidates.length === 1) {
      return candidates[0].from;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseNaturalLanguageAnnotations(
  clean: string,
  options?: AnnotationParseOptions,
): {
  arrows: SourcedArrow[];
  highlights: SourcedHighlight[];
  circles: SourcedCircle[];
  semanticCues: SemanticCue[];
} {
  const arrows: SourcedArrow[] = [];
  const highlights: SourcedHighlight[] = [];
  const circles: SourcedCircle[] = [];
  const semanticCues: SemanticCue[] = [];
  const normalizedText = clean.toLowerCase();

  const routeRe = /\b(king|queen|rook|bishop|knight|pawn)\s+from\s+([a-h][1-8])\s+to\s+([a-h][1-8])\b/gi;
  const placementRe = /\b(king|queen|rook|bishop|knight|pawn)\s+on\s+([a-h][1-8])\b/gi;
  const pieceToRe = /\b(king|queen|rook|bishop|knight|pawn)\s+to\s+([a-h][1-8])\b/gi;
  const focusRe = /\b(pressure on|targeting|defending|covering|weak square)\s+([a-h][1-8])\b/gi;
  const lineRe = /\b(line from|diagonal)\s+([a-h][1-8])\s+to\s+([a-h][1-8])\b/gi;
  const fileRe = /\bfile on\s+([a-h])-file\b/gi;

  for (const match of normalizedText.matchAll(routeRe)) {
    const piece = match[1] as SemanticPiece;
    const from = match[2];
    const to = match[3];
    arrows.push({ from, to, color: resolveColor(undefined, 'green'), source: 'natural_language' });
    highlights.push({ square: to, color: resolveColor(undefined, 'yellow'), source: 'natural_language' });
    semanticCues.push({
      kind: 'piece_route',
      piece,
      from,
      to,
      label: `${piece} from ${from} to ${to}`,
      confidence: 'high',
      source: 'natural_language',
    });
  }

  for (const match of normalizedText.matchAll(placementRe)) {
    const piece = match[1] as SemanticPiece;
    const square = match[2];
    circles.push({ square, color: resolveColor(undefined, 'blue'), source: 'natural_language' });
    semanticCues.push({
      kind: 'piece_on',
      piece,
      square,
      label: `${piece} on ${square}`,
      confidence: 'high',
      source: 'natural_language',
    });
  }

  for (const match of normalizedText.matchAll(pieceToRe)) {
    const piece = match[1] as SemanticPiece;
    const to = match[2];
    const from = resolveUniquePieceMoveOrigin(options?.fen, options?.sideToMove, piece, to);
    highlights.push({ square: to, color: resolveColor(undefined, 'yellow'), source: 'natural_language' });
    if (from) {
      arrows.push({ from, to, color: resolveColor(undefined, 'green'), source: 'natural_language' });
    }
    semanticCues.push({
      kind: 'piece_to',
      piece,
      from,
      to,
      square: to,
      label: `${piece} to ${to}`,
      confidence: from ? 'high' : 'medium',
      source: 'natural_language',
    });
  }

  for (const match of normalizedText.matchAll(focusRe)) {
    const square = match[2];
    highlights.push({ square, color: resolveColor(undefined, 'yellow'), source: 'natural_language' });
    semanticCues.push({
      kind: 'square_focus',
      square,
      label: `${match[1]} ${square}`,
      confidence: 'high',
      source: 'natural_language',
    });
  }

  for (const match of normalizedText.matchAll(lineRe)) {
    const from = match[2];
    const to = match[3];
    arrows.push({ from, to, color: resolveColor(undefined, 'green'), source: 'natural_language' });
    semanticCues.push({
      kind: 'line',
      from,
      to,
      label: `${match[1]} ${from} to ${to}`,
      confidence: 'high',
      source: 'natural_language',
    });
  }

  for (const match of normalizedText.matchAll(fileRe)) {
    const file = match[1];
    semanticCues.push({
      kind: 'file',
      label: `file on ${file}-file`,
      confidence: 'high',
      source: 'natural_language',
    });
  }

  return { arrows, highlights, circles, semanticCues };
}

function parsePassiveSquareAnnotations(clean: string): {
  highlights: SourcedHighlight[];
  semanticCues: SemanticCue[];
} {
  const squares = extractChessSquares(clean).map((square) => square.toLowerCase());
  return {
    highlights: squares.map((square) => ({
      square,
      color: resolveColor(undefined, 'yellow'),
      source: 'passive' as const,
    })),
    semanticCues: squares.map((square) => ({
      kind: 'square_focus' as const,
      square,
      label: square,
      confidence: 'medium' as const,
      source: 'passive' as const,
    })),
  };
}

export function parseAnnotations(text: string, options?: AnnotationParseOptions): ParsedAnnotationResult {
  const normalized = normalizeAnnotationSyntax(text);
  const tagResult = parseTagAnnotations(normalized);
  const clean = cleanAfterStrip(normalized.replace(TAG_PATTERN, ''));
  const naturalResult = parseNaturalLanguageAnnotations(clean, options);
  const passiveResult = (options?.includePassiveSquares ?? true)
    ? parsePassiveSquareAnnotations(clean)
    : { highlights: [], semanticCues: [] };

  const annotations = dedupeAnnotations(
    [...tagResult.arrows, ...naturalResult.arrows],
    [...tagResult.highlights, ...naturalResult.highlights, ...passiveResult.highlights],
    [...tagResult.circles, ...naturalResult.circles],
  );

  return {
    clean,
    annotations,
    semanticCues: [
      ...tagResult.semanticCues,
      ...naturalResult.semanticCues,
      ...passiveResult.semanticCues,
    ],
  };
}

export function stripAnnotationTags(text: string): string {
  const normalized = normalizeAnnotationSyntax(text);
  return cleanAfterStrip(normalized.replace(TAG_PATTERN, ''));
}

export interface PuzzleMove {
  from: string;
  to: string;
  promotion?: string;
  uci: string;
}

export function parsePuzzleMoves(text: string): PuzzleMove[] {
  const normalized = normalizeAnnotationSyntax(text);
  const moves: PuzzleMove[] = [];
  for (const match of normalized.matchAll(MOVE_RE)) {
    moves.push({
      from: match[1],
      to: match[2],
      promotion: match[3]?.toLowerCase(),
      uci: match[1] + match[2] + (match[3] ? match[3].toLowerCase() : ''),
    });
  }
  return moves;
}

export function mergeAnnotations(a: BoardAnnotations, b: BoardAnnotations): BoardAnnotations {
  return dedupeAnnotations(
    [
      ...a.arrows.map((arrow) => ({ ...arrow, source: 'natural_language' as const })),
      ...b.arrows.map((arrow) => ({ ...arrow, source: 'tag' as const })),
    ],
    [
      ...a.highlights.map((highlight) => ({ ...highlight, source: 'natural_language' as const })),
      ...b.highlights.map((highlight) => ({ ...highlight, source: 'tag' as const })),
    ],
    [
      ...a.circles.map((circle) => ({ ...circle, source: 'natural_language' as const })),
      ...b.circles.map((circle) => ({ ...circle, source: 'tag' as const })),
    ],
  );
}

export function hasAnnotations(a: BoardAnnotations): boolean {
  return a.arrows.length > 0 || a.highlights.length > 0 || a.circles.length > 0;
}
