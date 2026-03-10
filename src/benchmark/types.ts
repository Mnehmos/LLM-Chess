import type {
  AdvisorVisibility,
  BenchmarkFraming,
  ConstraintConfig,
  ContextMode,
  FogVisibilityMode,
  GameResult,
  GameState,
  OutputFormat,
  PlayerConfig,
  PromptLevel,
  ProvenanceFrame,
  ReasoningEffort,
  ResponseToolInvocation,
} from '../engine/types';

export type BenchmarkTier = 'standard' | 'assisted' | 'adversarial';

export interface BenchmarkIngestContext {
  source: 'single_game' | 'tournament' | 'legacy_import';
  matchStructure?: 'single' | 'pair' | 'gauntlet' | 'round_robin';
  batchId?: string | null;
  openingId?: string | null;
  openingName?: string | null;
  openingEco?: string | null;
  startingFen?: string | null;
}

export interface BenchmarkModelConfig {
  id: string;
  provider: string;
  variant: string;
  temperature: number;
  topP: number | null;
}

export interface BenchmarkPromptConfig {
  level: Uppercase<Exclude<PromptLevel, 'assisted' | 'standard' | 'blind'>>;
  format: OutputFormat;
  indecisivenessTools: boolean;
  persona: string | null;
}

export interface BenchmarkConstraintConfig {
  mode: 'unlimited' | 'wall_clock' | 'token_budget' | 'reasoning_budget' | 'combined';
  wallClockMs: number | null;
  gameClockMs: number | null;
  incrementMs: number | null;
  outputTokenLimit: number | null;
  reasoningTokenLimit: number | null;
  timeoutBehavior: 'forfeit' | 'truncate' | 'best_effort' | 'random_legal';
}

export interface BenchmarkOpponentConfig {
  type: 'stockfish' | 'llm' | 'human';
  elo: number | null;
  depth: number | null;
  skill: number | null;
  modelId: string | null;
}

export interface ExperimentProfile {
  profileId: string;
  profileName: string;
  createdAt: string;
  tier: BenchmarkTier;
  model: BenchmarkModelConfig;
  prompt: BenchmarkPromptConfig;
  constraints: BenchmarkConstraintConfig;
  opponent: BenchmarkOpponentConfig;
  game: {
    opening: string | null;
    startingFen: string | null;
    color: 'white' | 'black' | 'paired' | 'random';
    matchStructure: 'single' | 'pair' | 'gauntlet' | 'round_robin';
    adjudication: {
      maxMoves: number | null;
      resignThresholdCp: number | null;
      drawRules: boolean;
    };
  };
  oracle: {
    engine: 'stockfish';
    depth: number;
    realtime: boolean;
  };
  commentator: {
    enabled: boolean;
    modelId: string | null;
    hasOracleAccess: boolean;
    realtime: boolean;
  };
  advisor: null | {
    enabled: boolean;
    qualityElo: number | null;
    visibility: AdvisorVisibility | null;
    framing: ProvenanceFrame | null;
    correctionLoop: boolean;
  };
  attacks: null | {
    enabled: boolean;
    vectors: string[];
    pattern: string | null;
    injections: Array<{
      move: number;
      type: string;
      content: string;
    }>;
  };
  context: {
    mode: 'cumulative' | 'stateless' | 'scratchpad';
    scratchpadType: string | null;
  };
  fog: null | {
    enabled: boolean;
    visibility: FogVisibilityMode | null;
    radius: number | null;
    scouting: string | null;
    reporter: string | null;
  };
  simul: null | {
    enabled: boolean;
    boardCount: number;
    opponentComposition: string | null;
    sync: string | null;
  };
  orchestrator: null | {
    enabled: boolean;
    orchestratorModel: string | null;
    playerCount: number | null;
    communicationMode: string | null;
    chain: string | null;
  };
  toolkit: {
    enabled: boolean;
  };
  extensions: {
    reasoningEffort: ReasoningEffort;
    maxTokens: number | null;
    benchmarkFraming: BenchmarkFraming | null;
    linePrediction: {
      enabled: boolean;
      count: number | null;
      depth: number | null;
    };
  };
}

export interface ProfilePreset {
  presetId: string;
  name: string;
  description: string;
  profile: ExperimentProfile;
}

export interface BenchmarkBatch {
  batchId: string;
  createdAt: string;
  name: string;
  profileIds: string[];
  source: 'manual' | 'factorial' | 'legacy_import';
}

export interface BenchmarkDecisionTraceItem {
  seq: number;
  move: string;
  reasoning: string;
  timestampMs: number;
  oracleCp: number | null;
}

