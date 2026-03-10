import type {
  BenchmarkBatch,
  BenchmarkDatabaseState,
  BenchmarkGameRecord,
  BenchmarkMoveRecord,
  ConditionAggregate,
  ExperimentProfile,
  Finding,
  GeneratedReport,
} from './types';
import { benchmarkDb } from './db';
import { cloneProfile, diffProfiles, expandFactorialProfile, hotSwapProfile } from './profile';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function loadBenchmarkState(): Promise<BenchmarkDatabaseState> {
  const [profiles, batches, games, moves, aggregates, reports, findings, aggregateHistory] = await Promise.all([
    benchmarkDb.getAll('profiles'),
    benchmarkDb.getAll('batches'),
    benchmarkDb.getAll('games'),
    benchmarkDb.getAll('moves'),
    benchmarkDb.getAll('aggregates'),
    benchmarkDb.getAll('reports'),
    benchmarkDb.getAll('findings'),
    benchmarkDb.getAll('aggregate_history'),
  ]);

  return {
    profiles,
    batches,
    games,
    moves,
    aggregates,
    reports,
    findings,
    aggregateHistory,
  };
}

export async function saveProfiles(profiles: ExperimentProfile[]): Promise<void> {
  await benchmarkDb.bulkPut('profiles', profiles);
}

export async function saveBenchmarkGames(games: BenchmarkGameRecord[], moves: BenchmarkMoveRecord[]): Promise<void> {
  await Promise.all([
    benchmarkDb.bulkPut('games', games),
    benchmarkDb.bulkPut('moves', moves),
  ]);
}

export async function saveAggregates(aggregates: ConditionAggregate[]): Promise<void> {
  await benchmarkDb.bulkPut('aggregates', aggregates);
}

export async function saveFindings(findings: Finding[]): Promise<void> {
  await benchmarkDb.clearStore('findings');
  await benchmarkDb.bulkPut('findings', findings);
}

export async function saveReports(reports: GeneratedReport[]): Promise<void> {
  await benchmarkDb.clearStore('reports');
  await benchmarkDb.bulkPut('reports', reports);
}

export async function saveAggregateHistory(snapshots: BenchmarkDatabaseState['aggregateHistory']): Promise<void> {
  await benchmarkDb.bulkPut('aggregate_history', snapshots);
}

export async function clearBenchmarkDatabase(): Promise<void> {
  await benchmarkDb.clearAll();
}

export async function saveProfile(profile: ExperimentProfile): Promise<ExperimentProfile> {
  await benchmarkDb.put('profiles', profile);
  return profile;
}

export async function loadProfile(profileId: string): Promise<ExperimentProfile | null> {
  const profiles = await benchmarkDb.getAll('profiles');
  return profiles.find((profile) => profile.profileId === profileId) ?? null;
}

export async function listProfiles(): Promise<ExperimentProfile[]> {
  return benchmarkDb.getAll('profiles');
}

export async function cloneSavedProfile(profileId: string): Promise<ExperimentProfile | null> {
  const profile = await loadProfile(profileId);
  if (!profile) return null;
  const cloned = cloneProfile(profile);
  await saveProfile(cloned);
  return cloned;
}

export async function hotSwapSavedProfile(
  profileId: string,
  updates: Partial<ExperimentProfile>,
): Promise<ExperimentProfile | null> {
  const profile = await loadProfile(profileId);
  if (!profile) return null;
  const swapped = hotSwapProfile(profile, updates);
  await saveProfile(swapped);
  return swapped;
}

export async function deleteProfile(profileId: string): Promise<void> {
  const profiles = await benchmarkDb.getAll('profiles');
  const keep = profiles.filter((profile) => profile.profileId !== profileId);
  await benchmarkDb.clearStore('profiles');
  await benchmarkDb.bulkPut('profiles', keep);
}

export async function diffSavedProfiles(leftId: string, rightId: string): Promise<string[]> {
  const [left, right] = await Promise.all([loadProfile(leftId), loadProfile(rightId)]);
  if (!left || !right) return [];
  return diffProfiles(left, right);
}

export async function expandFactorialAndSave(
  baseProfileId: string,
  expansion: Partial<Record<'model' | 'prompt' | 'format', string[]>>,
): Promise<ExperimentProfile[]> {
  const base = await loadProfile(baseProfileId);
  if (!base) return [];
  const profiles = expandFactorialProfile(base, expansion);
  await saveProfiles(profiles);
  return profiles;
}

export async function queueProfiles(profileIds: string[], name?: string): Promise<BenchmarkBatch> {
  const batch: BenchmarkBatch = {
    batchId: hashString(`${profileIds.join(':')}:${Date.now()}`),
    createdAt: new Date().toISOString(),
    name: name ?? `batch_${profileIds.length}_${new Date().toISOString()}`,
    profileIds,
    source: profileIds.length > 1 ? 'factorial' : 'manual',
  };
  await benchmarkDb.put('batches', batch);
  return batch;
}
