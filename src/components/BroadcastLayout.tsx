/**
 * BroadcastLayout — video-framed layout for the MP4 export pipeline.
 *
 * Designed specifically for fixed-pixel captures (1920x1080 full,
 * 1080x1920 short), not for the desktop SPA. Goals:
 *   - Board fills the visual frame (no dead black space)
 *   - No interactive UI (no Stop / Livestream buttons)
 *   - Commentary captions in a video-friendly position
 *   - Eval bar prominently visible
 *   - Recent moves visible without scrolling
 *
 * Sources its state from the tournament store so the existing replay
 * runtime, commentary queue, and TTS pipeline are reused unchanged.
 */

import { useMemo } from 'react';
import type { GameState } from '../engine/types';
import type { EvalResult } from '../chess/stockfish';
import { formatEval } from '../chess/stockfish';
import { Board } from './Board';
import type { CommentaryEntry } from '../commentary/commentaryQueue';

interface BroadcastLayoutProps {
  gameState: GameState;
  /** Most recent commentary entry — its text is what's currently being narrated. */
  liveCommentaryText: string;
  /** All commentary entries (used for "recent moves" sidebar). */
  commentaryEntries: CommentaryEntry[];
  stockfishEval: EvalResult | null;
  /** Episode title displayed in the top bar. */
  title: string;
  /** Subtitle displayed under the title (e.g. "The Opera Game · 1858"). */
  subtitle?: string;
  /** 'full' = 1920x1080 (landscape); 'short' = 1080x1920 (portrait). */
  orientation: 'full' | 'short';
  /** Last move played, for board highlighting. */
  lastMove?: { from: string; to: string };
}

/**
 * Resolve the latest move applied and its turn number for display.
 * In broadcast mode the board ALWAYS shows the latest position —
 * unlike the SPA which gates display on narration progress.
 */
function lastMoveInfo(gameState: GameState): { san: string; turnNumber: number; color: 'w' | 'b' } | null {
  const last = gameState.moveHistory[gameState.moveHistory.length - 1];
  if (!last) return null;
  return { san: last.move, turnNumber: last.turnNumber, color: last.color };
}

export function BroadcastLayout({
  gameState,
  liveCommentaryText,
  commentaryEntries,
  stockfishEval,
  title,
  subtitle,
  orientation,
  lastMove,
}: BroadcastLayoutProps) {
  const recentMoves = useMemo(() => {
    // Last 6 plies, formatted "16. Qb8+!! Nxb8".
    const all = gameState.moveHistory;
    const slice = all.slice(Math.max(0, all.length - 6));
    const pairs: { turn: number; white?: string; black?: string }[] = [];
    for (const m of slice) {
      const last = pairs[pairs.length - 1];
      if (m.color === 'w') {
        pairs.push({ turn: m.turnNumber, white: m.move });
      } else if (last && last.turn === m.turnNumber && last.white) {
        last.black = m.move;
      } else {
        pairs.push({ turn: m.turnNumber, black: m.move });
      }
    }
    return pairs;
  }, [gameState.moveHistory]);

  const moveInfo = lastMoveInfo(gameState);
  const moveCounterText = moveInfo
    ? `Move ${moveInfo.turnNumber}${moveInfo.color === 'b' ? '…' : ''} · ${moveInfo.san}`
    : 'Move 1';

  // Eval bar percentage. Clamps centipawns to ±500 then maps to 0..100%
  // of white's lead. Mate is treated as the full bar.
  const evalPct = useMemo(() => {
    if (!stockfishEval) return 50;
    if (stockfishEval.isMate) return (stockfishEval.mateIn ?? 0) >= 0 ? 99 : 1;
    const clamped = Math.max(-500, Math.min(500, stockfishEval.scoreCp));
    return ((clamped + 500) / 1000) * 100;
  }, [stockfishEval]);
  const evalLabel = stockfishEval ? formatEval(stockfishEval) : '0.00';

  // Display only the most recent commentary entry's running text.
  // Fall back to the second-to-last when the most recent is empty
  // (commentator hasn't produced yet but the move advanced).
  const liveCaption =
    liveCommentaryText ||
    [...commentaryEntries].reverse().find((e) => e.text)?.text ||
    '';

  if (orientation === 'short') {
    return <ShortLayout
      gameState={gameState}
      lastMove={lastMove}
      title={title}
      subtitle={subtitle}
      moveCounterText={moveCounterText}
      liveCaption={liveCaption}
      recentMoves={recentMoves}
      evalPct={evalPct}
      evalLabel={evalLabel}
    />;
  }
  return <FullLayout
    gameState={gameState}
    lastMove={lastMove}
    title={title}
    subtitle={subtitle}
    moveCounterText={moveCounterText}
    liveCaption={liveCaption}
    recentMoves={recentMoves}
    evalPct={evalPct}
    evalLabel={evalLabel}
  />;
}

interface LayoutSlotProps {
  gameState: GameState;
  lastMove?: { from: string; to: string };
  title: string;
  subtitle?: string;
  moveCounterText: string;
  liveCaption: string;
  recentMoves: { turn: number; white?: string; black?: string }[];
  evalPct: number;
  evalLabel: string;
}

