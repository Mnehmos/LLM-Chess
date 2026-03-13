import { useState, useEffect } from 'react';
import type { GameState } from '../engine/types';
import type { EvalResult } from '../chess/stockfish';
import type { CommentaryEntry } from '../commentary/commentaryQueue';
import type { NarrationMove } from '../tts/audio-queue';
import type { BoardAnnotations } from '../utils/board-annotations';
import { Board } from './Board';
import { MoveHistory } from './MoveHistory';
import { LiveStats } from './LiveStats';
import { Graveyard } from './Graveyard';
import { TurnStepper } from './TurnStepper';
import { CommentaryPanel } from './CommentaryPanel';
import { HumanMoveInput } from './HumanMoveInput';
import { EventLog } from './EventLog';
import { formatEval } from '../chess/stockfish';

interface GameLayoutProps {
  gameState: GameState;
  displayFen: string;
  lastMove?: { from: string; to: string };
  commentaryEntries: CommentaryEntry[];
  commentatorModelName?: string;
  stockfishEval?: EvalResult | null;
  streamingText?: string;
  streamingModel?: string;
  viewingMoveIndex: number | null;
  setViewingMoveIndex: (index: number | null) => void;
  showHumanMoveInput?: boolean;
  showEventLog?: boolean;
  livestreamMode?: boolean;
  onToggleLivestream?: () => void;
  onNarrationStart?: (maxMoveIndex: number, moves: NarrationMove[]) => void;
  onNarrationSquares?: (squares: string[], annotations: BoardAnnotations) => void;
  highlightSquares?: string[];
  /** Arrows to draw on the board (from narration-synced moves). */
  arrows?: NarrationMove[];
  /** Model-driven board annotations from commentary. */
  boardAnnotations?: BoardAnnotations;
  /** Shared ref for dead air measurement feedback loop. */
  deadAirRef?: React.MutableRefObject<number>;
  /** Shared ref for audio backlog count (filler system reads it). */
  audioBacklogRef?: React.MutableRefObject<number>;
  /** Shared ref for actual narration playback state. */
  audioPlayingRef?: React.MutableRefObject<boolean>;
  /** Called when the audio queue fully drains — lets the filler system re-check. */
  onAudioDrained?: () => void;
  /** Override turn number to match narration pace. */
  displayTurn?: number;
  /** Limit displayed moves to this count (narration-synced). null = show all. */
  displayMoveCount?: number | null;
  children?: React.ReactNode;
}

function StockfishBar({ eval: ev }: { eval: EvalResult }) {
  const display = formatEval(ev);
  const maxCp = 500;
  const clampedCp = Math.max(-maxCp, Math.min(maxCp, ev.scoreCp));
  const pct = ((clampedCp + maxCp) / (2 * maxCp)) * 100;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span>Stockfish (d{ev.depth})</span>
        <span className={`font-mono font-medium ${
          ev.scoreCp > 50 ? 'text-text-primary' :
          ev.scoreCp < -50 ? 'text-text-primary' :
          'text-text-muted'
        }`}>
          {display}
        </span>
      </div>
      <div className="h-3 rounded-full bg-surface-2 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 bg-white/80 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/80 rounded-full transition-all duration-500"
          style={{ width: `${100 - pct}%` }}
        />
      </div>
    </div>
  );
}

