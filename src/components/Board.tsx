import { Chess } from 'chess.js';
import { Fragment, useMemo } from 'react';
import type { BoardAnnotations } from '../utils/board-annotations';

const PIECE_SYMBOLS: Record<string, string> = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

/** Square size in px (3rem = 48px at default font size). */
const SQ = 48;
/** Label column width (1.5rem = 24px). */
const LABEL_W = 24;
/** Label row height above the board. */
const LABEL_H = 20;

/** Move arrows from narration sync (white/black player colors). */
interface MoveArrow {
  from: string;
  to: string;
  color: 'w' | 'b';
}

interface BoardProps {
  fen: string;
  lastMove?: { from: string; to: string };
  /** Squares to highlight during narration (amber overlay). */
  highlightSquares?: string[];
  /** Move arrows to draw on the board (narration-synced). */
  arrows?: MoveArrow[];
  /** Model-driven annotations (arrows, highlights, circles from commentary). */
  annotations?: BoardAnnotations;
}

/** Convert algebraic square to pixel center relative to the board grid origin. */
function squareToPixel(square: string): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97; // a=0 .. h=7
  const rank = 8 - parseInt(square[1]);     // 8→0, 1→7
  return { x: file * SQ + SQ / 2, y: rank * SQ + SQ / 2 };
}

/** Convert algebraic square to pixel top-left corner. */
function squareToCorner(square: string): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  return { x: file * SQ, y: rank * SQ };
}

// Generate unique marker IDs to avoid clashes with multiple overlays
let markerIdCounter = 0;

function AnnotationOverlay({
  moveArrows,
  annotations,
}: {
  moveArrows: MoveArrow[];
  annotations?: BoardAnnotations;
}) {
  const boardSize = 8 * SQ;
  const markerId = useMemo(() => `anno-${++markerIdCounter}`, []);

  const hasContent =
    moveArrows.length > 0 ||
    (annotations &&
      (annotations.arrows.length > 0 ||
        annotations.highlights.length > 0 ||
        annotations.circles.length > 0 ||
        (annotations.ghostArrows?.length ?? 0) > 0));

  if (!hasContent) return null;

  // Collect all arrows: move arrows first, then model annotations,
  // then ghost arrows (with dashed styling).
  const allArrows: {
    from: string;
    to: string;
    stroke: string;
    opacity: number;
    width: number;
    dashed?: boolean;
    key: string;
  }[] = [];

  // Move arrows (player-colored, thicker)
  for (let i = 0; i < moveArrows.length; i++) {
    const a = moveArrows[i];
    const isWhite = a.color === 'w';
    allArrows.push({
      from: a.from,
      to: a.to,
      stroke: isWhite ? 'rgba(255,255,255,0.7)' : 'rgba(180,130,255,0.7)',
      opacity: 0.8,
      width: 5,
      key: `move-${a.from}-${a.to}-${i}`,
    });
  }

  // Model annotation arrows (thinner, styled by model)
  if (annotations) {
    for (let i = 0; i < annotations.arrows.length; i++) {
      const a = annotations.arrows[i];
      allArrows.push({
        from: a.from,
        to: a.to,
        stroke: a.color,
        opacity: 0.85,
        width: 4,
        key: `anno-arrow-${a.from}-${a.to}-${i}`,
      });
    }
  }

  // Ghost arrows — alternatives the lesson is DISCUSSING but not
  // playing. Dashed + lower opacity so they read as "what could have
  // happened" rather than the actual move.
  if (annotations?.ghostArrows) {
    for (let i = 0; i < annotations.ghostArrows.length; i++) {
      const a = annotations.ghostArrows[i];
      allArrows.push({
        from: a.from,
        to: a.to,
        stroke: a.color,
        opacity: 0.5,
        width: 3,
        dashed: true,
        key: `ghost-arrow-${a.from}-${a.to}-${i}`,
      });
    }
  }

  // Deduplicate arrow marker colors for defs
  const uniqueColors = new Set(allArrows.map(a => a.stroke));

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ top: LABEL_H, left: LABEL_W, width: boardSize, height: boardSize }}
      viewBox={`0 0 ${boardSize} ${boardSize}`}
    >
      <defs>
        {[...uniqueColors].map((color) => (
          <marker
            key={`${markerId}-${color}`}
            id={`${markerId}-${color}`}
            markerWidth="4"
            markerHeight="4"
            refX="2.5"
            refY="2"
            orient="auto"
          >
            <path d="M0,0 L4,2 L0,4 Z" fill={color.replace(/[\d.]+\)$/, '0.95)')} />
          </marker>
        ))}
      </defs>

      {/* Square highlights (rendered first, under everything) */}
      {annotations?.highlights.map((h, i) => {
        const corner = squareToCorner(h.square);
        return (
          <rect
            key={`hl-${h.square}-${i}`}
            x={corner.x}
            y={corner.y}
            width={SQ}
            height={SQ}
            fill={h.color}
            opacity="0.4"
          />
        );
      })}

      {/* Circles */}
      {annotations?.circles.map((c, i) => {
        const center = squareToPixel(c.square);
        return (
          <circle
            key={`cir-${c.square}-${i}`}
            cx={center.x}
            cy={center.y}
            r={SQ / 2 - 4}
            fill="none"
            stroke={c.color}
            strokeWidth="3"
            opacity="0.8"
          />
        );
      })}

      {/* All arrows (move arrows + model arrows) */}
      {allArrows.map((arrow) => {
        const from = squareToPixel(arrow.from);
        const to = squareToPixel(arrow.to);

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;

        const shorten = 10;
        const endX = to.x - (dx / len) * shorten;
        const endY = to.y - (dy / len) * shorten;
        const startX = from.x + (dx / len) * 6;
        const startY = from.y + (dy / len) * 6;

        return (
          <line
            key={arrow.key}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={arrow.stroke}
            strokeWidth={arrow.width}
            strokeLinecap="round"
            strokeDasharray={arrow.dashed ? '6 5' : undefined}
            markerEnd={`url(#${markerId}-${arrow.stroke})`}
            opacity={arrow.opacity}
          />
        );
      })}
    </svg>
  );
}