/**
 * 16:9 landscape: board on the left ~60% of the frame, narration +
 * recent moves on the right. Title bar at the top, eval bar under
 * the board.
 *
 * The Board component is 384x384 by default; CSS `zoom: 2.4` scales
 * it to ~922 px (just shy of the 960 px column width) so it's
 * visually centered inside the left half of a 1920x1080 frame.
 */
function FullLayout({
  gameState,
  lastMove,
  title,
  subtitle,
  moveCounterText,
  liveCaption,
  recentMoves,
  evalPct,
  evalLabel,
}: LayoutSlotProps) {
  return (
    <div className="w-screen h-screen bg-surface-0 text-text-primary flex flex-col overflow-hidden">
      {/* Title bar */}
      <header className="h-20 px-10 flex items-center justify-between border-b border-surface-2 shrink-0">
        <div>
          <div className="text-3xl font-bold leading-tight">{title}</div>
          {subtitle && <div className="text-sm text-text-muted mt-0.5">{subtitle}</div>}
        </div>
        <div className="text-xl text-text-secondary font-mono">{moveCounterText}</div>
      </header>

      {/* Main split: board left, commentary + moves right */}
      <main className="flex-1 flex min-h-0">
        {/* Board column — fills available height. CSS zoom scales the
            384 px board up to ~922 px while keeping pixel-perfect
            chess geometry. */}
        <section className="flex-1 flex flex-col items-center justify-center px-10 min-w-0">
          <div style={{ zoom: 2.4 }}>
            <Board fen={gameState.fen} lastMove={lastMove} />
          </div>
          <EvalBar pct={evalPct} label={evalLabel} className="mt-4 w-[600px]" />
        </section>

        {/* Right sidebar — commentary + recent moves */}
        <aside className="w-[680px] border-l border-surface-2 flex flex-col min-h-0 px-8 py-6 gap-6 shrink-0">
          <CommentaryPanel text={liveCaption} large />
          <RecentMovesPanel moves={recentMoves} />
        </aside>
      </main>
    </div>
  );
}

/**
 * 9:16 portrait: title bar, then a square 1080x1080 board, then the
 * eval bar, then a large caption area for the commentary, then a
 * compact recent-moves row. Optimized for vertical phone consumption.
 */
function ShortLayout({
  gameState,
  lastMove,
  title,
  subtitle,
  moveCounterText,
  liveCaption,
  recentMoves,
  evalPct,
  evalLabel,
}: LayoutSlotProps) {
  return (
    <div className="w-screen h-screen bg-surface-0 text-text-primary flex flex-col overflow-hidden">
      {/* Title — tighter for vertical */}
      <header className="px-8 py-6 border-b border-surface-2 shrink-0">
        <div className="text-2xl font-bold leading-tight">{title}</div>
        {subtitle && <div className="text-sm text-text-muted mt-0.5">{subtitle}</div>}
        <div className="text-base text-text-secondary font-mono mt-2">{moveCounterText}</div>
      </header>

      {/* Square board — fills width. zoom 2.7 = ~1037 px which leaves
          a thin border at 1080 px frame width. */}
      <section className="shrink-0 flex justify-center py-2">
        <div style={{ zoom: 2.7 }}>
          <Board fen={gameState.fen} lastMove={lastMove} />
        </div>
      </section>

      <div className="px-8 shrink-0">
        <EvalBar pct={evalPct} label={evalLabel} className="w-full" />
      </div>

      {/* Caption area — fills remaining space */}
      <section className="flex-1 min-h-0 px-8 py-6 overflow-hidden">
        <CommentaryPanel text={liveCaption} large extraLarge />
      </section>

      {/* Compact recent-moves footer */}
      <footer className="px-8 py-4 border-t border-surface-2 shrink-0 max-h-32 overflow-hidden">
        <RecentMovesPanel moves={recentMoves} compact />
      </footer>
    </div>
  );
}

function CommentaryPanel({ text, large, extraLarge }: { text: string; large?: boolean; extraLarge?: boolean }) {
  const size = extraLarge ? 'text-3xl leading-snug' : large ? 'text-xl leading-relaxed' : 'text-base leading-normal';
  return (
    <div className={`text-text-primary ${size} font-medium`}>
      {text || <span className="text-text-muted italic">Commentary will appear here…</span>}
    </div>
  );
}

function RecentMovesPanel({
  moves,
  compact,
}: {
  moves: { turn: number; white?: string; black?: string }[];
  compact?: boolean;
}) {
  if (moves.length === 0) {
    return <div className="text-text-muted italic text-sm">No moves yet</div>;
  }
  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-mono text-text-secondary">
        {moves.map((m, i) => (
          <span key={i}>
            <span className="text-text-muted">{m.turn}.</span>{' '}
            {m.white ?? '…'}
            {m.black && <span className="ml-1">{m.black}</span>}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div className="text-sm uppercase text-text-muted mb-2 tracking-wider">Recent</div>
      <div className="space-y-1 text-base font-mono">
        {moves.map((m, i) => (
          <div key={i}>
            <span className="text-text-muted w-8 inline-block">{m.turn}.</span>{' '}
            <span className="text-text-primary">{m.white ?? '…'}</span>
            {m.black && <span className="text-text-primary ml-3">{m.black}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvalBar({ pct, label, className }: { pct: number; label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-white to-purple-light"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-sm font-mono text-text-secondary w-16 text-right">{label}</div>
    </div>
  );
}
