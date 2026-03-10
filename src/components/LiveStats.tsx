import { useRef, useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameState } from '../engine/types';
import type { EvalResult } from '../chess/stockfish';
import { formatEval } from '../chess/stockfish';

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function computeMaterial(fen: string): { white: number; black: number } {
  const board = fen.split(' ')[0];
  let white = 0, black = 0;
  for (const ch of board) {
    const lower = ch.toLowerCase();
    if (PIECE_VALUES[lower]) {
      if (ch === ch.toUpperCase()) white += PIECE_VALUES[lower];
      else black += PIECE_VALUES[lower];
    }
  }
  return { white, black };
}

interface LiveStatsProps {
  game: GameState;
  streamingText?: string;
  streamingModel?: string;
  stockfishEval?: EvalResult | null;
}

export function LiveStats({ game, streamingText: propStreamText, streamingModel: propStreamModel, stockfishEval }: LiveStatsProps) {
  const storeStreamText = useGameStore(s => s.streamingText);
  const storeStreamModel = useGameStore(s => s.streamingModel);
  const streamingText = propStreamText ?? storeStreamText;
  const streamingModel = propStreamModel ?? storeStreamModel;

  const whiteMoves = game.moveHistory.filter(m => m.color === 'w');
  const blackMoves = game.moveHistory.filter(m => m.color === 'b');

  const whiteIllegal = game.eventLog.filter(
    e => e.type === 'IllegalMoveAttempted' && e.payload.color === 'w',
  ).length;
  const blackIllegal = game.eventLog.filter(
    e => e.type === 'IllegalMoveAttempted' && e.payload.color === 'b',
  ).length;

  const whiteAvgTime = whiteMoves.length > 0
    ? whiteMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / whiteMoves.length
    : 0;
  const blackAvgTime = blackMoves.length > 0
    ? blackMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / blackMoves.length
    : 0;

  const whiteLegalRate = whiteMoves.length > 0
    ? (whiteMoves.filter(m => m.attempts === 1).length / whiteMoves.length * 100)
    : 100;
  const blackLegalRate = blackMoves.length > 0
    ? (blackMoves.filter(m => m.attempts === 1).length / blackMoves.length * 100)
    : 100;

  // Token counter: sum from LLMResponded events
  const { whiteTokens, blackTokens } = useMemo(() => {
    let wt = 0, bt = 0;
    for (const e of game.eventLog) {
      if (e.type === 'LLMResponded' && e.payload.tokensUsed) {
        if (e.payload.color === 'w') wt += e.payload.tokensUsed;
        else bt += e.payload.tokensUsed;
      }
    }
    return { whiteTokens: wt, blackTokens: bt };
  }, [game.eventLog]);

  // Material advantage
  const material = useMemo(() => computeMaterial(game.fen), [game.fen]);
  const advantage = material.white - material.black;

  return (
    <div className="p-4 bg-surface-1 rounded-lg">
      <h3 className="text-sm font-semibold text-text-secondary mb-3">Live Stats</h3>

      {/* Material advantage bar */}
      <MaterialBar advantage={advantage} whiteName={game.white.displayName.split('/').pop()} blackName={game.black.displayName.split('/').pop()} />

      <div className="grid grid-cols-3 gap-2 text-sm mt-3">
        <div className="text-text-muted"></div>
        <div className="text-center font-medium text-text-primary">{game.white.displayName.split('/').pop()}</div>
        <div className="text-center font-medium text-text-primary">{game.black.displayName.split('/').pop()}</div>

        <StatRow label="Moves" white={String(whiteMoves.length)} black={String(blackMoves.length)} />
        <StatRow label="Avg Time" white={`${(whiteAvgTime / 1000).toFixed(1)}s`} black={`${(blackAvgTime / 1000).toFixed(1)}s`} />
        <StatRow label="Legal %" white={`${whiteLegalRate.toFixed(0)}%`} black={`${blackLegalRate.toFixed(0)}%`} />
        <StatRow label="Illegal" white={String(whiteIllegal)} black={String(blackIllegal)} />
        <StatRow label="Tokens" white={whiteTokens ? whiteTokens.toLocaleString() : '—'} black={blackTokens ? blackTokens.toLocaleString() : '—'} />

        {stockfishEval && (
          <>
            <div className="text-text-muted">Engine</div>
            <div className="text-center text-text-primary col-span-2 font-mono text-xs">
              {formatEval(stockfishEval)} (d{stockfishEval.depth})
            </div>
          </>
        )}
      </div>

      {game.status !== 'in_progress' && game.status !== 'created' && game.result && (
        <div className="mt-3 pt-3 border-t border-surface-2">
          <ResultBadge result={game.result} white={game.white.displayName} black={game.black.displayName} />
        </div>
      )}

      {/* Streaming token display */}
      {streamingText ? (
        <StreamingDisplay text={streamingText} model={streamingModel} />
      ) : (
        <div className="mt-3 pt-3 border-t border-surface-2 text-xs text-text-muted">
          Turn {game.currentTurn} &middot; {(game.currentColor === 'w' ? game.white.displayName.split('/').pop() : game.black.displayName.split('/').pop()) || (game.currentColor === 'w' ? 'White' : 'Black')} to move &middot; {game.status}
        </div>
      )}
    </div>
  );
}

function MaterialBar({ advantage, whiteName, blackName }: { advantage: number; whiteName?: string; blackName?: string }) {
  const maxAdv = 20;
  const clamped = Math.max(-maxAdv, Math.min(maxAdv, advantage));
  const pct = ((clamped + maxAdv) / (2 * maxAdv)) * 100;

  return (
    <div className="mb-1">
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span>{whiteName || 'White'}</span>
        <span className={`font-medium ${advantage > 0 ? 'text-text-primary' : advantage < 0 ? 'text-text-primary' : 'text-text-muted'}`}>
          {advantage > 0 ? `+${advantage}` : advantage < 0 ? String(advantage) : 'Even'}
        </span>
        <span>{blackName || 'Black'}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 bg-white/70 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/70 rounded-full transition-all duration-300"
          style={{ width: `${100 - pct}%` }}
        />
      </div>
    </div>
  );
}

function StreamingDisplay({ text, model }: { text: string; model: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="mt-3 pt-3 border-t border-surface-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-pulse" />
        <span className="text-xs text-purple-light font-medium">
          {model.split('/').pop()} thinking...
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-24 overflow-y-auto text-xs font-mono text-text-secondary bg-surface-0 rounded px-2 py-1.5 whitespace-pre-wrap break-all"
      >
        {text}<span className="animate-pulse text-purple-accent">|</span>
      </div>
    </div>
  );
}

function StatRow({ label, white, black }: { label: string; white: string; black: string }) {
  return (
    <>
      <div className="text-text-muted">{label}</div>
      <div className="text-center text-text-primary">{white}</div>
      <div className="text-center text-text-primary">{black}</div>
    </>
  );
}

function ResultBadge({ result, white, black }: { result: NonNullable<GameState['result']>; white: string; black: string }) {
  if (result.outcome === 'decisive') {
    const winner = result.winner === 'w' ? white : black;
    return (
      <div className="text-sm">
        <span className="text-success font-medium">{winner.split('/').pop()}</span>
        <span className="text-text-secondary"> wins by {result.reason.replace(/_/g, ' ')}</span>
      </div>
    );
  }
  if (result.outcome === 'draw') {
    return (
      <div className="text-sm text-text-secondary">
        Draw by {result.reason.replace(/_/g, ' ')}
      </div>
    );
  }
  return (
    <div className="text-sm text-warning">
      Game aborted: {result.reason}
    </div>
  );
}