export function Board({ fen, lastMove, highlightSquares, arrows, annotations }: BoardProps) {
  const board = useMemo(() => {
    const chess = new Chess(fen);
    return chess.board();
  }, [fen]);

  const checkSquare = useMemo(() => {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return null;
    const turn = chess.turn();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (piece && piece.type === 'k' && piece.color === turn) {
          return `${FILES[f]}${RANKS[r]}`;
        }
      }
    }
    return null;
  }, [fen, board]);

  // Build annotation highlight set for square background coloring
  const annoHighlightMap = useMemo(() => {
    const map = new Map<string, string>();
    if (annotations?.highlights) {
      for (const h of annotations.highlights) {
        map.set(h.square, h.color);
      }
    }
    return map;
  }, [annotations]);

  // Build a map of predicted-piece subscripts by square. Set only when
  // the narration explicitly named a piece going to a destination
  // (e.g. "knight to f4", "bishop from c1 to g5"). The viewer sees a
  // small piece glyph in the square's corner so the model's
  // expectation reads at a glance without listening to narration.
  const predictedPieceMap = useMemo(() => {
    const map = new Map<string, 'k' | 'q' | 'r' | 'b' | 'n' | 'p'>();
    if (annotations?.highlights) {
      for (const h of annotations.highlights) {
        if (h.predictedPiece) {
          const code = h.predictedPiece[0].toLowerCase() as 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
          map.set(h.square, code);
        }
      }
    }
    return map;
  }, [annotations]);

  return (
    <div className="inline-block relative">
      {/* Column labels */}
      <div className="flex ml-6">
        {FILES.map(f => (
          <div key={f} className="w-12 h-5 flex items-center justify-center text-xs text-text-muted">
            {f}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[auto_repeat(8,3rem)] grid-rows-[repeat(8,3rem)]">
        {RANKS.map((rank, ri) => (
          <Fragment key={rank}>
            {/* Row label */}
            <div className="w-6 flex items-center justify-center text-xs text-text-muted">
              {rank}
            </div>
            {FILES.map((file, fi) => {
              const square = `${file}${rank}`;
              const isLight = (ri + fi) % 2 === 0;
              const piece = board[ri][fi];
              const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
              const isCheck = checkSquare === square;
              const isNarrationHighlight = highlightSquares?.includes(square);
              const annoColor = annoHighlightMap.get(square);

              // Priority: annotation highlight > narration highlight > lastMove
              // Saturation is bumped (from ~25% alpha previously to ~70%
              // on dark squares, ~85% on light) so the highlights read
              // cleanly on mobile and survive YouTube re-encoding.
              let bgStyle: React.CSSProperties | undefined;
              if (annoColor) {
                bgStyle = { backgroundColor: annoColor };
              } else if (isNarrationHighlight) {
                // amber — current-focus square called out in narration
                bgStyle = { backgroundColor: isLight ? '#fcd34d' : '#f59e0bcc' };
              } else if (isLastMove) {
                // purple — last move played
                bgStyle = { backgroundColor: isLight ? '#a78bfa' : '#7c3aedcc' };
              }

              const predictedPiece = predictedPieceMap.get(square);
              // Pick the side to render the predicted subscript in. If
              // there's a real piece on the square already (a capture
              // target), use the opposite color so the subscript reads.
              // Otherwise: side-to-move from the FEN, since the move
              // hasn't happened yet.
              const sideToMove = (fen.split(' ')[1] as 'w' | 'b') || 'w';
              const predictedColor: 'w' | 'b' = piece
                ? (piece.color === 'w' ? 'b' : 'w')
                : sideToMove;

              return (
                <div
                  key={square}
                  className={`
                    w-12 h-12 flex items-center justify-center text-3xl select-none relative transition-colors duration-300
                    ${isLight ? 'bg-board-light' : 'bg-board-dark'}
                    ${isNarrationHighlight && !annoColor ? 'ring-4 ring-inset ring-amber-400' : ''}
                    ${!isNarrationHighlight && !annoColor && isLastMove ? 'ring-4 ring-inset ring-purple-accent' : ''}
                    ${isCheck ? 'ring-4 ring-inset ring-error' : ''}
                  `}
                  style={bgStyle}
                >
                  {piece && (
                    <span className={piece.color === 'w' ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]'}>
                      {PIECE_SYMBOLS[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]}
                    </span>
                  )}
                  {predictedPiece && (
                    <span
                      className={`
                        absolute bottom-0 right-0 text-xs leading-none pr-0.5 pb-0.5 font-mono pointer-events-none
                        ${predictedColor === 'w' ? 'text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.95)]' : 'text-gray-900 drop-shadow-[0_0_2px_rgba(255,255,255,0.6)]'}
                      `}
                      // Tiny dim background ring so the glyph reads on
                      // any underlying color (highlight amber, board
                      // light/dark, captured-piece glyph).
                      style={{ textShadow: '0 0 3px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.5)' }}
                      aria-label={`predicted: ${predictedPiece}`}
                    >
                      {PIECE_SYMBOLS[predictedColor === 'w' ? predictedPiece.toUpperCase() : predictedPiece]}
                    </span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Combined annotation overlay — move arrows + model annotations */}
      <AnnotationOverlay
        moveArrows={arrows || []}
        annotations={annotations}
      />
    </div>
  );
}
