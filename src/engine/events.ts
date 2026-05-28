import type { PlayerConfig, PieceColor, GameResult, MoveAttempt, OracleAttemptRecord, PredictedLine } from './types';
import type { BenchmarkFraming, CorrectionLoopMode, OutputFormat, ResponseToolInvocation } from './types';
import type { MoveRecord } from './types';

interface BaseEvent {
  eventId: string;
  gameId: string;
  timestamp: number;
  sequence: number;
}

export interface GameCreatedEvent extends BaseEvent {
  type: 'GameCreated';
  payload: {
    white: PlayerConfig;
    black: PlayerConfig;
    initialFen: string;
    priorMoveHistory?: MoveRecord[];
  };
}

export interface GameStartedEvent extends BaseEvent {
  type: 'GameStarted';
  payload: Record<string, never>;
}

export interface TurnStartedEvent extends BaseEvent {
  type: 'TurnStarted';
  payload: {
    turnNumber: number;
    color: PieceColor;
    fen: string;
    legalMoves: string[];
  };
}

export interface LLMPromptedEvent extends BaseEvent {
  type: 'LLMPrompted';
  payload: {
    color: PieceColor;
    model: string;
    fen: string;
    legalMoveCount: number;
  };
}

export interface LLMRespondedEvent extends BaseEvent {
  type: 'LLMResponded';
  payload: {
    color: PieceColor;
    model: string;
    responseTimeMs: number;
    raw: string;
    parsed: MoveAttempt | null;
    tokensUsed?: number;
  };
}

export interface MoveValidatedEvent extends BaseEvent {
  type: 'MoveValidated';
  payload: {
    color: PieceColor;
    attemptedMove: string;
    isLegal: boolean;
    san?: string;
    attemptNumber: number;
  };
}

export interface MoveAppliedEvent extends BaseEvent {
  type: 'MoveApplied';
  payload: {
    color: PieceColor;
    san: string;
    from: string;
    to: string;
    fen: string;
    reasoning?: string;
    reasoningTrace?: string;
    thinkingTimeMs: number;
    attemptNumber: number;
    isCheck: boolean;
    isCheckmate: boolean;
    isCapture: boolean;
    capturedPiece?: string;
    oracleAttempts?: OracleAttemptRecord[];
    outputFormat?: OutputFormat;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    plan?: string;
    threats?: string;
    phase?: string;
    assessment?: string;
    initialMove?: string;
    revisedMove?: string;
    revisionReason?: string;
    didRevise?: boolean;
    advisorMove?: string;
    advisorInfo?: string;
    predictedLines?: PredictedLine[];
    // Token usage
    promptTokens?: number;
    completionTokens?: number;
    ttftMs?: number;
    // Extended timing decomposition (Taxonomy §2)
    wallClockMs?: number;
    networkLatencyMs?: number;
    streamDurationMs?: number;
    tokensPerSecond?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    // Move source tracking
    moveSource?: import('./types').MoveSource;
    constraintViolation?: string;
    advisorElo?: number;
    advisorVisibility?: import('./types').AdvisorVisibility;
    advisorProvenanceFrame?: import('./types').ProvenanceFrame;
    correctionLoopMode?: CorrectionLoopMode;
    correctionRounds?: number;
    fogVisibilityMode?: import('./types').FogVisibilityMode;
    boardReconstructionAccuracy?: number;
    phantomMove?: boolean;
    toolInvocations?: ResponseToolInvocation[];
    scratchpadState?: string;
    benchmarkFraming?: BenchmarkFraming;
    // Illegal move attempts during this turn (for commentary context)
    illegalMovesAttempted?: string[];
    // Attack tracking
    attackActive?: boolean;
    activeAttackVectors?: Array<{ channel: string; vectorId: string }>;
    attackPattern?: string;
    attackTiming?: string;
    attackIntensity?: number;
  };
}

export interface AttackTransitionEvent extends BaseEvent {
  type: 'AttackTransition';
  payload: {
    color: PieceColor;
    turnNumber: number;
    eventType: string;
    description: string;
    details: Record<string, unknown>;
  };
}

