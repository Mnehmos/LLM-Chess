import type { GameEvent } from '../engine/events';

interface TurnStepperProps {
  eventLog: GameEvent[];
  viewingMoveIndex: number | null;
  setViewingMoveIndex: (index: number | null) => void;
}

export function TurnStepper({ eventLog, viewingMoveIndex, setViewingMoveIndex }: TurnStepperProps) {

  // Collect all MoveApplied events for stepping
  const moveEvents = eventLog.filter(e => e.type === 'MoveApplied');
  const totalMoves = moveEvents.length;

  if (totalMoves === 0) return null;

  const isLive = viewingMoveIndex === null;
  const currentIndex = isLive ? totalMoves - 1 : viewingMoveIndex;

  const goFirst = () => setViewingMoveIndex(0);
  const goPrev = () => {
    if (currentIndex > 0) setViewingMoveIndex(currentIndex - 1);
  };
  const goNext = () => {
    if (currentIndex < totalMoves - 1) setViewingMoveIndex(currentIndex + 1);
    else setViewingMoveIndex(null);
  };
  const goLive = () => setViewingMoveIndex(null);

  return (
    <div className="flex items-center justify-center gap-1">
      <StepButton onClick={goFirst} disabled={currentIndex === 0 && !isLive} title="First move">
        &#x23EE;
      </StepButton>
      <StepButton onClick={goPrev} disabled={currentIndex === 0 && !isLive} title="Previous move">
        &#x23F4;
      </StepButton>
      <span className="text-xs text-text-muted min-w-[4rem] text-center">
        {isLive ? 'Live' : `${currentIndex + 1} / ${totalMoves}`}
      </span>
      <StepButton onClick={goNext} disabled={isLive} title="Next move">
        &#x23F5;
      </StepButton>
      <StepButton onClick={goLive} disabled={isLive} title="Go to live position" highlight={!isLive}>
        &#x23ED;
      </StepButton>
    </div>
  );
}

function StepButton({ onClick, disabled, title, children, highlight }: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors ${
        disabled
          ? 'text-text-muted/30 cursor-not-allowed'
          : highlight
            ? 'text-purple-accent hover:bg-purple-accent/20'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
