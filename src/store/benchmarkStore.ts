import { create } from 'zustand';
import type { CommentatorConfig, GameState } from '../engine/types';
import type {
  BenchmarkBatch,
  BenchmarkGameRecord,
  BenchmarkIngestContext,
  BenchmarkTier,
  ConditionAggregate,
  ExperimentProfile,
  Finding,
  GeneratedReport,
} from '../benchmark/types';
import { buildConditionAggregates } from '../benchmark/aggregates';
import { importLegacyBenchmarkState } from '../benchmark/legacy';
import { mapGameToBenchmarkRecords } from '../benchmark/mapper';
import { generateFindings, generateReports } from '../benchmark/reports';
import {
  clearBenchmarkDatabase,
  cloneSavedProfile,
  diffSavedProfiles,
  expandFactorialAndSave,
  hotSwapSavedProfile,
  listProfiles as listSavedProfiles,
  loadBenchmarkState,
  queueProfiles as queueSavedProfiles,
  saveAggregateHistory,
  saveAggregates,
  saveBenchmarkGames,
  saveFindings,
  saveProfile as persistProfile,
  saveProfiles,
  saveReports,
} from '../benchmark/repository';

interface RecordGameOptions extends BenchmarkIngestContext {
  commentatorModel?: CommentatorConfig | null;
}

