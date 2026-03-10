import type { ModelStats } from '../engine/types';
import type { BenchmarkTier, ConditionAggregate, ExperimentProfile } from './types';
import { DEFAULT_ELO } from '../utils/elo';

function parseLegacyModelId(modelId: string): {
  model: string;
  prompt: string;
  format: string;
  effort: string;
  maxTokens: number | null;
} {
  const parts = modelId.split(':');
  if (parts.length >= 7) {
    return {
      model: parts[1],
      prompt: parts[3].toUpperCase(),
      format: parts[4],
      effort: parts[5],
      maxTokens: Number(parts[6]) || null,
    };
  }
  return {
    model: modelId,
    prompt: 'P2',
    format: 'A',
    effort: 'high',
    maxTokens: 6000,
  };
}

function toProfile(stats: ModelStats): ExperimentProfile {
  const parsed = parseLegacyModelId(stats.modelId);
  return {
    profileId: `legacy:${stats.modelId}`,
    profileName: stats.displayName,
    createdAt: new Date().toISOString(),
    tier: (stats.tier ?? 'standard') as BenchmarkTier,
    model: {
      id: parsed.model,
      provider: parsed.model.includes('/') ? parsed.model.split('/')[0] : 'legacy',
      variant: 'legacy_import',
      temperature: 0.3,
      topP: null,
    },
    prompt: {
      level: parsed.prompt as ExperimentProfile['prompt']['level'],
      format: parsed.format as ExperimentProfile['prompt']['format'],
      indecisivenessTools: parsed.format === 'C',
      persona: null,
    },
    constraints: {
      mode: 'unlimited',
      wallClockMs: null,
      gameClockMs: null,
      incrementMs: null,
      outputTokenLimit: parsed.maxTokens,
      reasoningTokenLimit: null,
      timeoutBehavior: 'best_effort',
    },
    opponent: {
      type: 'stockfish',
      elo: null,
      depth: null,
      skill: null,
      modelId: null,
    },
    game: {
      opening: null,
      startingFen: null,
      color: 'random',
      matchStructure: 'single',
      adjudication: {
        maxMoves: null,
        resignThresholdCp: null,
        drawRules: true,
      },
    },
    oracle: {
      engine: 'stockfish',
      depth: 18,
      realtime: true,
    },
    commentator: {
      enabled: false,
      modelId: null,
      hasOracleAccess: true,
      realtime: true,
    },
    advisor: null,
    attacks: null,
    context: {
      mode: 'cumulative',
      scratchpadType: null,
    },
    fog: null,
    simul: null,
    orchestrator: null,
    toolkit: {
      enabled: false,
    },
    extensions: {
      reasoningEffort: parsed.effort as ExperimentProfile['extensions']['reasoningEffort'],
      maxTokens: parsed.maxTokens,
      benchmarkFraming: null,
      linePrediction: {
        enabled: false,
        count: null,
        depth: null,
      },
    },
  };
}

function toAggregate(stats: ModelStats, profile: ExperimentProfile): ConditionAggregate {
  return {
    conditionId: profile.profileId,
    profileIds: [profile.profileId],
    displayName: profile.profileName,
    tier: profile.tier,
    modelId: profile.model.id,
    promptLevel: profile.prompt.level,
    formatVariant: profile.prompt.format,
    constraintMode: profile.constraints.mode,
    advisorQuality: null,
    advisorVisibility: null,
    advisorFraming: null,
    attackCategory: null,
    attackPattern: null,
    attackTiming: null,
    toolkitEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metrics: {
      eloEstimate: stats.eloRating || DEFAULT_ELO,
      eloCiLow: (stats.eloRating || DEFAULT_ELO) - 32,
      eloCiHigh: (stats.eloRating || DEFAULT_ELO) + 32,
      games: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      winRate: stats.gamesPlayed > 0 ? stats.wins / stats.gamesPlayed : 0,
      legalRate: stats.legalMoveRate,
      avgCentipawnLoss: stats.avgCentipawnLoss ?? null,
      medianCentipawnLoss: stats.avgCentipawnLoss ?? null,
      avgWallClockMs: stats.avgResponseTimeMs,
      avgTtftMs: stats.avgTtftMs,
      avgTokensPerSecond: stats.avgTokensPerSecond,
      avgOutputTokens: stats.avgOutputTokens ?? null,
      avgReasoningTokens: stats.avgReasoningTokens ?? null,
      avgGameLength: stats.avgMovesPerGame,
      avgCandidateCount: null,
      indecisivenessIndex: null,
      oscillationRate: null,
      improvementRate: null,
      degradationRate: null,
      adr: stats.advisorFollowRate ?? null,
      deferencePrecision: null,
      deferenceRecall: null,
      abi: null,
      psi: null,
      sycophancyIndex: null,
      recalibrationSpeed: null,
      commitmentAnchoring: null,
      deliberationAnchoring: null,
      adviceTimingValue: null,
      thirdOptionRate: null,
      postCommitDeference: stats.advisorFollowRate ?? null,
      resilienceScore: null,
      detectionLatency: null,
      recalibrationGap: null,
      escalationAccuracy: null,
      falseEscalation: null,
      underEscalation: null,
      confidenceAccuracy: null,
      overconfidenceRate: null,
      underconfidenceRate: null,
      assessmentAccuracy: null,
      planConsistency: null,
      cotValue: null,
    },
  };
}

export function importLegacyBenchmarkState(): {
  profiles: ExperimentProfile[];
  aggregates: ConditionAggregate[];
} | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('llm-chess-benchmark');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { modelStats?: Record<string, ModelStats> };
      modelStats?: Record<string, ModelStats>;
    };
    const modelStats = parsed.state?.modelStats ?? parsed.modelStats ?? {};
    const stats = Object.values(modelStats);
    if (stats.length === 0) return null;
    const profiles = stats.map(toProfile);
    const profileMap = new Map(profiles.map((profile) => [profile.profileName, profile]));
    const aggregates = stats.map((entry) => toAggregate(entry, profileMap.get(entry.displayName) ?? toProfile(entry)));
    return { profiles, aggregates };
  } catch {
    return null;
  }
}
