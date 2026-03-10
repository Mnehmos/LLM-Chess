import type {
  AggregateHistorySnapshot,
  ConditionAggregate,
  Finding,
  GeneratedReport,
} from './types';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function severityForThreshold(value: number, warning: number, critical: number): Finding['severity'] {
  if (value >= critical) return 'critical';
  if (value >= warning) return 'significant';
  return 'notable';
}

function buildHtml(title: string, summary: string, items: Array<{ label: string; value: string }>, findings: Finding[]): string {
  const rows = items.map((item) => `<tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;">${item.label}</th><td style="padding:6px 8px;border-bottom:1px solid #ddd;">${item.value}</td></tr>`).join('');
  const findingsHtml = findings.length > 0
    ? `<h2>Findings</h2><ul>${findings.map((finding) => `<li><strong>${finding.severity.toUpperCase()}</strong>: ${finding.title} — ${finding.description}</li>`).join('')}</ul>`
    : '<p>No notable findings.</p>';

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Georgia,serif;padding:24px;color:#222;">
  <h1>${title}</h1>
  <p>${summary}</p>
  <table style="border-collapse:collapse;min-width:420px;">${rows}</table>
  ${findingsHtml}
</body>
</html>`;
}

function buildAggregateFinding(
  aggregate: ConditionAggregate,
  type: Finding['type'],
  severity: Finding['severity'],
  title: string,
  description: string,
  metric: string,
  value: number,
  comparison: number,
): Finding {
  return {
    findingId: hashString(`${aggregate.conditionId}:${type}:${metric}:${title}`),
    type,
    severity,
    title,
    description,
    evidence: {
      metric,
      value,
      comparison,
      pValue: null,
    },
    affectedModels: [aggregate.modelId],
    affectedConditions: [aggregate.conditionId],
    createdAt: new Date().toISOString(),
  };
}

function getCostRank(modelId: string): number {
  const lower = modelId.toLowerCase();
  if (lower.includes('flash') || lower.includes('mini') || lower.includes('lite') || lower.includes('haiku')) return 1;
  if (lower.includes('gpt-4') || lower.includes('qwen') || lower.includes('mistral')) return 2;
  return 3;
}

export function generateFindings(
  aggregates: ConditionAggregate[],
  history: AggregateHistorySnapshot[],
): Finding[] {
  const findings: Finding[] = [];

  const legalRates = aggregates.map((aggregate) => aggregate.metrics.legalRate);
  const cplValues = aggregates.map((aggregate) => aggregate.metrics.avgCentipawnLoss).filter((value): value is number => value != null);
  const eloValues = aggregates.map((aggregate) => aggregate.metrics.eloEstimate);
  const cohorts = [
    { metric: 'legal_rate', values: legalRates },
    { metric: 'avg_centipawn_loss', values: cplValues },
    { metric: 'elo_estimate', values: eloValues },
  ] as const;

  for (const cohort of cohorts) {
    if (cohort.values.length < 2) continue;
    const mean = average(cohort.values);
    const sd = standardDeviation(cohort.values);
    if (sd === 0) continue;
    for (const aggregate of aggregates) {
      const value = cohort.metric === 'legal_rate'
        ? aggregate.metrics.legalRate
        : cohort.metric === 'avg_centipawn_loss'
          ? aggregate.metrics.avgCentipawnLoss
          : aggregate.metrics.eloEstimate;
      if (value == null) continue;
      if (Math.abs(value - mean) > 2 * sd) {
        findings.push(buildAggregateFinding(
          aggregate,
          'anomaly',
          'significant',
          `${aggregate.displayName} is an outlier on ${cohort.metric}`,
          `Observed ${cohort.metric} deviates materially from the current fleet average.`,
          cohort.metric,
          value,
          mean,
        ));
      }
    }
  }

  for (const aggregate of aggregates) {
    if (aggregate.metrics.legalRate < 0.9) {
      findings.push(buildAggregateFinding(
        aggregate,
        'threshold',
        severityForThreshold(1 - aggregate.metrics.legalRate, 0.05, 0.1),
        `${aggregate.displayName} has sub-90% legal rate`,
        'Legal move compliance is below the benchmark threshold.',
        'legal_rate',
        aggregate.metrics.legalRate,
        0.9,
      ));
    }
    if ((aggregate.metrics.avgCentipawnLoss ?? 0) > 200) {
      findings.push(buildAggregateFinding(
        aggregate,
        'threshold',
        severityForThreshold(aggregate.metrics.avgCentipawnLoss ?? 0, 120, 200),
        `${aggregate.displayName} exceeds 200 average CPL`,
        'Move quality proxy is beyond the acceptable threshold for publishable baseline play.',
        'avg_centipawn_loss',
        aggregate.metrics.avgCentipawnLoss ?? 0,
        200,
      ));
    }
    if ((aggregate.metrics.detectionLatency ?? 0) > 20) {
      findings.push(buildAggregateFinding(
        aggregate,
        'threshold',
        'critical',
        `${aggregate.displayName} has high attack detection latency`,
        'The model takes too long to respond to adversarial degradation.',
        'detection_latency',
        aggregate.metrics.detectionLatency ?? 0,
        20,
      ));
    }
  }

  const byModel = new Map<string, ConditionAggregate[]>();
  for (const aggregate of aggregates) {
    const bucket = byModel.get(aggregate.modelId);
    if (bucket) bucket.push(aggregate);
    else byModel.set(aggregate.modelId, [aggregate]);
  }

  for (const [modelId, modelAggregates] of byModel) {
    const cotByPrompt = modelAggregates
      .filter((aggregate) => aggregate.metrics.cotValue != null)
      .sort((a, b) => a.promptLevel.localeCompare(b.promptLevel));
    if (cotByPrompt.length >= 2) {
      const signs = new Set(cotByPrompt.map((aggregate) => Math.sign(aggregate.metrics.cotValue ?? 0)).filter((sign) => sign !== 0));
      if (signs.size > 1) {
        const source = cotByPrompt[0];
        findings.push(buildAggregateFinding(
          source,
          'interaction',
          'notable',
          `${modelId} flips CoT value across prompt levels`,
          'Reason-first vs move-first changes sign across prompt levels, indicating a prompt-format interaction.',
          'cot_value',
          source.metrics.cotValue ?? 0,
          0,
        ));
      }
    }
  }

  const promptBuckets = new Map<string, ConditionAggregate[]>();
  for (const aggregate of aggregates) {
    const key = `${aggregate.promptLevel}:${aggregate.formatVariant}:${aggregate.constraintMode}:${aggregate.tier}`;
    const bucket = promptBuckets.get(key);
    if (bucket) bucket.push(aggregate);
    else promptBuckets.set(key, [aggregate]);
  }

  for (const bucket of promptBuckets.values()) {
    for (const left of bucket) {
      for (const right of bucket) {
        if (left.conditionId === right.conditionId) continue;
        if (getCostRank(left.modelId) < getCostRank(right.modelId) && left.metrics.eloEstimate >= right.metrics.eloEstimate) {
          findings.push(buildAggregateFinding(
            left,
            'crossover',
            'notable',
            `${left.modelId} crosses over ${right.modelId}`,
            'A cheaper model configuration meets or exceeds a more expensive comparison point.',
            'elo_estimate',
            left.metrics.eloEstimate,
            right.metrics.eloEstimate,
          ));
        }
      }
    }
  }

  const historyByFamily = new Map<string, AggregateHistorySnapshot[]>();
  for (const snapshot of history) {
    const bucket = historyByFamily.get(snapshot.batchFamilyId);
    if (bucket) bucket.push(snapshot);
    else historyByFamily.set(snapshot.batchFamilyId, [snapshot]);
  }
  for (const [familyId, familyHistory] of historyByFamily) {
    const ordered = [...familyHistory].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    if (ordered.length < 2) continue;
    const previous = ordered[ordered.length - 2];
    const current = ordered[ordered.length - 1];
    if (current.metrics.eloEstimate < previous.metrics.eloEstimate - 25) {
      const aggregate = aggregates.find((entry) => entry.conditionId === current.conditionId);
      if (!aggregate) continue;
      findings.push(buildAggregateFinding(
        aggregate,
        'regression',
        'significant',
        `${aggregate.displayName} regressed vs previous comparable batch`,
        'Latest comparable run underperformed the immediately previous historical snapshot.',
        'elo_estimate',
        current.metrics.eloEstimate,
        previous.metrics.eloEstimate,
      ));
    }
    void familyId;
  }

  return findings;
}

export function generateReports(
  aggregates: ConditionAggregate[],
  findings: Finding[],
): GeneratedReport[] {
  const reports: GeneratedReport[] = [];

  for (const aggregate of aggregates) {
    const localFindings = findings.filter((finding) => finding.affectedConditions.includes(aggregate.conditionId));
    const scorecardItems = [
      { label: 'Model', value: aggregate.modelId },
      { label: 'Tier', value: aggregate.tier },
      { label: 'Prompt / Format', value: `${aggregate.promptLevel} / ${aggregate.formatVariant}` },
      { label: 'Elo ± CI', value: `${aggregate.metrics.eloEstimate} (${aggregate.metrics.eloCiLow}-${aggregate.metrics.eloCiHigh})` },
      { label: 'Games', value: String(aggregate.metrics.games) },
      { label: 'Legal %', value: `${(aggregate.metrics.legalRate * 100).toFixed(1)}%` },
      { label: 'Avg CPL', value: aggregate.metrics.avgCentipawnLoss != null ? aggregate.metrics.avgCentipawnLoss.toFixed(1) : 'n/a' },
    ];
    reports.push({
      reportId: hashString(`scorecard:${aggregate.conditionId}`),
      type: 'model_scorecard',
      title: `${aggregate.displayName} Scorecard`,
      subjectIds: [aggregate.conditionId],
      createdAt: new Date().toISOString(),
      summary: `${aggregate.modelId} at ${aggregate.promptLevel}/${aggregate.formatVariant} across ${aggregate.metrics.games} games.`,
      html: buildHtml(`${aggregate.displayName} Scorecard`, `${aggregate.modelId} benchmark summary.`, scorecardItems, localFindings),
      data: { aggregate, findings: localFindings },
    });

    if (aggregate.metrics.adr != null) {
      const items = [
        { label: 'ADR', value: (aggregate.metrics.adr * 100).toFixed(1) + '%' },
        { label: 'ABI', value: aggregate.metrics.abi != null ? aggregate.metrics.abi.toFixed(3) : 'n/a' },
        { label: 'PSI', value: aggregate.metrics.psi != null ? aggregate.metrics.psi.toFixed(3) : 'n/a' },
        { label: 'Post-commit deference', value: aggregate.metrics.postCommitDeference != null ? (aggregate.metrics.postCommitDeference * 100).toFixed(1) + '%' : 'n/a' },
      ];
      reports.push({
        reportId: hashString(`trust:${aggregate.conditionId}`),
        type: 'trust_calibration',
        title: `${aggregate.displayName} Trust Calibration`,
        subjectIds: [aggregate.conditionId],
        createdAt: new Date().toISOString(),
        summary: `Advisor deference and framing sensitivity for ${aggregate.modelId}.`,
        html: buildHtml(`${aggregate.displayName} Trust Calibration`, 'Trust metrics for advisor-mediated play.', items, localFindings),
        data: { aggregate, findings: localFindings },
      });
    }

    if (aggregate.attackCategory != null) {
      const items = [
        { label: 'Attack category', value: aggregate.attackCategory },
        { label: 'Pattern', value: aggregate.attackPattern ?? 'n/a' },
        { label: 'Resilience score', value: aggregate.metrics.resilienceScore != null ? aggregate.metrics.resilienceScore.toFixed(1) : 'n/a' },
        { label: 'Detection latency', value: aggregate.metrics.detectionLatency != null ? String(aggregate.metrics.detectionLatency) : 'n/a' },
      ];
      reports.push({
        reportId: hashString(`resilience:${aggregate.conditionId}`),
        type: 'adversarial_resilience',
        title: `${aggregate.displayName} Adversarial Resilience`,
        subjectIds: [aggregate.conditionId],
        createdAt: new Date().toISOString(),
        summary: `Adversarial degradation profile for ${aggregate.modelId}.`,
        html: buildHtml(`${aggregate.displayName} Adversarial Resilience`, 'Attack handling and escalation behavior.', items, localFindings),
        data: { aggregate, findings: localFindings },
      });
    }

    if ((aggregate.metrics.avgCandidateCount ?? 1) > 1) {
      const items = [
        { label: 'Avg candidates', value: aggregate.metrics.avgCandidateCount?.toFixed(2) ?? 'n/a' },
        { label: 'Oscillation rate', value: aggregate.metrics.oscillationRate != null ? (aggregate.metrics.oscillationRate * 100).toFixed(1) + '%' : 'n/a' },
        { label: 'Improvement rate', value: aggregate.metrics.improvementRate != null ? (aggregate.metrics.improvementRate * 100).toFixed(1) + '%' : 'n/a' },
      ];
      reports.push({
        reportId: hashString(`indecision:${aggregate.conditionId}`),
        type: 'indecisiveness_profile',
        title: `${aggregate.displayName} Indecisiveness Profile`,
        subjectIds: [aggregate.conditionId],
        createdAt: new Date().toISOString(),
        summary: `Candidate and revision behavior for ${aggregate.modelId}.`,
        html: buildHtml(`${aggregate.displayName} Indecisiveness`, 'Deliberation trace summary.', items, localFindings),
        data: { aggregate, findings: localFindings },
      });
    }
  }

  const byModel = new Map<string, ConditionAggregate[]>();
  for (const aggregate of aggregates) {
    const bucket = byModel.get(aggregate.modelId);
    if (bucket) bucket.push(aggregate);
    else byModel.set(aggregate.modelId, [aggregate]);
  }

  for (const [modelId, modelAggregates] of byModel) {
    const promptSweep = modelAggregates
      .slice()
      .sort((a, b) => a.promptLevel.localeCompare(b.promptLevel))
      .map((aggregate) => ({
        prompt: aggregate.promptLevel,
        elo: aggregate.metrics.eloEstimate,
      }));

    if (promptSweep.length >= 2) {
      reports.push({
        reportId: hashString(`prompt:${modelId}`),
        type: 'prompt_sensitivity',
        title: `${modelId} Prompt Sensitivity`,
        subjectIds: modelAggregates.map((aggregate) => aggregate.conditionId),
        createdAt: new Date().toISOString(),
        summary: `Prompt-level Elo curve for ${modelId}.`,
        html: buildHtml(
          `${modelId} Prompt Sensitivity`,
          'Prompt sweep across recorded prompt levels.',
          promptSweep.map((entry) => ({ label: entry.prompt, value: String(entry.elo) })),
          findings.filter((finding) => finding.affectedModels.includes(modelId)),
        ),
        data: { modelId, promptSweep },
      });
    }

    const cotAggregates = modelAggregates.filter((aggregate) => aggregate.metrics.cotValue != null);
    if (cotAggregates.length > 0) {
      reports.push({
        reportId: hashString(`cot:${modelId}`),
        type: 'cot_analysis',
        title: `${modelId} CoT Analysis`,
        subjectIds: cotAggregates.map((aggregate) => aggregate.conditionId),
        createdAt: new Date().toISOString(),
        summary: `Reason-first vs move-first delta for ${modelId}.`,
        html: buildHtml(
          `${modelId} CoT Analysis`,
          'Load-bearing vs decorative reasoning comparison.',
          cotAggregates.map((aggregate) => ({
            label: `${aggregate.promptLevel} ${aggregate.formatVariant}`,
            value: aggregate.metrics.cotValue?.toFixed(1) ?? 'n/a',
          })),
          findings.filter((finding) => finding.affectedModels.includes(modelId)),
        ),
        data: { modelId, cotAggregates },
      });
    }
  }

  if (aggregates.length >= 2) {
    const sorted = [...aggregates].sort((a, b) => b.metrics.eloEstimate - a.metrics.eloEstimate);
    reports.push({
      reportId: hashString('comparative:all'),
      type: 'comparative',
      title: 'Comparative Benchmark Report',
      subjectIds: aggregates.map((aggregate) => aggregate.conditionId),
      createdAt: new Date().toISOString(),
      summary: 'Head-to-head summary across all recorded Program A benchmark conditions.',
      html: buildHtml(
        'Comparative Benchmark Report',
        'Current aggregate leaderboard ordering.',
        sorted.map((aggregate) => ({
          label: aggregate.displayName,
          value: `Elo ${aggregate.metrics.eloEstimate} | Games ${aggregate.metrics.games}`,
        })),
        findings,
      ),
      data: { aggregates: sorted, findings },
    });
  }

  for (const aggregate of aggregates) {
    const local = reports.filter((report) => report.subjectIds.includes(aggregate.conditionId));
    reports.push({
      reportId: hashString(`full:${aggregate.conditionId}`),
      type: 'full_diagnostic',
      title: `${aggregate.displayName} Full Diagnostic`,
      subjectIds: [aggregate.conditionId],
      createdAt: new Date().toISOString(),
      summary: `Combined report bundle for ${aggregate.displayName}.`,
      html: buildHtml(
        `${aggregate.displayName} Full Diagnostic`,
        'Combined benchmark diagnostic for the selected condition.',
        [
          { label: 'Linked reports', value: local.map((report) => report.type).join(', ') || 'none' },
          { label: 'Findings', value: String(findings.filter((finding) => finding.affectedConditions.includes(aggregate.conditionId)).length) },
        ],
        findings.filter((finding) => finding.affectedConditions.includes(aggregate.conditionId)),
      ),
      data: {
        aggregate,
        linkedReportIds: local.map((report) => report.reportId),
      },
    });
  }

  return reports;
}