interface BenchmarkState {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  profiles: ExperimentProfile[];
  batches: BenchmarkBatch[];
  benchmarkGames: BenchmarkGameRecord[];
  aggregates: ConditionAggregate[];
  reports: GeneratedReport[];
  findings: Finding[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  recordGame: (game: GameState, options?: Partial<RecordGameOptions>) => void;
  clearStats: () => Promise<void>;
  getLeaderboard: (tier?: BenchmarkTier) => ConditionAggregate[];
  getReportsForCondition: (conditionId: string) => GeneratedReport[];
  getFindingsForCondition: (conditionId: string) => Finding[];
  getGamesForCondition: (conditionId: string) => BenchmarkGameRecord[];
  saveProfile: (profile: ExperimentProfile) => Promise<ExperimentProfile>;
  listProfiles: () => Promise<ExperimentProfile[]>;
  cloneProfile: (profileId: string) => Promise<ExperimentProfile | null>;
  hotSwapProfile: (profileId: string, updates: Partial<ExperimentProfile>) => Promise<ExperimentProfile | null>;
  diffProfiles: (leftId: string, rightId: string) => Promise<string[]>;
  expandFactorial: (baseProfileId: string, expansion: Partial<Record<'model' | 'prompt' | 'format', string[]>>) => Promise<ExperimentProfile[]>;
  queueProfiles: (profileIds: string[], name?: string) => Promise<BenchmarkBatch>;
}

function sortLeaderboard(items: ConditionAggregate[]): ConditionAggregate[] {
  return [...items].sort((left, right) => {
    if (right.metrics.eloEstimate !== left.metrics.eloEstimate) {
      return right.metrics.eloEstimate - left.metrics.eloEstimate;
    }
    return right.metrics.games - left.metrics.games;
  });
}

async function ingestAndRebuild(
  currentGames: BenchmarkGameRecord[],
  currentProfiles: ExperimentProfile[],
  game: GameState,
  options: RecordGameOptions,
): Promise<{
  profiles: ExperimentProfile[];
  games: BenchmarkGameRecord[];
  aggregates: ConditionAggregate[];
  reports: GeneratedReport[];
  findings: Finding[];
}> {
  const mapped = mapGameToBenchmarkRecords(game, options, options.commentatorModel ?? null);
  const profileMap = new Map<string, ExperimentProfile>();
  for (const profile of [...currentProfiles, ...mapped.profiles]) {
    profileMap.set(profile.profileId, profile);
  }
  const profiles = [...profileMap.values()];
  const games = [...currentGames, ...mapped.games];
  const { aggregates, history } = buildConditionAggregates(profiles, games);
  const findings = generateFindings(aggregates, history);
  const reports = generateReports(aggregates, findings);

  await saveProfiles(mapped.profiles);
  await saveBenchmarkGames(mapped.games, mapped.moves);
  await saveAggregates(aggregates);
  await saveAggregateHistory(history);
  await saveFindings(findings);
  await saveReports(reports);

  return { profiles, games, aggregates, reports, findings };
}

export const useBenchmarkStore = create<BenchmarkState>()((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  profiles: [],
  batches: [],
  benchmarkGames: [],
  aggregates: [],
  reports: [],
  findings: [],

  initialize: async () => {
    if (get().initialized || get().loading) return;
    set({ loading: true, error: null });
    try {
      let state = await loadBenchmarkState();
      if (state.aggregates.length === 0 && state.games.length === 0) {
        const legacy = importLegacyBenchmarkState();
        if (legacy) {
          await saveProfiles(legacy.profiles);
          await saveAggregates(legacy.aggregates);
          state = await loadBenchmarkState();
        }
      }
      set({
        initialized: true,
        loading: false,
        profiles: state.profiles,
        batches: state.batches,
        benchmarkGames: state.games,
        aggregates: sortLeaderboard(state.aggregates),
        reports: state.reports,
        findings: state.findings,
      });
    } catch (error) {
      set({
        initialized: true,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const state = await loadBenchmarkState();
      set({
        initialized: true,
        loading: false,
        profiles: state.profiles,
        batches: state.batches,
        benchmarkGames: state.games,
        aggregates: sortLeaderboard(state.aggregates),
        reports: state.reports,
        findings: state.findings,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  recordGame: (game, options) => {
    if (!game.result || game.result.outcome === 'aborted') return;
    const state = get();
    const ingestOptions: RecordGameOptions = {
      source: options?.source ?? 'single_game',
      matchStructure: options?.matchStructure ?? 'single',
      batchId: options?.batchId ?? null,
      openingId: options?.openingId ?? null,
      openingName: options?.openingName ?? null,
      openingEco: options?.openingEco ?? null,
      startingFen: options?.startingFen ?? null,
      commentatorModel: options?.commentatorModel ?? null,
    };

    set({
      loading: true,
      error: null,
    });

    void ingestAndRebuild(state.benchmarkGames, state.profiles, game, ingestOptions)
      .then(({ profiles, games, aggregates, reports, findings }) => {
        set({
          initialized: true,
          loading: false,
          profiles,
          benchmarkGames: games,
          aggregates: sortLeaderboard(aggregates),
          reports,
          findings,
        });
      })
      .catch((error) => {
        set({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  },

  clearStats: async () => {
    set({ loading: true, error: null });
    try {
      await clearBenchmarkDatabase();
      set({
        initialized: true,
        loading: false,
        profiles: [],
        batches: [],
        benchmarkGames: [],
        aggregates: [],
        reports: [],
        findings: [],
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  getLeaderboard: (tier) => {
    const aggregates = get().aggregates;
    return tier ? sortLeaderboard(aggregates.filter((aggregate) => aggregate.tier === tier)) : aggregates;
  },

  getReportsForCondition: (conditionId) => get().reports.filter((report) => report.subjectIds.includes(conditionId)),
  getFindingsForCondition: (conditionId) => get().findings.filter((finding) => finding.affectedConditions.includes(conditionId)),
  getGamesForCondition: (conditionId) => get().benchmarkGames.filter((game) => game.profileId === conditionId),

  saveProfile: async (profile) => {
    await persistProfile(profile);
    const profiles = await listSavedProfiles();
    set({ profiles });
    return profile;
  },

  listProfiles: async () => {
    const profiles = await listSavedProfiles();
    set({ profiles });
    return profiles;
  },

  cloneProfile: async (profileId) => {
    const profile = await cloneSavedProfile(profileId);
    const profiles = await listSavedProfiles();
    set({ profiles });
    return profile;
  },

  hotSwapProfile: async (profileId, updates) => {
    const profile = await hotSwapSavedProfile(profileId, updates);
    const profiles = await listSavedProfiles();
    set({ profiles });
    return profile;
  },

  diffProfiles: (leftId, rightId) => diffSavedProfiles(leftId, rightId),

  expandFactorial: async (baseProfileId, expansion) => {
    const profiles = await expandFactorialAndSave(baseProfileId, expansion);
    const allProfiles = await listSavedProfiles();
    set({ profiles: allProfiles });
    return profiles;
  },

  queueProfiles: async (profileIds, name) => {
    const batch = await queueSavedProfiles(profileIds, name);
    const state = await loadBenchmarkState();
    set({ batches: state.batches });
    return batch;
  },
}));
