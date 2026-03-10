import type {
  BenchmarkDatabaseState,
  BenchmarkGameRecord,
  BenchmarkMoveRecord,
  BenchmarkQuery,
  ConditionAggregate,
  ExperimentProfile,
  GeneratedReport,
} from './types';

const encoder = new TextEncoder();

function buildQueryPredicate(query: BenchmarkQuery): (aggregate: ConditionAggregate) => boolean {
  return (aggregate) => {
    if (query.tier && query.tier !== 'all' && aggregate.tier !== query.tier) return false;
    if (query.modelIds?.length && !query.modelIds.includes(aggregate.modelId)) return false;
    if (query.promptLevels?.length && !query.promptLevels.includes(aggregate.promptLevel)) return false;
    if (query.formats?.length && !query.formats.includes(aggregate.formatVariant)) return false;
    if (query.constraintModes?.length && !query.constraintModes.includes(aggregate.constraintMode)) return false;
    if (query.advisorQualities?.length && !query.advisorQualities.includes(aggregate.advisorQuality ?? -1)) return false;
    if (query.advisorVisibilities?.length && !query.advisorVisibilities.includes(aggregate.advisorVisibility ?? '')) return false;
    if (query.advisorFramings?.length && !query.advisorFramings.includes(aggregate.advisorFraming ?? '')) return false;
    if (query.attackCategories?.length && !query.attackCategories.includes(aggregate.attackCategory ?? '')) return false;
    if (query.attackPatterns?.length && !query.attackPatterns.includes(aggregate.attackPattern ?? '')) return false;
    if (query.attackTimings?.length && !query.attackTimings.includes(aggregate.attackTiming ?? '')) return false;
    if (query.toolkitEnabled != null && aggregate.toolkitEnabled !== query.toolkitEnabled) return false;
    return true;
  };
}

export function queryAggregates(aggregates: ConditionAggregate[], query: BenchmarkQuery): ConditionAggregate[] {
  return aggregates.filter(buildQueryPredicate(query));
}

export function queryGames(games: BenchmarkGameRecord[], aggregates: ConditionAggregate[], query: BenchmarkQuery): BenchmarkGameRecord[] {
  const selected = new Set(queryAggregates(aggregates, query).map((aggregate) => aggregate.conditionId));
  return games.filter((game) => selected.has(game.profileId));
}

function toJsonl<T>(rows: T[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

function buildDatacard(
  sliceName: string,
  profiles: ExperimentProfile[],
  games: BenchmarkGameRecord[],
  aggregates: ConditionAggregate[],
): string {
  return `# ${sliceName}

## Description
Program A benchmark export generated from the in-browser benchmark database.

## Statistics
- Profiles: ${profiles.length}
- Games: ${games.length}
- Moves: ${games.reduce((sum, game) => sum + game.moves.length, 0)}
- Models: ${new Set(aggregates.map((aggregate) => aggregate.modelId)).size}

## Included files
- data.jsonl
- games.jsonl
- config.json
- metrics.json
- datacard.md

## Methodology
Records are generated from completed benchmark games and denormalized with profile configuration for downstream analysis.
`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function crc32(data: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concatArrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildZip(files: Array<{ name: string; content: string }>): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);

    const localHeader = concatArrays([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(contentBytes.length),
      uint32(contentBytes.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes,
      contentBytes,
    ]);
    localParts.push(localHeader);

    const centralHeader = concatArrays([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(contentBytes.length),
      uint32(contentBytes.length),
      uint16(nameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length;
  }

  const centralDirectory = concatArrays(centralParts);
  const localDirectory = concatArrays(localParts);
  const endRecord = concatArrays([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(localDirectory.length),
    uint16(0),
  ]);

  return new Blob(
    [
      cloneBlobBytes(localDirectory),
      cloneBlobBytes(centralDirectory),
      cloneBlobBytes(endRecord),
    ],
    { type: 'application/zip' },
  );
}

function flattenMoves(games: BenchmarkGameRecord[]): BenchmarkMoveRecord[] {
  return games.flatMap((game) => game.moves);
}

function cloneBlobBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const cloned = new Uint8Array(buffer);
  cloned.set(bytes);
  return cloned;
}

export function buildBenchmarkPackage(
  state: Pick<BenchmarkDatabaseState, 'profiles' | 'games' | 'aggregates'>,
  query: BenchmarkQuery,
  sliceName: string,
): Blob {
  const selectedAggregates = queryAggregates(state.aggregates, query);
  const selectedGames = queryGames(state.games, state.aggregates, query);
  const selectedProfileIds = new Set(selectedAggregates.flatMap((aggregate) => aggregate.profileIds));
  const selectedProfiles = state.profiles.filter((profile) => selectedProfileIds.has(profile.profileId));
  const files = [
    { name: 'data.jsonl', content: toJsonl(flattenMoves(selectedGames)) },
    { name: 'games.jsonl', content: toJsonl(selectedGames) },
    { name: 'config.json', content: JSON.stringify(selectedProfiles, null, 2) },
    { name: 'metrics.json', content: JSON.stringify(selectedAggregates, null, 2) },
    { name: 'datacard.md', content: buildDatacard(sliceName, selectedProfiles, selectedGames, selectedAggregates) },
  ];
  return buildZip(files);
}

export function downloadBenchmarkPackage(
  state: Pick<BenchmarkDatabaseState, 'profiles' | 'games' | 'aggregates'>,
  query: BenchmarkQuery,
  sliceName: string,
): void {
  const slug = sliceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadBlob(buildBenchmarkPackage(state, query, sliceName), `${slug}.zip`);
}

export function downloadJsonReport(report: GeneratedReport): void {
  downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${report.type}-${report.reportId}.json`);
}

export function downloadHtmlReport(report: GeneratedReport): void {
  downloadBlob(new Blob([report.html], { type: 'text/html' }), `${report.type}-${report.reportId}.html`);
}
