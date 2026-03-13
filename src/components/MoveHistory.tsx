import { useEffect, useRef } from 'react';
import type { MoveRecord } from '../engine/types';

interface MoveHistoryProps {
  moves: MoveRecord[];
  activeIndex?: number;
}

export function MoveHistory({ moves, activeIndex }: MoveHistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIndex]);

  // Group moves into pairs (white + black per turn)
  const turns: Array<{ number: number; white?: MoveRecord; black?: MoveRecord }> = [];

  for (const move of moves) {
    if (move.color === 'w') {
      turns.push({ number: move.turnNumber, white: move });
    } else {
      const last = turns[turns.length - 1];
      if (last && !last.black) {
        last.black = move;
      } else {
        turns.push({ number: move.turnNumber, black: move });
      }
    }
  }

  if (moves.length === 0) {
    return (
      <div className="p-4 bg-surface-1 rounded-lg">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Moves</h3>
        <p className="text-sm text-text-muted">No moves yet</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-surface-1 rounded-lg">
      <h3 className="text-sm font-semibold text-text-secondary mb-2">Moves</h3>
      <div ref={containerRef} className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-xs">
              <th className="w-8 text-left">#</th>
              <th className="text-left">White</th>
              <th className="text-left">Black</th>
            </tr>
          </thead>
          <tbody>
            {turns.map((turn, i) => (
              <tr
                key={i}
                ref={i === turns.length - 1 ? activeRowRef : null}
                className={`border-t border-surface-2 hover:bg-surface-2/50 ${
                  activeIndex !== undefined && i === turns.length - 1 ? 'bg-purple-accent/10' : ''
                }`}
              >
                <td className="py-1 text-text-muted">{turn.number}.</td>
                <td className="py-1">
                  {turn.white && <MoveCell move={turn.white} />}
                </td>
                <td className="py-1">
                  {turn.black && <MoveCell move={turn.black} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MoveCell({ move }: { move: MoveRecord }) {
  const hasDetail = move.reasoning || (move.predictedLines && move.predictedLines.length > 0);

  return (
    <div className="group">
      <span className="font-mono text-text-primary">{move.move}</span>
      {move.attempts > 1 && (
        <span className="ml-1 text-xs text-warning" title={`${move.attempts} attempts`}>
          ({move.attempts})
        </span>
      )}
      <span className="ml-2 text-xs text-text-muted">
        {(move.thinkingTimeMs / 1000).toFixed(1)}s
      </span>
      {hasDetail && (
        <div className="text-xs text-text-secondary mt-0.5 pl-2 border-l-2 border-purple-accent/50 leading-relaxed">
          {move.reasoning && <div>{move.reasoning}</div>}
          {move.predictedLines && move.predictedLines.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {move.predictedLines.map((line, index) => (
                <div key={`${move.turnNumber}-${move.color}-${index}`}>
                  <span className="text-text-muted">Line {index + 1}:</span>{' '}
                  <span className="font-mono">{line.moves.join(' ')}</span>
                  {line.summary && <span className="text-text-muted"> ({line.summary})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
