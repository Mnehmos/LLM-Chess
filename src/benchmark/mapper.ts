import type { CommentatorConfig, GameState, MoveRecord, PieceColor, PlayerConfig } from '../engine/types';
import type { GameEvent } from '../engine/events';
import { buildSystemPrompt } from '../llm/prompts';
import type {
  BenchmarkGameRecord,
  BenchmarkGameSide,
  BenchmarkIngestContext,
  BenchmarkMoveRecord,
  ExperimentProfile,
} from './types';
import { buildExperimentProfile } from './profile';
import { getPerspectiveResult, isBenchmarkablePlayer, normalizeBenchmarkResult } from './types';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toColor(color: PieceColor): 'white' | 'black' {
  return color === 'w' ? 'white' : 'black';
}

function getInitialFen(game: GameState, ingest: BenchmarkIngestContext): string {
  const created = game.eventLog.find((event) => event.type === 'GameCreated');
  if (created && created.type === 'GameCreated') return created.payload.initialFen;
  return ingest.startingFen ?? game.fen;
}

function getBenchmarkSides(game: GameState): BenchmarkGameSide[] {
  const sides: BenchmarkGameSide[] = [];
  if (isBenchmarkablePlayer(game.white)) {
    sides.push({
      player: game.white,
      opponent: game.black,
      perspectiveColor: 'white',
    });
  }
  if (isBenchmarkablePlayer(game.black)) {
    sides.push({
      player: game.black,
      opponent: game.white,
      perspectiveColor: 'black',
    });
  }
  return sides;
}

function getMoverForPerspective(side: BenchmarkGameSide, color: PieceColor): PlayerConfig {
  if (side.perspectiveColor === 'white') {
    return color === 'w' ? side.player : side.opponent;
  }
  return color === 'b' ? side.player : side.opponent;
}

function getIllegalAttemptMap(eventLog: GameEvent[]): Map<number, string[]> {
  const illegalByMoveIndex = new Map<number, string[]>();
  const pending: Record<PieceColor, string[]> = { w: [], b: [] };
  let moveIndex = 0;

  for (const event of eventLog) {
    if (event.type === 'IllegalMoveAttempted') {
      pending[event.payload.color].push(event.payload.attemptedMove);
      continue;
    }
    if (event.type === 'MoveApplied') {
      illegalByMoveIndex.set(moveIndex, [...pending[event.payload.color]]);
      pending[event.payload.color] = [];
      moveIndex += 1;
    }
  }

  return illegalByMoveIndex;
}

function detectAttackState(player: PlayerConfig, move: MoveRecord): {
  attackActive: boolean;
  attackVector: string | null;
  attackPattern: string | null;
  attackTiming: string | null;
  attackIntensity: number | null;
  injectionType: string | null;
  injectionContent: string | null;
} {
  // Prefer runtime-recorded attack data (new records carry these fields)
  if (move.attackActive !== undefined) {
    const vectors = move.activeAttackVectors ?? [];
    const injection = player.transition?.injectionTimeline?.find((event) => event.moveNumber === move.turnNumber) ?? null;
    return {
      attackActive: move.attackActive,
      attackVector: vectors.length > 0 ? `${vectors[0].channel}.${vectors[0].vectorId}` : null,
      attackPattern: move.attackPattern ?? null,
      attackTiming: move.attackTiming ?? null,
      attackIntensity: move.attackIntensity ?? null,
      injectionType: injection?.eventType ?? null,
      injectionContent: injection ? JSON.stringify(injection.payload) : null,
    };
  }

  // Fallback: config-based detection for old game records without runtime attack data
  const vectors = player.attacks ?? [];
  const timing = player.transition?.attackTiming ?? null;
  const trustMoves = player.transition?.trustBuildingMoves ?? 0;
  const turnNumber = move.turnNumber;
  const injection = player.transition?.injectionTimeline?.find((event) => event.moveNumber === turnNumber) ?? null;
  let active = vectors.length > 0;

  if (vectors.length > 0 && timing) {
    if (timing === 'mid_game') active = turnNumber > trustMoves;
    else if (timing === 'pre_game') active = true;
    else if (timing === 'phase_dependent') active = turnNumber > 10;
    else if (timing === 'random_trigger') active = turnNumber % 2 === 0;
    else active = turnNumber >= trustMoves;
  }

  return {
    attackActive: active,
    attackVector: active && vectors[0] ? `${vectors[0].channel}.${vectors[0].vectorId}` : null,
    attackPattern: player.transition?.attackPattern ?? null,
    attackTiming: timing,
    attackIntensity: null,
    injectionType: injection?.eventType ?? null,
    injectionContent: injection ? JSON.stringify(injection.payload) : null,
  };
}

