import { useMemo, useState } from 'react';
import { useBenchmarkStore } from '../store/benchmarkStore';
import type { BenchmarkDatabaseState, BenchmarkQuery, BenchmarkTier, ConditionAggregate } from '../benchmark/types';
import {
  downloadBenchmarkPackage,
  downloadHtmlReport,
  downloadJsonReport,
  queryAggregates,
} from '../benchmark/export';

type SortKey = 'elo' | 'games' | 'legal' | 'cpl' | 'time';
type ViewMode = 'table' | 'comparison' | 'curve';

function buildSliceName(query: BenchmarkQuery): string {
  if (query.attackCategories?.length) return 'Adversarial';
  if (query.advisorQualities?.length || query.advisorFramings?.length || query.advisorVisibilities?.length) return 'Trust Calibration';
  if (query.formats?.includes('C')) return 'Indecisiveness';
  if (query.formats?.includes('A') && query.formats?.includes('B')) return 'CoT Research';
  return query.tier === 'adversarial' ? 'Adversarial' : query.tier === 'assisted' ? 'Assisted Play' : 'Standard Play';
}

function exactQuery(aggregate: ConditionAggregate): BenchmarkQuery {
  return {
    tier: aggregate.tier,
    modelIds: [aggregate.modelId],
    promptLevels: [aggregate.promptLevel],
    formats: [aggregate.formatVariant],
    constraintModes: [aggregate.constraintMode],
    advisorQualities: aggregate.advisorQuality != null ? [aggregate.advisorQuality] : undefined,
    advisorVisibilities: aggregate.advisorVisibility ? [aggregate.advisorVisibility] : undefined,
    advisorFramings: aggregate.advisorFraming ? [aggregate.advisorFraming] : undefined,
    attackCategories: aggregate.attackCategory ? [aggregate.attackCategory] : undefined,
    attackPatterns: aggregate.attackPattern ? [aggregate.attackPattern] : undefined,
    attackTimings: aggregate.attackTiming ? [aggregate.attackTiming] : undefined,
    toolkitEnabled: aggregate.toolkitEnabled,
  };
}