export interface BenchmarkMoveRecord {
  benchmarkMoveId: string;
  benchmarkGameId: string;
  sourceGameId: string;
  profileId: string;
  batchId: string | null;
  actor: 'player' | 'opponent';
  turn: number;
  color: 'white' | 'black';
  moveNumber: number;
  fenBefore: string;
  fenAfter: string;
  modelId: string;
  promptLevel: string;
  formatVariant: string;
  indecisivenessTools: boolean;
  constraintMode: string;
  opponentType: string;
  opponentElo: number | null;
  advisorEnabled: boolean;
  advisorElo: number | null;
  advisorVisibility: string | null;
  advisorFraming: string | null;
  attackActive: boolean;
  attackVector: string | null;
  attackPattern: string | null;
  attackTiming: string | null;
  attackIntensity: number | null;
  fogMode: string | null;
  contextMode: string;
  simulBoardCount: number;
  simulBoardId: string | null;
  toolkitEnabled: boolean;
  modelMove: string;
  modelReasoning: string;
  confidence: string | null;
  plan: string | null;
  phase: string | null;
  assessment: string | null;
  threats: string | null;
  decisionTrace: BenchmarkDecisionTraceItem[] | null;
  candidateCount: number;
  uniqueCandidates: number;
  oscillationCount: number;
  advisorMove: string | null;
  advisorEvalCp: number | null;
  advisorLabelShown: string | null;
  advisorActualElo: number | null;
  initialMove: string | null;
  revisedMove: string | null;
  adoptedAdvisor: boolean | null;
  revisionReason: string | null;
  oracleEvalCp: number | null;
  oracleBestMove: string | null;
  oracleDepth: number | null;
  centipawnLoss: number | null;
  wallClockMs: number | null;
  networkLatencyMs: number | null;
  ttftMs: number | null;
  streamDurationMs: number | null;
  tokensPerSecond: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  legalFirstAttempt: boolean;
  attempts: number;
  illegalMovesAttempted: string[];
  systemPromptVersion: string | null;
  injectionActive: boolean;
  injectionType: string | null;
  injectionContent: string | null;
  scratchpadState: string | null;
  fogVisibilityState: string | null;
  toolInvocations: ResponseToolInvocation[] | null;
  benchmarkFraming: BenchmarkFraming | null;
}

