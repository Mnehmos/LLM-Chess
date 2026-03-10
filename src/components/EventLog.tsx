import { useState } from 'react';
import type { GameEvent } from '../engine/events';

interface EventLogProps {
  events: GameEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  GameCreated: 'text-purple-light',
  GameStarted: 'text-success',
  TurnStarted: 'text-text-muted',
  LLMPrompted: 'text-blue-400',
  LLMResponded: 'text-blue-300',
  MoveValidated: 'text-text-secondary',
  MoveApplied: 'text-success',
  IllegalMoveAttempted: 'text-error',
  GameEnded: 'text-purple-accent',
  GameAborted: 'text-warning',
  ErrorOccurred: 'text-error',
};

export function EventLog({ events }: EventLogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-surface-1 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-text-secondary hover:bg-surface-2 transition-colors"
      >
        <span>Event Log ({events.length})</span>
        <span>{isOpen ? '-' : '+'}</span>
      </button>

      {isOpen && (
        <div className="max-h-64 overflow-y-auto px-4 pb-3">
          {events.map((event, i) => (
            <div key={i} className="flex gap-2 text-xs py-0.5 font-mono">
              <span className="text-text-muted w-6 text-right shrink-0">{event.sequence}</span>
              <span className={`${EVENT_COLORS[event.type] || 'text-text-secondary'} shrink-0`}>
                {event.type}
              </span>
              <span className="text-text-muted truncate">
                {summarizeEvent(event)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summarizeEvent(event: GameEvent): string {
  switch (event.type) {
    case 'TurnStarted': return `Turn ${event.payload.turnNumber} ${event.payload.color === 'w' ? 'White' : 'Black'} (${event.payload.legalMoves.length} legal)`;
    case 'LLMPrompted': return `${event.payload.model}`;
    case 'LLMResponded': return `${event.payload.responseTimeMs}ms`;
    case 'MoveValidated': return `${event.payload.attemptedMove} ${event.payload.isLegal ? 'OK' : 'ILLEGAL'}`;
    case 'MoveApplied': return `${event.payload.san}${event.payload.isCheck ? '+' : ''}${event.payload.isCapture ? ' (capture)' : ''}`;
    case 'IllegalMoveAttempted': return `${event.payload.attemptedMove}: ${event.payload.reason}`;
    case 'GameEnded': return `${event.payload.result.outcome}`;
    case 'ErrorOccurred': return event.payload.error;
    default: return '';
  }
}