export function Leaderboard() {
  const {
    loading,
    error,
    profiles,
    benchmarkGames,
    aggregates,
    clearStats,
    getReportsForCondition,
    getFindingsForCondition,
  } = useBenchmarkStore();

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortBy, setSortBy] = useState<SortKey>('elo');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<BenchmarkTier | 'all'>('all');
  const [promptFilter, setPromptFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [constraintFilter, setConstraintFilter] = useState<string>('all');
  const [advisorVisibilityFilter, setAdvisorVisibilityFilter] = useState<string>('all');
  const [advisorFramingFilter, setAdvisorFramingFilter] = useState<string>('all');
  const [attackCategoryFilter, setAttackCategoryFilter] = useState<string>('all');
  const [attackPatternFilter, setAttackPatternFilter] = useState<string>('all');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [curveModel, setCurveModel] = useState<string>('all');

  const query: BenchmarkQuery = {
    tier: tierFilter,
    promptLevels: promptFilter === 'all' ? undefined : [promptFilter],
    formats: formatFilter === 'all' ? undefined : [formatFilter],
    constraintModes: constraintFilter === 'all' ? undefined : [constraintFilter],
    advisorVisibilities: advisorVisibilityFilter === 'all' ? undefined : [advisorVisibilityFilter],
    advisorFramings: advisorFramingFilter === 'all' ? undefined : [advisorFramingFilter],
    attackCategories: attackCategoryFilter === 'all' ? undefined : [attackCategoryFilter],
    attackPatterns: attackPatternFilter === 'all' ? undefined : [attackPatternFilter],
  };

  const filtered = useMemo(() => {
    const rows = queryAggregates(aggregates, query);
    return [...rows].sort((left, right) => {
      switch (sortBy) {
        case 'games':
          return right.metrics.games - left.metrics.games;
        case 'legal':
          return right.metrics.legalRate - left.metrics.legalRate;
        case 'cpl':
          return (left.metrics.avgCentipawnLoss ?? Infinity) - (right.metrics.avgCentipawnLoss ?? Infinity);
        case 'time':
          return (left.metrics.avgWallClockMs ?? Infinity) - (right.metrics.avgWallClockMs ?? Infinity);
        default:
          return right.metrics.eloEstimate - left.metrics.eloEstimate;
      }
    });
  }, [aggregates, query, sortBy]);

  const available = useMemo(() => ({
    prompts: [...new Set(aggregates.map((aggregate) => aggregate.promptLevel))].sort(),
    formats: [...new Set(aggregates.map((aggregate) => aggregate.formatVariant))].sort(),
    constraints: [...new Set(aggregates.map((aggregate) => aggregate.constraintMode))].sort(),
    advisorVis: [...new Set(aggregates.map((aggregate) => aggregate.advisorVisibility).filter(Boolean))] as string[],
    advisorFrames: [...new Set(aggregates.map((aggregate) => aggregate.advisorFraming).filter(Boolean))] as string[],
    attackCategories: [...new Set(aggregates.map((aggregate) => aggregate.attackCategory).filter(Boolean))] as string[],
    attackPatterns: [...new Set(aggregates.map((aggregate) => aggregate.attackPattern).filter(Boolean))] as string[],
    models: [...new Set(filtered.map((aggregate) => aggregate.modelId))].sort(),
  }), [aggregates, filtered]);

  const comparisonRows = filtered.filter((aggregate) => selectedModels.includes(aggregate.modelId)).slice(0, 3);
  const curveRows = filtered
    .filter((aggregate) => curveModel === 'all' || aggregate.modelId === curveModel)
    .sort((left, right) => left.promptLevel.localeCompare(right.promptLevel));

  const packageState = { profiles, games: benchmarkGames, aggregates };
  const sliceName = buildSliceName(query);

  if (loading && aggregates.length === 0) {
    return <div className="p-4 bg-surface-1 rounded-lg text-sm text-text-muted">Loading benchmark database…</div>;
  }

  return (
    <div className="p-4 bg-surface-1 rounded-lg space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Benchmark Leaderboard</h2>
          <p className="text-xs text-text-muted">{benchmarkGames.length} benchmark game{benchmarkGames.length !== 1 ? 's' : ''} · {profiles.length} profile{profiles.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ViewButton active={viewMode === 'table'} onClick={() => setViewMode('table')}>Table</ViewButton>
          <ViewButton active={viewMode === 'comparison'} onClick={() => setViewMode('comparison')}>Comparison</ViewButton>
          <ViewButton active={viewMode === 'curve'} onClick={() => setViewMode('curve')}>Curve</ViewButton>
          <button
            onClick={() => downloadBenchmarkPackage(packageState, query, sliceName)}
            disabled={filtered.length === 0}
            className="px-3 py-1 rounded text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary disabled:opacity-50"
          >
            Export ZIP
          </button>
          <button
            onClick={() => void clearStats()}
            disabled={loading}
            className="px-3 py-1 rounded text-xs font-medium bg-error/20 hover:bg-error/30 text-error disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="space-y-2">
        <FilterRow label="Tier">
          <FilterChip active={tierFilter === 'all'} onClick={() => setTierFilter('all')}>All</FilterChip>
          {(['standard', 'assisted', 'adversarial'] as const).map((value) => (
            <FilterChip key={value} active={tierFilter === value} onClick={() => setTierFilter(value)}>{value}</FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Prompt">
          <FilterChip active={promptFilter === 'all'} onClick={() => setPromptFilter('all')}>All</FilterChip>
          {available.prompts.map((value) => (
            <FilterChip key={value} active={promptFilter === value} onClick={() => setPromptFilter(value)}>{value}</FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Format">
          <FilterChip active={formatFilter === 'all'} onClick={() => setFormatFilter('all')}>All</FilterChip>
          {available.formats.map((value) => (
            <FilterChip key={value} active={formatFilter === value} onClick={() => setFormatFilter(value)}>{value}</FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Constraint">
          <FilterChip active={constraintFilter === 'all'} onClick={() => setConstraintFilter('all')}>All</FilterChip>
          {available.constraints.map((value) => (
            <FilterChip key={value} active={constraintFilter === value} onClick={() => setConstraintFilter(value)}>{value}</FilterChip>
          ))}
        </FilterRow>
        {available.advisorVis.length > 0 && (
          <FilterRow label="Advisor Vis">
            <FilterChip active={advisorVisibilityFilter === 'all'} onClick={() => setAdvisorVisibilityFilter('all')}>All</FilterChip>
            {available.advisorVis.map((value) => (
              <FilterChip key={value} active={advisorVisibilityFilter === value} onClick={() => setAdvisorVisibilityFilter(value)}>{value}</FilterChip>
            ))}
          </FilterRow>
        )}
        {available.advisorFrames.length > 0 && (
          <FilterRow label="Framing">
            <FilterChip active={advisorFramingFilter === 'all'} onClick={() => setAdvisorFramingFilter('all')}>All</FilterChip>
            {available.advisorFrames.map((value) => (
              <FilterChip key={value} active={advisorFramingFilter === value} onClick={() => setAdvisorFramingFilter(value)}>{value}</FilterChip>
            ))}
          </FilterRow>
        )}
        {available.attackCategories.length > 0 && (
          <FilterRow label="Attack Cat">
            <FilterChip active={attackCategoryFilter === 'all'} onClick={() => setAttackCategoryFilter('all')}>All</FilterChip>
            {available.attackCategories.map((value) => (
              <FilterChip key={value} active={attackCategoryFilter === value} onClick={() => setAttackCategoryFilter(value)}>{value}</FilterChip>
            ))}
          </FilterRow>
        )}
        {available.attackPatterns.length > 0 && (
          <FilterRow label="Attack Pat">
            <FilterChip active={attackPatternFilter === 'all'} onClick={() => setAttackPatternFilter('all')}>All</FilterChip>
            {available.attackPatterns.map((value) => (
              <FilterChip key={value} active={attackPatternFilter === value} onClick={() => setAttackPatternFilter(value)}>{value}</FilterChip>
            ))}
          </FilterRow>
        )}
      </div>

      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-2 text-text-muted text-xs">
                <HeaderButton active={sortBy === 'elo'} onClick={() => setSortBy('elo')}>Elo</HeaderButton>
                <th className="text-left py-2 pr-3">Condition</th>
                <HeaderButton active={sortBy === 'games'} onClick={() => setSortBy('games')}>Games</HeaderButton>
                <HeaderButton active={sortBy === 'legal'} onClick={() => setSortBy('legal')}>Legal %</HeaderButton>
                <HeaderButton active={sortBy === 'cpl'} onClick={() => setSortBy('cpl')}>Avg CPL</HeaderButton>
                <HeaderButton active={sortBy === 'time'} onClick={() => setSortBy('time')}>Wall ms</HeaderButton>
              </tr>
            </thead>
            <tbody>
              {filtered.map((aggregate) => {
                const findings = getFindingsForCondition(aggregate.conditionId);
                const reports = getReportsForCondition(aggregate.conditionId);
                const open = expanded === aggregate.conditionId;
                return (
                  <FragmentRow
                    key={aggregate.conditionId}
                    aggregate={aggregate}
                    open={open}
                    findings={findings}
                    reports={reports}
                    onToggle={() => setExpanded(open ? null : aggregate.conditionId)}
                    packageState={packageState}
                  />
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-sm text-text-muted py-4">No benchmark conditions match the current filters.</p>}
        </div>
      )}

      {viewMode === 'comparison' && (
        <div className="space-y-3">
          <div className="flex gap-1 flex-wrap">
            {available.models.map((model) => {
              const selected = selectedModels.includes(model);
              return (
                <FilterChip
                  key={model}
                  active={selected}
                  onClick={() => setSelectedModels((current) =>
                    selected ? current.filter((entry) => entry !== model) : [...current, model].slice(-3),
                  )}
                >
                  {model.split('/').pop() ?? model}
                </FilterChip>
              );
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {comparisonRows.map((aggregate) => (
              <div key={aggregate.conditionId} className="border border-surface-3 rounded-lg p-3 bg-surface-0">
                <h3 className="text-sm font-semibold text-text-primary">{aggregate.modelId}</h3>
                <p className="text-xs text-text-muted">{aggregate.promptLevel} · {aggregate.formatVariant} · {aggregate.constraintMode}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <MetricLine label="Elo" value={String(aggregate.metrics.eloEstimate)} />
                  <MetricLine label="Games" value={String(aggregate.metrics.games)} />
                  <MetricLine label="Legal %" value={`${(aggregate.metrics.legalRate * 100).toFixed(1)}%`} />
                  <MetricLine label="Avg CPL" value={aggregate.metrics.avgCentipawnLoss != null ? aggregate.metrics.avgCentipawnLoss.toFixed(1) : 'n/a'} />
                  <MetricLine label="ADR" value={aggregate.metrics.adr != null ? (aggregate.metrics.adr * 100).toFixed(1) + '%' : 'n/a'} />
                  <MetricLine label="Resilience" value={aggregate.metrics.resilienceScore != null ? aggregate.metrics.resilienceScore.toFixed(1) : 'n/a'} />
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'curve' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Model</span>
            <select
              value={curveModel}
              onChange={(event) => setCurveModel(event.target.value)}
              className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
            >
              <option value="all">All filtered</option>
              {available.models.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {curveRows.map((aggregate) => (
              <div key={aggregate.conditionId} className="flex items-center gap-3">
                <div className="w-44 text-xs text-text-secondary">{aggregate.modelId.split('/').pop()} · {aggregate.promptLevel}</div>
                <div className="flex-1 h-4 bg-surface-2 rounded overflow-hidden">
                  <div
                    className="h-full bg-purple-accent"
                    style={{ width: `${Math.max(4, Math.min(100, aggregate.metrics.eloEstimate / 24))}%` }}
                  />
                </div>
                <div className="w-16 text-right text-xs text-text-primary">{aggregate.metrics.eloEstimate}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ aggregate, open, findings, reports, onToggle, packageState }: {
  aggregate: ConditionAggregate;
  open: boolean;
  findings: ReturnType<typeof useBenchmarkStore.getState>['findings'];
  reports: ReturnType<typeof useBenchmarkStore.getState>['reports'];
  onToggle: () => void;
  packageState: Pick<BenchmarkDatabaseState, 'profiles' | 'games' | 'aggregates'>;
}) {

  return (
    <>
      <tr className="border-b border-surface-2/70">
        <td className="py-2 pr-3 text-text-primary font-medium">{aggregate.metrics.eloEstimate}</td>
        <td className="py-2 pr-3">
          <button onClick={onToggle} className="text-left">
            <div className="text-text-primary font-medium">{aggregate.displayName}</div>
            <div className="text-xs text-text-muted">{aggregate.modelId} · {aggregate.promptLevel}/{aggregate.formatVariant} · {aggregate.tier}</div>
          </button>
        </td>
        <td className="py-2 pr-3 text-text-secondary">{aggregate.metrics.games}</td>
        <td className="py-2 pr-3 text-text-secondary">{(aggregate.metrics.legalRate * 100).toFixed(1)}%</td>
        <td className="py-2 pr-3 text-text-secondary">{aggregate.metrics.avgCentipawnLoss != null ? aggregate.metrics.avgCentipawnLoss.toFixed(1) : 'n/a'}</td>
        <td className="py-2 pr-3 text-text-secondary">{aggregate.metrics.avgWallClockMs != null ? Math.round(aggregate.metrics.avgWallClockMs) : 'n/a'}</td>
      </tr>
      {open && (
        <tr className="border-b border-surface-2/70">
          <td colSpan={6} className="py-3">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="space-y-1 text-sm">
                <MetricLine label="Elo CI" value={`${aggregate.metrics.eloCiLow} - ${aggregate.metrics.eloCiHigh}`} />
                <MetricLine label="Win / Loss / Draw" value={`${aggregate.metrics.wins} / ${aggregate.metrics.losses} / ${aggregate.metrics.draws}`} />
                <MetricLine label="ADR" value={aggregate.metrics.adr != null ? (aggregate.metrics.adr * 100).toFixed(1) + '%' : 'n/a'} />
                <MetricLine label="ABI" value={aggregate.metrics.abi != null ? aggregate.metrics.abi.toFixed(3) : 'n/a'} />
                <MetricLine label="PSI" value={aggregate.metrics.psi != null ? aggregate.metrics.psi.toFixed(3) : 'n/a'} />
                <MetricLine label="CoT Value" value={aggregate.metrics.cotValue != null ? aggregate.metrics.cotValue.toFixed(1) : 'n/a'} />
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-text-muted mb-2">Findings</h4>
                {findings.length === 0 ? (
                  <p className="text-sm text-text-muted">No findings for this condition.</p>
                ) : (
                  <div className="space-y-2">
                    {findings.map((finding) => (
                      <div key={finding.findingId} className="text-sm bg-surface-0 rounded border border-surface-3 p-2">
                        <div className="text-xs text-text-muted uppercase">{finding.severity}</div>
                        <div className="text-text-primary font-medium">{finding.title}</div>
                        <div className="text-text-secondary">{finding.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-text-muted mb-2">Actions</h4>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => downloadBenchmarkPackage(packageState, exactQuery(aggregate), aggregate.displayName)}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary text-left"
                  >
                    Export condition ZIP
                  </button>
                  {reports.map((report) => (
                    <div key={report.reportId} className="flex gap-2">
                      <button
                        onClick={() => downloadHtmlReport(report)}
                        className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary text-left"
                      >
                        {report.type} HTML
                      </button>
                      <button
                        onClick={() => downloadJsonReport(report)}
                        className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary text-left"
                      >
                        JSON
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-text-muted w-20 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-purple-accent text-white'
          : 'bg-surface-2 text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function ViewButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-purple-accent text-white'
          : 'bg-surface-2 text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function HeaderButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <th className="text-left py-2 pr-3">
      <button onClick={onClick} className={active ? 'text-text-primary' : 'text-text-muted'}>
        {children}
      </button>
    </th>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
