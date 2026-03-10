import type { PlayerConfig, PieceColor, GameResult, MoveAttempt, OracleAttemptRecord, PredictedLine } from './types';
import type { BenchmarkFraming, CorrectionLoopMode, OutputFormat, ResponseToolInvocation } from './types';

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
  | ErrorOccurredEvent;

export type GameEventType = GameEvent['type'];
