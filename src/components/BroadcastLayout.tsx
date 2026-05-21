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
import type { NarrationMove } from '../tts/audio-queue';
import type { BoardAnnotations } from '../utils/board-annotations';
import type { PgnMove } from '../pgn/parser';

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
  /**
   * Last move played (latest runtime state). Used as a fallback when
   * no narration is active. When narrationMoveIndex >= 0 the lastMove
   * is derived from the narrated position instead.
   */
  lastMove?: { from: string; to: string };
  /**
   * Move index of the commentary currently being narrated. The board
   * displays the position AFTER this move. -1 means no narration yet
   * → board shows the latest applied position. Updated by
   * BroadcastView from AudioNarrationQueue's entry-start callback.
   */
  narrationMoveIndex: number;
  /** Squares to highlight (amber) — from the current sentence's text. */
  narrationSquares: string[];
  /** Model-driven board annotations parsed from inline tags. */
  narrationAnnotations?: BoardAnnotations;
  /** Move arrows for the currently-narrated move. */
  narrationArrows: NarrationMove[];
  /**
   * Parsed PGN moves indexed by ply, supplied by BroadcastView. The
   * authoritative source for `fen` / `from` / `to` per ply, regardless
   * of how the runtime's eventLog is populated (in replay mode the
   * eventLog only covers replayed moves, NOT priorMoveHistory, so
   * looking up FENs by eventLog index is incorrect).
   */
  pgnMoves: PgnMove[];
}

/**
 * Resolve the move whose narration is currently playing.
 *
 *  - narrationMoveIndex >= 0: return the parsed PGN ply at that index.
 *    The displayed board reflects the position AFTER that ply.
 *  - narrationMoveIndex == -1 (intro is playing, or no narration has
 *    started yet): return null. The caller falls back to the STARTING
 *    position from GameCreated.initialFen — not the runtime's latest
 *    move, which has raced ahead during async intro generation.
 *
 * Looks up FEN + from + to directly from the parsed PGN moves array,
 * which has correct per-ply data regardless of replay vs live mode.
 * (The runtime's eventLog only stores MoveApplied for replay moves,
 * not for priorMoveHistory, so eventLog-by-index lookups break for
 * short captures that fast-forward past a startPly.)
 */
function narratedMoveInfo(
  gameState: GameState,
  narrationMoveIndex: number,
  pgnMoves: PgnMove[],
): { san: string; turnNumber: number; color: 'w' | 'b'; fen: string; from?: string; to?: string } | null {
  if (narrationMoveIndex < 0) return null;
  const cap = Math.min(gameState.moveHistory.length - 1, pgnMoves.length - 1);
  if (cap < 0) return null;
  const idx = Math.min(narrationMoveIndex, cap);
  const move = gameState.moveHistory[idx];
  const pgnMove = pgnMoves[idx];
  if (!move || !pgnMove) return null;
  return {
    san: move.move,
    turnNumber: move.turnNumber,
    color: move.color,
    fen: pgnMove.fen,
    from: pgnMove.from,
    to: pgnMove.to,
  };
}

/**
 * The position before any replay move has been narrated — i.e. what
 * the viewer should see during the intro. Pulled from the GameCreated
 * event's initialFen so it's correct for both full-game and
 * short-with-startPly captures.
 */
function startingFenFor(gameState: GameState): string | null {
  for (const event of gameState.eventLog) {
    if (event.type === 'GameCreated') {
      return event.payload.initialFen;
    }
  }
  return null;
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
  narrationMoveIndex,
  narrationSquares,
  narrationAnnotations,
  narrationArrows,
  pgnMoves,
}: BroadcastLayoutProps) {
  // The displayed board tracks the NARRATED move, not the runtime's
  // latest. During the intro (narrationMoveIndex < 0), the runtime
  // can race ahead by several plies while the intro audio plays;
  // showing the runtime's current position would put the board past
  // moves the narrator hasn't reached. Fall back to the STARTING
  // position from GameCreated.initialFen instead — both for the
  // displayed FEN and for the recent-moves panel (empty during intro).
  const narratedInfo = narratedMoveInfo(gameState, narrationMoveIndex, pgnMoves);
  const startingFen = startingFenFor(gameState);
  const displayedFen = narratedInfo?.fen ?? startingFen ?? gameState.fen;
  const displayedLastMove =
    narratedInfo && narratedInfo.from && narratedInfo.to
      ? { from: narratedInfo.from, to: narratedInfo.to }
      : narratedInfo
        ? lastMove
        : undefined; // intro: no last-move highlight, the board is the opening position
  const effectiveMoveIndex = narratedInfo ? narrationMoveIndex : -1;
  const displayedMoveHistory = effectiveMoveIndex >= 0
    ? gameState.moveHistory.slice(0, effectiveMoveIndex + 1)
    : [];

  const recentMoves = useMemo(() => {
    // Last 6 plies of the DISPLAYED history (not the runtime's).
    const slice = displayedMoveHistory.slice(Math.max(0, displayedMoveHistory.length - 6));
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
  }, [displayedMoveHistory]);

  // Neutral counter during intro (no specific move narrated yet) so
  // the badge doesn't lie about which move the viewer is on.
  const moveCounterText = narratedInfo
    ? `Move ${narratedInfo.turnNumber}${narratedInfo.color === 'b' ? '…' : ''} · ${narratedInfo.san}`
    : 'Opening';

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
      displayedFen={displayedFen}
      lastMove={displayedLastMove}
      narrationSquares={narrationSquares}
      narrationAnnotations={narrationAnnotations}
      narrationArrows={narrationArrows}
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
    displayedFen={displayedFen}
    lastMove={displayedLastMove}
    narrationSquares={narrationSquares}
    narrationAnnotations={narrationAnnotations}
    narrationArrows={narrationArrows}
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
  displayedFen: string;
  lastMove?: { from: string; to: string };
  narrationSquares: string[];
  narrationAnnotations?: BoardAnnotations;
  narrationArrows: NarrationMove[];
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
  displayedFen,
  lastMove,
  narrationSquares,
  narrationAnnotations,
  narrationArrows,
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
            <Board
              fen={displayedFen}
              lastMove={lastMove}
              highlightSquares={narrationSquares}
              arrows={narrationArrows}
              annotations={narrationAnnotations}
            />
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
  displayedFen,
  lastMove,
  narrationSquares,
  narrationAnnotations,
  narrationArrows,
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
          <Board
            fen={displayedFen}
            lastMove={lastMove}
            highlightSquares={narrationSquares}
            arrows={narrationArrows}
            annotations={narrationAnnotations}
          />
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