export interface BenchmarkGameRecord {
  benchmarkGameId: string;
  sourceGameId: string;
  profileId: string;
  profileName: string;
  batchId: string | null;
  source: BenchmarkIngestContext['source'];
  playerColor: 'white' | 'black';
  playerModelId: string;
  playerDisplayName: string;
  opponentDisplayName: string;
  tier: BenchmarkTier;
  openingName: string | null;
  openingEco: string | null;
  openingId: string | null;
  startingFen: string;
  result: 'white_wins' | 'black_wins' | 'draw' | 'aborted';
  resultReason: string;
  totalMoves: number;
  gameDurationMs: number;
  moves: BenchmarkMoveRecord[];
  avgCentipawnLoss: number | null;
  medianCentipawnLoss: number | null;
  legalRate: number;
  avgResponseTimeMs: number;
  avgCandidateCount: number | null;
  advisorDeferenceRate: number | null;
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

export interface ConditionAggregateMetrics {
  eloEstimate: number;
  eloCiLow: number;
  eloCiHigh: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  legalRate: number;
  avgCentipawnLoss: number | null;
  medianCentipawnLoss: number | null;
  avgWallClockMs: number | null;
  avgTtftMs: number | null;
  avgTokensPerSecond: number | null;
  avgOutputTokens: number | null;
  avgReasoningTokens: number | null;
  avgGameLength: number | null;
  avgCandidateCount: number | null;
  indecisivenessIndex: number | null;
  oscillationRate: number | null;
  improvementRate: number | null;
  degradationRate: number | null;
  adr: number | null;
  deferencePrecision: number | null;
  deferenceRecall: number | null;
  abi: number | null;
  psi: number | null;
  sycophancyIndex: number | null;
  recalibrationSpeed: number | null;
  commitmentAnchoring: number | null;
  deliberationAnchoring: number | null;
  adviceTimingValue: number | null;
  thirdOptionRate: number | null;
  postCommitDeference: number | null;
  resilienceScore: number | null;
  detectionLatency: number | null;
  recalibrationGap: number | null;
  escalationAccuracy: number | null;
  falseEscalation: number | null;
  underEscalation: number | null;
  confidenceAccuracy: number | null;
  overconfidenceRate: number | null;
  underconfidenceRate: number | null;
  assessmentAccuracy: number | null;
  planConsistency: number | null;
  cotValue: number | null;
}

export interface ConditionAggregate {
  conditionId: string;
  profileIds: string[];
  displayName: string;
  tier: BenchmarkTier;
  modelId: string;
  promptLevel: string;
  formatVariant: string;
  constraintMode: string;
  advisorQuality: number | null;
  advisorVisibility: string | null;
  advisorFraming: string | null;
  attackCategory: string | null;
  attackPattern: string | null;
  attackTiming: string | null;
  toolkitEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  metrics: ConditionAggregateMetrics;
}

export interface AggregateHistorySnapshot {
  snapshotId: string;
  conditionId: string;
  batchFamilyId: string;
  capturedAt: string;
  metrics: Pick<ConditionAggregateMetrics, 'eloEstimate' | 'legalRate' | 'avgCentipawnLoss'>;
}

export interface Finding {
  findingId: string;
  type: 'anomaly' | 'threshold' | 'crossover' | 'interaction' | 'regression';
  severity: 'info' | 'notable' | 'significant' | 'critical';
  title: string;
  description: string;
  evidence: {
    metric: string;
    value: number;
    comparison: number;
    pValue: number | null;
  };
  affectedModels: string[];
  affectedConditions: string[];
  createdAt: string;
}

export interface GeneratedReport {
  reportId: string;
  type:
    | 'model_scorecard'
    | 'prompt_sensitivity'
    | 'cot_analysis'
    | 'indecisiveness_profile'
    | 'trust_calibration'
    | 'adversarial_resilience'
    | 'comparative'
    | 'full_diagnostic';
  title: string;
  subjectIds: string[];
  createdAt: string;
  summary: string;
  html: string;
  data: Record<string, unknown>;
}

export interface BenchmarkQuery {
  tier?: BenchmarkTier | 'all';
  modelIds?: string[];
  promptLevels?: string[];
  formats?: string[];
  constraintModes?: string[];
  advisorQualities?: number[];
  advisorVisibilities?: string[];
  advisorFramings?: string[];
  attackCategories?: string[];
  attackPatterns?: string[];
  attackTimings?: string[];
  toolkitEnabled?: boolean | null;
}

export interface BenchmarkDatabaseState {
  profiles: ExperimentProfile[];
  batches: BenchmarkBatch[];
  games: BenchmarkGameRecord[];
  moves: BenchmarkMoveRecord[];
  aggregates: ConditionAggregate[];
  reports: GeneratedReport[];
  findings: Finding[];
  aggregateHistory: AggregateHistorySnapshot[];
}

export interface BenchmarkLegacyImportPayload {
  sourceGames: GameState[];
  importedAt: string;
}

export interface BenchmarkGameSide {
  player: PlayerConfig;
  opponent: PlayerConfig;
  perspectiveColor: 'white' | 'black';
}

export function normalizeBenchmarkResult(result: GameResult | undefined): BenchmarkGameRecord['result'] {
  if (!result) return 'aborted';
  if (result.outcome === 'draw') return 'draw';
  if (result.outcome === 'aborted') return 'aborted';
  return result.winner === 'w' ? 'white_wins' : 'black_wins';
}

export function getPerspectiveResult(
  perspectiveColor: 'white' | 'black',
  result: GameResult | undefined,
): 'win' | 'loss' | 'draw' | 'aborted' {
  if (!result) return 'aborted';
  if (result.outcome === 'draw') return 'draw';
  if (result.outcome === 'aborted') return 'aborted';
  const winner = result.winner === 'w' ? 'white' : 'black';
  return winner === perspectiveColor ? 'win' : 'loss';
}

export function isBenchmarkablePlayer(player: PlayerConfig): boolean {
  if (player.type === 'human') return true;
  if (player.type === 'stockfish') return false;
  return true;
}

export function getConstraintMode(config?: ConstraintConfig): BenchmarkConstraintConfig['mode'] {
  if (!config) return 'unlimited';
  const hasWall = !!config.wallClockPerMoveMs || !!config.gameClockMs || !!config.fischerIncrementMs;
  const hasOut = !!config.outputTokenBudget;
  const hasThink = !!config.reasoningTokenBudget;
  const active = [hasWall, hasOut, hasThink].filter(Boolean).length;
  if (active > 1) return 'combined';
  if (hasWall) return 'wall_clock';
  if (hasOut) return 'token_budget';
  if (hasThink) return 'reasoning_budget';
  return 'unlimited';
}

export function getBenchmarkTier(player: PlayerConfig): BenchmarkTier {
  if (player.attacks?.length || player.transition?.injectionTimeline?.length) return 'adversarial';
  if (player.advisor?.enabled || player.type === 'stockfish_oracle') return 'assisted';
  return 'standard';
}

export function getContextModeLabel(contextMode?: ContextMode): ExperimentProfile['context']['mode'] {
  if (contextMode === 'stateless') return 'stateless';
  if (contextMode === 'stateless_scratchpad') return 'scratchpad';
  return 'cumulative';
}
