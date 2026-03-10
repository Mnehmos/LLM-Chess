import { useMemo } from 'react';
import type { GameEvent } from '../engine/events';

const PIECE_UNICODE: Record<string, { w: string; b: string }> = {
  p: { w: '\u2659', b: '\u265F' },
  n: { w: '\u2658', b: '\u265E' },
  b: { w: '\u2657', b: '\u265D' },
  r: { w: '\u2656', b: '\u265C' },
  q: { w: '\u2655', b: '\u265B' },
};

// Piece value order for display (high value first)
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'];

interface GraveyardProps {
  eventLog: GameEvent[];
}

export function Graveyard({ eventLog }: GraveyardProps) {
  const { capturedByWhite, capturedByBlack } = useMemo(() => {
    const byWhite: string[] = []; // pieces white captured (black pieces)
    const byBlack: string[] = []; // pieces black captured (white pieces)
    for (const e of eventLog) {
      if (e.type === 'MoveApplied' && e.payload.isCapture && e.payload.capturedPiece) {
        if (e.payload.color === 'w') byWhite.push(e.payload.capturedPiece);
        else byBlack.push(e.payload.capturedPiece);
      }
    }
    // Sort by value (high first)
    const sort = (arr: string[]) => arr.sort((a, b) => PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b));
    return { capturedByWhite: sort(byWhite), capturedByBlack: sort(byBlack) };
  }, [eventLog]);

  if (capturedByWhite.length === 0 && capturedByBlack.length === 0) return null;

  return (
    <div className="flex justify-between px-1 text-lg leading-none">
      {/* Pieces captured by white (black pieces killed) */}
      <div className="flex flex-wrap gap-0.5">
        {capturedByWhite.map((p, i) => (
          <span key={i} className="opacity-70" title={p}>
            {PIECE_UNICODE[p]?.b ?? p}
          </span>
        ))}
      </div>
      {/* Pieces captured by black (white pieces killed) */}
      <div className="flex flex-wrap gap-0.5">
        {capturedByBlack.map((p, i) => (
          <span key={i} className="opacity-70" title={p}>
            {PIECE_UNICODE[p]?.w ?? p}
          </span>
        ))}
      </div>
    </div>
  );
}