export interface IllegalMoveAttemptedEvent extends BaseEvent {
  type: 'IllegalMoveAttempted';
  payload: {
    color: PieceColor;
    attemptedMove: string;
    reason: string;
    attemptNumber: number;
    maxAttempts: number;
  };
}

export interface GameEndedEvent extends BaseEvent {
  type: 'GameEnded';
  payload: {
    result: GameResult;
    finalFen: string;
    totalMoves: number;
    durationMs: number;
    attackContext?: {
      activeVectors: Array<{ channel: string; vectorId: string }>;
      timing: string | null;
      pattern: string | null;
    };
  };
}

export interface GameAbortedEvent extends BaseEvent {
  type: 'GameAborted';
  payload: {
    reason: string;
  };
}

export interface ErrorOccurredEvent extends BaseEvent {
  type: 'ErrorOccurred';
  payload: {
    error: string;
    context: string;
    fatal: boolean;
  };
}

// ───────────────────────────────────────────────────────────────
// Branch playback events (Track A instructor board control).
//
// A "branch" is a hypothetical line the lesson plays on the actual
// board, then returns from. Conceptually: pause main → rewind/jump
// to a starting FEN → play branchMoves[] → restore main position.
// The reducer tracks branch state separately from the main move
// history so consumers can render the branch overlay without
// polluting the canonical move list.
// ───────────────────────────────────────────────────────────────

export interface BranchStartedEvent extends BaseEvent {
  type: 'BranchStarted';
  payload: {
    /** Stable id for this branch (matches BoardBranch.id if authored). */
    branchId: string;
    /** Episode ply the main line was on when the branch fired. */
    fromMainPly: number;
    /** FEN we'll rewind to before playing branchMoves[]. */
    startingFen: string;
    /**
     * FEN of the main-line position at the moment the branch fired.
     * The board renders THIS while the opening narration plays so the
     * viewer sees "here's where we are; let me show you an alternative"
     * with full context before the rewind. The rewind to startingFen
     * happens on `BranchPositionRewound`, after the opening narration.
     */
    mainLineFen: string;
    /** Display title for the banner overlay. Empty string = no banner. */
    title: string;
  };
}

/**
 * Emitted AFTER the branch's opening narration finishes but BEFORE
 * the per-move loop begins. The board snaps to the branch's
 * `startingFen` on this event — giving the viewer the rewind only
 * after they've heard the framing.
 */
export interface BranchPositionRewoundEvent extends BaseEvent {
  type: 'BranchPositionRewound';
  payload: {
    branchId: string;
    startingFen: string;
  };
}

export interface BranchMoveAppliedEvent extends BaseEvent {
  type: 'BranchMoveApplied';
  payload: {
    /** Same branch id as the wrapping BranchStarted. */
    branchId: string;
    /** 1-indexed position within this branch's branchMoves[]. */
    branchPly: number;
    color: PieceColor;
    san: string;
    from: string;
    to: string;
    fen: string;
    isCheck: boolean;
    isCheckmate: boolean;
    isCapture: boolean;
  };
}

export interface BranchEndedEvent extends BaseEvent {
  type: 'BranchEnded';
  payload: {
    branchId: string;
    /** FEN of the main line we restored to. */
    resumeFen: string;
    /** Episode ply the main line resumes from. Usually == fromMainPly. */
    resumeMainPly: number;
  };
}

export type GameEvent =
  | GameCreatedEvent
  | GameStartedEvent
  | TurnStartedEvent
  | LLMPromptedEvent
  | LLMRespondedEvent
  | MoveValidatedEvent
  | MoveAppliedEvent
  | AttackTransitionEvent
  | IllegalMoveAttemptedEvent
  | GameEndedEvent
  | GameAbortedEvent
  | ErrorOccurredEvent
  | BranchStartedEvent
  | BranchPositionRewoundEvent
  | BranchMoveAppliedEvent
  | BranchEndedEvent;

export type GameEventType = GameEvent['type'];
