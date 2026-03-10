import type { GameState, GameStatus, GameResult } from './types';
import type { GameEvent } from './events';
import { createInitialGameState } from './types';

function mapResultToStatus(result: GameResult): GameStatus {
  if (result.outcome === 'aborted') return 'aborted';
  if (result.outcome === 'draw') {
    switch (result.reason) {
      case 'stalemate': return 'stalemate';
      case 'insufficient_material': return 'draw_insufficient';
      case 'threefold_repetition': return 'draw_threefold';
      case 'fifty_move_rule': return 'draw_fifty_moves';
    }
  }
  if (result.outcome === 'decisive') {
    switch (result.reason) {
      case 'checkmate': return 'checkmate';
      case 'resignation': return 'resigned';
      case 'illegal_move_limit': return 'error';
      case 'timeout': return 'error';
      case 'declared_compromised': return 'error';
    }
  }
  return 'error';
}

export function gameReducer(state: GameState, event: GameEvent): GameState {
  const withEvent = { ...state, eventLog: [...state.eventLog, event] };

  switch (event.type) {
    case 'GameCreated':
      return {
        ...createInitialGameState(
          event.gameId,
          event.payload.white,
          event.payload.black,
          event.payload.initialFen,
        ),
        startedAt: event.timestamp,
        eventLog: [event],
      };

    case 'GameStarted':
      return { ...withEvent, status: 'in_progress' };

    case 'TurnStarted':
      return {
        ...withEvent,
        currentTurn: event.payload.turnNumber,
        currentColor: event.payload.color,
        fen: event.payload.fen,
      };

    case 'MoveApplied':
      return {
        ...withEvent,
        fen: event.payload.fen,
        moveHistory: [
          ...state.moveHistory,
          {
            turnNumber: state.currentTurn,
            color: event.payload.color,
            move: event.payload.san,
            reasoning: event.payload.reasoning,
            thinkingTimeMs: event.payload.thinkingTimeMs,
            attempts: event.payload.attemptNumber,
            oracleAttempts: event.payload.oracleAttempts,
            outputFormat: event.payload.outputFormat,
            confidence: event.payload.confidence,
            plan: event.payload.plan,
            threats: event.payload.threats,
            phase: event.payload.phase,
            assessment: event.payload.assessment,
            initialMove: event.payload.initialMove,
            revisedMove: event.payload.revisedMove,
            revisionReason: event.payload.revisionReason,
            didRevise: event.payload.didRevise,
            advisorMove: event.payload.advisorMove,
            advisorInfo: event.payload.advisorInfo,
            predictedLines: event.payload.predictedLines,
            promptTokens: event.payload.promptTokens,
            completionTokens: event.payload.completionTokens,
            ttftMs: event.payload.ttftMs,
            wallClockMs: event.payload.wallClockMs,
            networkLatencyMs: event.payload.networkLatencyMs,
            streamDurationMs: event.payload.streamDurationMs,
            tokensPerSecond: event.payload.tokensPerSecond,
            reasoningTokens: event.payload.reasoningTokens,
            totalTokens: event.payload.totalTokens,
            moveSource: event.payload.moveSource,
            constraintViolation: event.payload.constraintViolation,
            advisorElo: event.payload.advisorElo,
            advisorVisibility: event.payload.advisorVisibility,
            advisorProvenanceFrame: event.payload.advisorProvenanceFrame,
            correctionLoopMode: event.payload.correctionLoopMode,
            correctionRounds: event.payload.correctionRounds,
            fogVisibilityMode: event.payload.fogVisibilityMode,
            boardReconstructionAccuracy: event.payload.boardReconstructionAccuracy,
            phantomMove: event.payload.phantomMove,
            toolInvocations: event.payload.toolInvocations,
            scratchpadState: event.payload.scratchpadState,
            benchmarkFraming: event.payload.benchmarkFraming,
            attackActive: event.payload.attackActive,
            activeAttackVectors: event.payload.activeAttackVectors,
            attackPattern: event.payload.attackPattern,
            attackTiming: event.payload.attackTiming,
            attackIntensity: event.payload.attackIntensity,
          },
        ],
      };

    case 'GameEnded':
      return {
        ...withEvent,
        status: mapResultToStatus(event.payload.result),
        result: event.payload.result,
        endedAt: event.timestamp,
      };

    case 'GameAborted':
      return {
        ...withEvent,
        status: 'aborted',
        result: { outcome: 'aborted', reason: event.payload.reason },
        endedAt: event.timestamp,
      };

    case 'ErrorOccurred':
      if (event.payload.fatal) {
        return { ...withEvent, status: 'error' };
      }
      return withEvent;

    default:
      return withEvent;
  }
}