/** Compact eval + player names overlay for livestream mode */
function LivestreamOverlay({ gameState, stockfishEval, streamingText, streamingModel, displayTurn }: {
  gameState: GameState;
  stockfishEval?: EvalResult | null;
  streamingText?: string;
  streamingModel?: string;
  displayTurn?: number;
}) {
  const whiteName = gameState.white.displayName.split('/').pop() || 'White';
  const blackName = gameState.black.displayName.split('/').pop() || 'Black';
  const whiteMoves = gameState.moveHistory.filter(m => m.color === 'w');
  const blackMoves = gameState.moveHistory.filter(m => m.color === 'b');
  const whiteAvg = whiteMoves.length > 0
    ? (whiteMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / whiteMoves.length / 1000).toFixed(1)
    : '—';
  const blackAvg = blackMoves.length > 0
    ? (blackMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / blackMoves.length / 1000).toFixed(1)
    : '—';

  const isThinking = !!streamingText;
  const thinkingColor = streamingModel
    ? (gameState.white.displayName.includes(streamingModel.split('/').pop() || '???') ? 'w' : 'b')
    : gameState.currentColor;

  return (
    <div className="flex flex-col gap-2">
      {/* Player nameplates */}
      <div className="flex items-center justify-between bg-surface-0/80 backdrop-blur rounded-lg px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white border border-surface-3" />
          <span className="text-sm font-semibold text-text-primary">{whiteName}</span>
          <span className="text-xs text-text-muted">{whiteAvg}s avg</span>
          {isThinking && thinkingColor === 'w' && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-mono text-text-muted">
          <span>Turn {displayTurn ?? gameState.currentTurn}</span>
          {stockfishEval && (
            <span className={`ml-2 font-medium ${
              stockfishEval.scoreCp > 100 ? 'text-white' :
              stockfishEval.scoreCp < -100 ? 'text-gray-400' :
              'text-text-secondary'
            }`}>
              {formatEval(stockfishEval)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isThinking && thinkingColor === 'b' && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-pulse" />
          )}
          <span className="text-xs text-text-muted">{blackAvg}s avg</span>
          <span className="text-sm font-semibold text-text-primary">{blackName}</span>
          <div className="w-3 h-3 rounded-full bg-gray-700 border border-surface-3" />
        </div>
      </div>

      {/* Eval bar */}
      {stockfishEval && <StockfishBar eval={stockfishEval} />}
    </div>
  );
}

export function GameLayout({
  gameState,
  displayFen,
  lastMove,
  commentaryEntries,
  commentatorModelName,
  stockfishEval,
  streamingText,
  streamingModel,
  viewingMoveIndex,
  setViewingMoveIndex,
  showHumanMoveInput,
  showEventLog,
  livestreamMode,
  onToggleLivestream,
  onNarrationStart,
  onNarrationSquares,
  highlightSquares,
  arrows,
  boardAnnotations,
  deadAirRef,
  audioBacklogRef,
  audioPlayingRef,
  onAudioDrained,
  displayTurn,
  displayMoveCount,
  children,
}: GameLayoutProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // When displayMoveCount is set, slice moveHistory to only show narrated moves
  const visibleMoveHistory = displayMoveCount !== undefined && displayMoveCount !== null
    ? gameState.moveHistory.slice(0, displayMoveCount)
    : gameState.moveHistory;
  // Provide a game state view with sliced moveHistory for LiveStats
  // Also override currentTurn and currentColor to match the narrated position
  const visibleGameState = displayMoveCount !== undefined && displayMoveCount !== null
    ? {
        ...gameState,
        moveHistory: visibleMoveHistory,
        currentTurn: Math.floor(visibleMoveHistory.length / 2) + 1,
        currentColor: (visibleMoveHistory.length % 2 === 0 ? 'w' : 'b') as 'w' | 'b',
        // Gate result/status to narration position — don't spoil the outcome
        // until the commentator has narrated through the final move.
        result: displayMoveCount >= gameState.moveHistory.length ? (gameState.result ?? undefined) : undefined,
        status: displayMoveCount >= gameState.moveHistory.length ? gameState.status : 'in_progress' as const,
      }
    : gameState;

  // Gate stockfishEval to narration position — don't spoil the live game eval
  const visibleStockfishEval = displayMoveCount !== undefined && displayMoveCount !== null && displayMoveCount < gameState.moveHistory.length
    ? undefined
    : stockfishEval;

  if (livestreamMode) {
    return (
      <div className="flex flex-col gap-3">
        {/* Livestream header bar */}
        <LivestreamOverlay
          gameState={gameState}
          stockfishEval={visibleStockfishEval}
          streamingText={streamingText}
          streamingModel={streamingModel}
          displayTurn={displayTurn}
        />

        {/* Main 3-column layout — optimised for 1920×1080 */}
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '340px auto 580px' }}>
          {/* Left: Stats + Move list */}
          <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            <LiveStats
              game={visibleGameState}
              streamingText={streamingText}
              streamingModel={streamingModel}
              stockfishEval={visibleStockfishEval}
            />
            <MoveHistory
              moves={visibleMoveHistory}
              activeIndex={displayMoveCount !== undefined && displayMoveCount !== null ? displayMoveCount - 1 : undefined}
            />
          </div>

          {/* Center: Board — scaled up for 1080p */}
          <div className="flex flex-col items-center gap-2">
            <Graveyard eventLog={gameState.eventLog} />
            {/* Scale board 1.5× — container sized to scaled dimensions so grid respects it */}
            <div style={{ width: 612, height: 606, position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, transform: 'scale(1.5)', transformOrigin: 'top left' }}>
                <Board
                  fen={displayFen}
                  lastMove={lastMove}
                  highlightSquares={highlightSquares}
                  arrows={arrows}
                  annotations={boardAnnotations}
                />
              </div>
            </div>
            <TurnStepper
              eventLog={gameState.eventLog}
              viewingMoveIndex={viewingMoveIndex}
              setViewingMoveIndex={setViewingMoveIndex}
            />
            {visibleStockfishEval && <StockfishBar eval={visibleStockfishEval} />}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen();
                  } else {
                    void document.documentElement.requestFullscreen();
                  }
                }}
                className="text-xs text-text-muted hover:text-purple-light transition-colors"
                title="Toggle fullscreen (F11)"
              >
                {isFullscreen ? '⊡ Exit Fullscreen' : '⊞ Fullscreen'}
              </button>
              {onToggleLivestream && (
                <button
                  type="button"
                  onClick={onToggleLivestream}
                  className="text-xs text-purple-light hover:text-purple-accent transition-colors"
                >
                  Exit Livestream
                </button>
              )}
            </div>
          </div>

          {/* Right: Commentary — large and tall */}
          <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 200px)' }}>
            <CommentaryPanel
              entries={commentaryEntries}
              commentatorModelName={commentatorModelName}
              sessionKey={gameState.gameId}
              onNarrationStart={onNarrationStart}
              onNarrationSquares={onNarrationSquares}
              deadAirRef={deadAirRef}
              audioBacklogRef={audioBacklogRef}
              audioPlayingRef={audioPlayingRef}
              onAudioDrained={onAudioDrained}
            />
          </div>
        </div>

        {showHumanMoveInput && <HumanMoveInput />}
        {showEventLog && <EventLog events={gameState.eventLog} />}
        {children}
      </div>
    );
  }

  // --- Standard layout ---
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_auto_1fr] gap-4">
      {/* Column 1: Commentary — constrained height so it scrolls internally */}
      <div className="min-w-0 max-h-[600px]">
        <CommentaryPanel
          entries={commentaryEntries}
          commentatorModelName={commentatorModelName}
          sessionKey={gameState.gameId}
          onNarrationStart={onNarrationStart}
          onNarrationSquares={onNarrationSquares}
          deadAirRef={deadAirRef}
          audioBacklogRef={audioBacklogRef}
          audioPlayingRef={audioPlayingRef}
          onAudioDrained={onAudioDrained}
        />
      </div>

      {/* Column 2: Board area */}
      <div className="flex flex-col items-center lg:items-start gap-2">
        <Graveyard eventLog={gameState.eventLog} />
        <Board fen={displayFen} lastMove={lastMove} highlightSquares={highlightSquares} arrows={arrows} annotations={boardAnnotations} />
        <TurnStepper
          eventLog={gameState.eventLog}
          viewingMoveIndex={viewingMoveIndex}
          setViewingMoveIndex={setViewingMoveIndex}
        />
        {visibleStockfishEval && <StockfishBar eval={visibleStockfishEval} />}
      </div>

      {/* Column 3: Stats, moves, extras */}
      <div className="flex flex-col gap-4 min-w-0">
        {onToggleLivestream && (
          <button
            type="button"
            onClick={onToggleLivestream}
            className="self-end px-3 py-1 rounded text-xs font-medium bg-purple-dim text-purple-light hover:bg-purple-accent hover:text-white transition-colors"
          >
            Livestream
          </button>
        )}
        <LiveStats
          game={visibleGameState}
          streamingText={streamingText}
          streamingModel={streamingModel}
          stockfishEval={visibleStockfishEval}
        />
        {showHumanMoveInput && <HumanMoveInput />}
        <MoveHistory moves={visibleMoveHistory} />
        {showEventLog && <EventLog events={gameState.eventLog} />}
        {children}
      </div>
    </div>
  );
}