function buildMoveRecord(
  move: MoveRecord,
  index: number,
  sourceGameId: string,
  benchmarkGameId: string,
  profile: ExperimentProfile,
  perspective: BenchmarkGameSide,
  illegalMovesAttempted: string[],
  fenBefore: string,
  fenAfter: string,
  batchId: string | null,
): BenchmarkMoveRecord {
  const playerTurn = move.color === (perspective.perspectiveColor === 'white' ? 'w' : 'b');
  const mover = getMoverForPerspective(perspective, move.color);
  const attackState = detectAttackState(perspective.player, move);
  const initialMove = move.initialMove ?? null;
  const revisedMove = move.revisedMove ?? null;
  const didRevise = !!move.didRevise && !!initialMove && !!revisedMove;
  const candidateCount = didRevise ? 2 : 1;
  const uniqueCandidates = new Set([initialMove, revisedMove, move.move].filter(Boolean)).size || 1;

  return {
    benchmarkMoveId: `${benchmarkGameId}:${index}`,
    benchmarkGameId,
    sourceGameId,
    profileId: profile.profileId,
    batchId,
    actor: playerTurn ? 'player' : 'opponent',
    turn: move.turnNumber,
    color: toColor(move.color),
    moveNumber: Math.ceil(move.turnNumber / 2),
    fenBefore,
    fenAfter,
    modelId: playerTurn ? profile.model.id : mover.model,
    promptLevel: profile.prompt.level,
    formatVariant: profile.prompt.format,
    indecisivenessTools: profile.prompt.indecisivenessTools,
    constraintMode: profile.constraints.mode,
    opponentType: profile.opponent.type,
    opponentElo: profile.opponent.elo,
    advisorEnabled: !!profile.advisor?.enabled,
    advisorElo: profile.advisor?.qualityElo ?? null,
    advisorVisibility: profile.advisor?.visibility ?? null,
    advisorFraming: profile.advisor?.framing ?? null,
    attackActive: attackState.attackActive,
    attackVector: attackState.attackVector,
    attackPattern: attackState.attackPattern,
    attackTiming: attackState.attackTiming,
    attackIntensity: attackState.attackIntensity,
    fogMode: profile.fog?.visibility ?? null,
    contextMode: profile.context.mode,
    simulBoardCount: profile.simul?.boardCount ?? 1,
    simulBoardId: move.boardId ?? null,
    toolkitEnabled: profile.toolkit.enabled,
    modelMove: move.move,
    modelReasoning: move.reasoning ?? '',
    confidence: move.confidence ?? null,
    plan: move.plan ?? null,
    phase: move.phase ?? null,
    assessment: move.assessment ?? null,
    threats: move.threats ?? null,
    decisionTrace: null,
    candidateCount,
    uniqueCandidates,
    oscillationCount: 0,
    advisorMove: move.advisorMove ?? null,
    advisorEvalCp: null,
    advisorLabelShown: move.advisorInfo ?? null,
    advisorActualElo: move.advisorElo ?? null,
    initialMove,
    revisedMove,
    adoptedAdvisor: move.advisorMove ? move.move.trim() === move.advisorMove.trim() : null,
    revisionReason: move.revisionReason ?? null,
    oracleEvalCp: move.evalCp ?? null,
    oracleBestMove: move.bestMove ?? null,
    oracleDepth: null,
    centipawnLoss: move.evalCp != null ? Math.abs(move.evalCp) : null,
    wallClockMs: move.wallClockMs ?? move.thinkingTimeMs,
    networkLatencyMs: move.networkLatencyMs ?? null,
    ttftMs: move.ttftMs ?? null,
    streamDurationMs: move.streamDurationMs ?? null,
    tokensPerSecond: move.tokensPerSecond ?? null,
    outputTokens: move.completionTokens ?? null,
    reasoningTokens: move.reasoningTokens ?? null,
    totalTokens: move.totalTokens ?? null,
    legalFirstAttempt: move.attempts === 1,
    attempts: move.attempts,
    illegalMovesAttempted,
    systemPromptVersion: hashString(buildSystemPrompt(perspective.player)),
    injectionActive: !!attackState.injectionType,
    injectionType: attackState.injectionType,
    injectionContent: attackState.injectionContent,
    scratchpadState: move.scratchpadState ?? null,
    fogVisibilityState: move.fogVisibilityMode ?? null,
    toolInvocations: move.toolInvocations ?? null,
    benchmarkFraming: move.benchmarkFraming ?? perspective.player.evalAwareness?.framing ?? null,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function mapGameToBenchmarkRecords(
  game: GameState,
  ingest: BenchmarkIngestContext,
  commentator?: CommentatorConfig | null,
): {
  profiles: ExperimentProfile[];
  games: BenchmarkGameRecord[];
  moves: BenchmarkMoveRecord[];
} {
  const initialFen = getInitialFen(game, ingest);
  const illegalAttemptMap = getIllegalAttemptMap(game.eventLog as GameEvent[]);
  const sides = getBenchmarkSides(game);
  const profiles: ExperimentProfile[] = [];
  const games: BenchmarkGameRecord[] = [];
  const allMoves: BenchmarkMoveRecord[] = [];

  for (const side of sides) {
    const profile = buildExperimentProfile(side, { ...ingest, startingFen: initialFen }, commentator ?? undefined);
    profiles.push(profile);

    const benchmarkGameId = `${game.gameId}:${side.perspectiveColor}`;
    const mappedMoves: BenchmarkMoveRecord[] = [];
    let previousFen = initialFen;

    for (let index = 0; index < game.moveHistory.length; index++) {
      const move = game.moveHistory[index];
      const appliedEvent = game.eventLog.filter((event) => event.type === 'MoveApplied')[index];
      const fenAfter = appliedEvent && appliedEvent.type === 'MoveApplied' ? appliedEvent.payload.fen : previousFen;
      const benchmarkMove = buildMoveRecord(
        move,
        index,
        game.gameId,
        benchmarkGameId,
        profile,
        side,
        illegalAttemptMap.get(index) ?? [],
        previousFen,
        fenAfter,
        ingest.batchId ?? null,
      );
      mappedMoves.push(benchmarkMove);
      previousFen = fenAfter;
    }

    const playerMoves = mappedMoves.filter((move) => move.actor === 'player');
    const avgCentipawnLoss = average(playerMoves.map((move) => move.centipawnLoss).filter((value): value is number => value != null));
    const medianCentipawnLoss = median(playerMoves.map((move) => move.centipawnLoss).filter((value): value is number => value != null));
    const legalRate = playerMoves.length > 0
      ? playerMoves.filter((move) => move.legalFirstAttempt).length / playerMoves.length
      : 1;
    const avgResponseTime = average(playerMoves.map((move) => move.wallClockMs).filter((value): value is number => value != null)) ?? 0;
    const avgCandidateCount = average(playerMoves.map((move) => move.candidateCount));
    const advisorMoves = playerMoves.filter((move) => move.advisorMove);
    const advisorDeferenceRate = advisorMoves.length > 0
      ? advisorMoves.filter((move) => move.adoptedAdvisor).length / advisorMoves.length
      : null;

    const result = getPerspectiveResult(side.perspectiveColor, game.result);
    const perspectiveResultReason = game.result?.reason ?? 'unknown';
    const endedAt = game.endedAt ?? Date.now();

    const benchmarkGame: BenchmarkGameRecord = {
      benchmarkGameId,
      sourceGameId: game.gameId,
      profileId: profile.profileId,
      profileName: profile.profileName,
      batchId: ingest.batchId ?? null,
      source: ingest.source,
      playerColor: side.perspectiveColor,
      playerModelId: side.player.model,
      playerDisplayName: side.player.displayName,
      opponentDisplayName: side.opponent.displayName,
      tier: profile.tier,
      openingName: ingest.openingName ?? null,
      openingEco: ingest.openingEco ?? null,
      openingId: ingest.openingId ?? null,
      startingFen: initialFen,
      result: normalizeBenchmarkResult(game.result),
      resultReason: result === 'aborted' ? perspectiveResultReason : perspectiveResultReason,
      totalMoves: game.moveHistory.length,
      gameDurationMs: Math.max(0, endedAt - game.startedAt),
      moves: mappedMoves,
      avgCentipawnLoss,
      medianCentipawnLoss,
      legalRate,
      avgResponseTimeMs: avgResponseTime,
      avgCandidateCount,
      advisorDeferenceRate,
      startedAt: new Date(game.startedAt).toISOString(),
      completedAt: new Date(endedAt).toISOString(),
      createdAt: new Date().toISOString(),
    };

    games.push(benchmarkGame);
    allMoves.push(...mappedMoves);
  }

  return { profiles, games, moves: allMoves };
}
