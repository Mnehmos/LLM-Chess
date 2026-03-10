import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

export function HumanMoveInput() {
  const { gameState, submitHumanMove, isWaitingForHuman, getLegalMoves } = useGameStore();
  const [input, setInput] = useState('');
  const [showLegend, setShowLegend] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const waiting = isWaitingForHuman();
  const legalMoves = waiting ? getLegalMoves() : [];

  // Auto-focus when it's human's turn
  useEffect(() => {
    if (waiting && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waiting]);

  if (!gameState || gameState.status !== 'in_progress') return null;

  // Check if either player is human
  const isWhiteHuman = gameState.white.type === 'human';
  const isBlackHuman = gameState.black.type === 'human';
  if (!isWhiteHuman && !isBlackHuman) return null;

  const currentColor = gameState.currentColor;
  const isCurrentHuman = (currentColor === 'w' && isWhiteHuman) || (currentColor === 'b' && isBlackHuman);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const move = input.trim();
    if (!move) return;

    submitHumanMove(move);
    setInput('');
  };

  const handleResign = () => {
    submitHumanMove('resign');
  };

  return (
    <div className="bg-surface-1 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary">
          {isCurrentHuman ? (
            <span className="text-purple-light">Your Turn ({currentColor === 'w' ? 'White' : 'Black'})</span>
          ) : (
            <span>Waiting for {currentColor === 'w' ? 'White' : 'Black'}...</span>
          )}
        </h3>
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          {showLegend ? 'Hide' : 'Show'} Notation Guide
        </button>
      </div>

      {/* Chess Notation Legend */}
      {showLegend && <NotationLegend />}

      {/* Move Input Form */}
      {isCurrentHuman && waiting ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your move (e.g. e4, Nf3, O-O)"
              className="flex-1 px-3 py-2 bg-surface-0 border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-purple-accent"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 bg-purple-accent hover:bg-purple-hover text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Play
            </button>
          </div>

          {/* Legal moves hint */}
          <div className="flex flex-wrap gap-1 mt-1">
            {legalMoves.slice(0, 20).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setInput(m); inputRef.current?.focus(); }}
                className="px-1.5 py-0.5 bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary rounded text-xs font-mono transition-colors"
              >
                {m}
              </button>
            ))}
            {legalMoves.length > 20 && (
              <span className="px-1.5 py-0.5 text-xs text-text-muted">+{legalMoves.length - 20} more</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleResign}
            className="self-start text-xs text-text-muted hover:text-error transition-colors mt-1"
          >
            Resign
          </button>
        </form>
      ) : isCurrentHuman ? (
        <p className="text-xs text-text-muted">Processing your move...</p>
      ) : (
        <p className="text-xs text-text-muted">Opponent is thinking...</p>
      )}
    </div>
  );
}

function NotationLegend() {
  return (
    <div className="mb-3 p-3 bg-surface-0 rounded border border-border text-xs">
      <p className="text-text-secondary font-semibold mb-2">Standard Algebraic Notation (SAN)</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-text-secondary">
        {/* Piece symbols */}
        <div className="col-span-2 text-text-muted font-medium mt-1 mb-0.5">Pieces</div>
        <div><span className="font-mono text-text-primary">K</span> = King</div>
        <div><span className="font-mono text-text-primary">Q</span> = Queen</div>
        <div><span className="font-mono text-text-primary">R</span> = Rook</div>
        <div><span className="font-mono text-text-primary">B</span> = Bishop</div>
        <div><span className="font-mono text-text-primary">N</span> = Knight</div>
        <div className="text-text-muted">(pawns: no letter)</div>

        {/* Move examples */}
        <div className="col-span-2 text-text-muted font-medium mt-2 mb-0.5">How to Write Moves</div>
        <div><span className="font-mono text-purple-light">e4</span> — pawn to e4</div>
        <div><span className="font-mono text-purple-light">Nf3</span> — knight to f3</div>
        <div><span className="font-mono text-purple-light">Bb5</span> — bishop to b5</div>
        <div><span className="font-mono text-purple-light">Qd1</span> — queen to d1</div>
        <div><span className="font-mono text-purple-light">exd5</span> — pawn on e captures d5</div>
        <div><span className="font-mono text-purple-light">Nxe5</span> — knight captures on e5</div>

        {/* Special moves */}
        <div className="col-span-2 text-text-muted font-medium mt-2 mb-0.5">Special Moves</div>
        <div><span className="font-mono text-purple-light">O-O</span> — kingside castle</div>
        <div><span className="font-mono text-purple-light">O-O-O</span> — queenside castle</div>
        <div><span className="font-mono text-purple-light">e8=Q</span> — pawn promotes to queen</div>
        <div><span className="font-mono text-purple-light">e1=N</span> — pawn promotes to knight</div>

        {/* Disambiguation */}
        <div className="col-span-2 text-text-muted font-medium mt-2 mb-0.5">Disambiguation</div>
        <div><span className="font-mono text-purple-light">Rae1</span> — rook from a-file to e1</div>
        <div><span className="font-mono text-purple-light">R1e2</span> — rook from rank 1 to e2</div>

        {/* Board layout */}
        <div className="col-span-2 text-text-muted font-medium mt-2 mb-0.5">Board Reference</div>
        <div className="col-span-2 text-text-muted">
          Files: <span className="font-mono text-text-secondary">a b c d e f g h</span> (left to right, from White's view)
        </div>
        <div className="col-span-2 text-text-muted">
          Ranks: <span className="font-mono text-text-secondary">1 2 3 4 5 6 7 8</span> (bottom to top, from White's view)
        </div>
      </div>

      <p className="text-text-muted mt-2 border-t border-border pt-2">
        Type <span className="font-mono text-purple-light">resign</span> to resign the game.
        You can also click legal moves above to fill the input.
      </p>
    </div>
  );
}
