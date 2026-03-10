import type { CommentatorConfig, PlayerConfig, PromptLevel } from '../engine/types';
import { normalizeOutputFormat, normalizePromptLevel } from '../engine/types';
import type {
  BenchmarkGameSide,
  BenchmarkIngestContext,
  BenchmarkModelConfig,
  BenchmarkOpponentConfig,
  BenchmarkPromptConfig,
  ExperimentProfile,
  ProfilePreset,
} from './types';
import { getBenchmarkTier, getConstraintMode, getContextModeLabel } from './types';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toProvider(modelId: string): string {
  if (modelId.includes('/')) return modelId.split('/')[0];
  return 'unknown';
}

function toVariant(modelId: string): string {
  const [, rest] = modelId.includes('/') ? modelId.split('/', 2) : ['unknown', modelId];
  if (rest.includes(':')) return rest.split(':').slice(1).join(':');
  return 'default';
}

function normalizePromptLabel(level: PromptLevel | undefined): BenchmarkPromptConfig['level'] {
  const normalized = normalizePromptLevel(level);
  return normalized.toUpperCase() as BenchmarkPromptConfig['level'];
}

function abbreviateModel(modelId: string): string {
  const leaf = modelId.split('/').pop() || modelId;
  return leaf
    .replace(/[^a-zA-Z0-9]+/g, '')
    .replace(/preview/gi, 'pre')
    .replace(/reasoning/gi, 'rsn')
    .slice(0, 16)
    .toLowerCase();
}

function buildConstraintLabel(profile: ExperimentProfile): string {
  const constraints = profile.constraints;
  switch (constraints.mode) {
    case 'unlimited':
      return 'unlim';
    case 'wall_clock':
      return constraints.wallClockMs ? `wall${Math.max(1, Math.round(constraints.wallClockMs / 1000))}s` : 'wall';
    case 'token_budget':
      return constraints.outputTokenLimit ? `tok${constraints.outputTokenLimit}` : 'tok';
    case 'reasoning_budget':
      return constraints.reasoningTokenLimit ? `think${constraints.reasoningTokenLimit}` : 'think';
    default:
      return 'combo';
  }
}

function buildVariantParts(profile: ExperimentProfile): string[] {
  const parts: string[] = [];
  if (profile.prompt.indecisivenessTools) parts.push('indecisive');
  if (profile.advisor?.enabled) {
    parts.push(`advisor_${(profile.advisor.framing ?? 'na').toLowerCase()}_${profile.advisor.visibility ?? 'na'}`);
  }
  if (profile.attacks?.enabled) {
    const timing = profile.attacks.injections[0]?.move;
    const pattern = profile.attacks.pattern ?? 'attack';
    parts.push(timing != null ? `${pattern}${timing}` : pattern);
  }
  if (profile.toolkit.enabled) parts.push('toolkit');
  return parts;
}

export function autoNameProfile(profile: Omit<ExperimentProfile, 'profileId' | 'profileName' | 'createdAt'>): string {
  const modelShort = abbreviateModel(profile.model.id);
  const prompt = profile.prompt.level;
  const format = profile.prompt.format;
  const constraint = buildConstraintLabel(profile as ExperimentProfile);
  const opponent = profile.opponent.type === 'stockfish'
    ? `sf${profile.opponent.elo ?? 'na'}`
    : profile.opponent.type === 'human'
      ? 'human'
      : abbreviateModel(profile.opponent.modelId ?? 'llm');
  const variant = buildVariantParts(profile as ExperimentProfile);
  return [modelShort, prompt, format, constraint, opponent, ...variant].join('_');
}

export function buildExperimentProfile(
  side: BenchmarkGameSide,
  ingest: BenchmarkIngestContext,
  commentator?: CommentatorConfig | null,
): ExperimentProfile {
  const player = side.player;
  const opponent = side.opponent;
  const promptLevel = normalizePromptLabel(player.promptLevel);
  const outputFormat = normalizeOutputFormat(player.outputFormat, player.reasoningOrder);
  const model: BenchmarkModelConfig = {
    id: player.model,
    provider: toProvider(player.model),
    variant: toVariant(player.model),
    temperature: player.temperature,
    topP: null,
  };
  const opponentConfig: BenchmarkOpponentConfig = opponent.type === 'stockfish'
    ? {
        type: 'stockfish',
        elo: opponent.stockfishElo ?? null,
        depth: opponent.stockfishDepth ?? null,
        skill: null,
        modelId: null,
      }
    : opponent.type === 'human'
      ? {
          type: 'human',
          elo: null,
          depth: null,
          skill: null,
          modelId: null,
        }
      : {
          type: 'llm',
          elo: null,
          depth: null,
          skill: null,
          modelId: opponent.model,
        };

  const base: Omit<ExperimentProfile, 'profileId' | 'profileName' | 'createdAt'> = {
    tier: getBenchmarkTier(player),
    model,
    prompt: {
      level: promptLevel,
      format: outputFormat,
      indecisivenessTools: outputFormat === 'C',
      persona: null,
    },
    constraints: {
      mode: getConstraintMode(player.constraints),
      wallClockMs: player.constraints?.wallClockPerMoveMs ?? null,
      gameClockMs: player.constraints?.gameClockMs ?? null,
      incrementMs: player.constraints?.fischerIncrementMs ?? null,
      outputTokenLimit: player.constraints?.outputTokenBudget ?? null,
      reasoningTokenLimit: player.constraints?.reasoningTokenBudget ?? null,
      timeoutBehavior: (player.constraints?.timeoutBehavior ?? 'best_effort') as ExperimentProfile['constraints']['timeoutBehavior'],
    },
    opponent: opponentConfig,
    game: {
      opening: ingest.openingId ?? ingest.openingName ?? null,
      startingFen: ingest.startingFen ?? null,
      color: side.perspectiveColor,
      matchStructure: ingest.matchStructure ?? 'single',
      adjudication: {
        maxMoves: null,
        resignThresholdCp: null,
        drawRules: true,
      },
    },
    oracle: {
      engine: 'stockfish',
      depth: commentator?.stockfishDepth ?? 18,
      realtime: true,
    },
    commentator: {
      enabled: !!commentator?.id,
      modelId: commentator?.id ?? null,
      hasOracleAccess: (commentator?.mode ?? 'oracle') === 'oracle',
      realtime: true,
    },
    advisor: player.advisor?.enabled
      ? {
          enabled: true,
          qualityElo: player.advisor.stockfishElo ?? null,
          visibility: player.advisor.visibility ?? null,
          framing: player.advisor.provenanceFrame ?? null,
          correctionLoop: (player.advisor.correctionLoopMode ?? 'on') !== 'off',
        }
      : null,
    attacks: player.attacks?.length
      ? {
          enabled: true,
          vectors: player.attacks.map((attack) => `${attack.channel}.${attack.vectorId}`),
          pattern: player.transition?.attackPattern ?? null,
        injections: (player.transition?.injectionTimeline ?? []).map((event) => ({
            move: event.moveNumber,
            type: event.eventType,
            content: stableStringify(event.payload),
          })),
        }
      : null,
    context: {
      mode: getContextModeLabel(player.contextMode),
      scratchpadType: player.scratchpadConfig?.type ?? null,
    },
    fog: player.fogOfWar?.enabled
      ? {
          enabled: true,
          visibility: player.fogOfWar.visibilityMode ?? null,
          radius: player.fogOfWar.radiusSquares ?? null,
          scouting: player.fogOfWar.scoutingMode ?? null,
          reporter: player.fogOfWar.advisorReporterType ?? null,
        }
      : null,
    simul: player.simulPlay?.enabled
      ? {
          enabled: true,
          boardCount: player.simulPlay.boards.length,
          opponentComposition: player.simulPlay.opponentComposition ?? null,
          sync: player.simulPlay.turnSync ?? null,
        }
      : null,
    orchestrator: player.orchestrator?.enabled
      ? {
          enabled: true,
          orchestratorModel: player.orchestrator.orchestratorModel.model,
          playerCount: player.orchestrator.players.length,
          communicationMode: player.orchestrator.communicationMode ?? null,
          chain: player.orchestrator.chainOfCommand ?? null,
        }
      : null,
    toolkit: {
      enabled: player.graduatedResponse?.enabled ?? false,
    },
    extensions: {
      reasoningEffort: player.reasoningEffort ?? 'high',
      maxTokens: player.maxTokens ?? null,
      benchmarkFraming: player.evalAwareness?.framing ?? null,
      linePrediction: {
        enabled: player.linePrediction?.enabled ?? false,
        count: player.linePrediction?.count ?? null,
        depth: player.linePrediction?.depth ?? null,
      },
    },
  };

  const canonical = stableStringify(base);
  const profileId = hashString(canonical);
  const profileName = autoNameProfile(base);

  return {
    profileId,
    profileName,
    createdAt: new Date().toISOString(),
    ...base,
  };
}

export function diffProfiles(a: ExperimentProfile, b: ExperimentProfile): string[] {
  const left = stableStringify(a);
  const right = stableStringify(b);
  if (left === right) return [];
  const changed: string[] = [];
  const scan = (prefix: string, av: unknown, bv: unknown) => {
    if (stableStringify(av) === stableStringify(bv)) return;
    if (!av || !bv || typeof av !== 'object' || typeof bv !== 'object' || Array.isArray(av) || Array.isArray(bv)) {
      changed.push(prefix);
      return;
    }
    const keys = new Set([...Object.keys(av as Record<string, unknown>), ...Object.keys(bv as Record<string, unknown>)]);
    for (const key of keys) {
      scan(prefix ? `${prefix}.${key}` : key, (av as Record<string, unknown>)[key], (bv as Record<string, unknown>)[key]);
    }
  };
  scan('', a, b);
  return changed;
}

export function hotSwapProfile(
  profile: ExperimentProfile,
  updates: Partial<ExperimentProfile>,
): ExperimentProfile {
  const merged = {
    ...profile,
    ...updates,
    model: { ...profile.model, ...updates.model },
    prompt: { ...profile.prompt, ...updates.prompt },
    constraints: { ...profile.constraints, ...updates.constraints },
    opponent: { ...profile.opponent, ...updates.opponent },
    game: {
      ...profile.game,
      ...updates.game,
      adjudication: { ...profile.game.adjudication, ...updates.game?.adjudication },
    },
    oracle: { ...profile.oracle, ...updates.oracle },
    commentator: { ...profile.commentator, ...updates.commentator },
    context: { ...profile.context, ...updates.context },
    toolkit: { ...profile.toolkit, ...updates.toolkit },
    extensions: { ...profile.extensions, ...updates.extensions },
  };
  const rebuilt = {
    ...merged,
    profileId: profile.profileId,
    profileName: profile.profileName,
    createdAt: profile.createdAt,
  };
  const refreshed = buildExperimentProfile(
    {
      player: {
        model: rebuilt.model.id,
        displayName: rebuilt.model.id,
        temperature: rebuilt.model.temperature,
        maxRetries: 3,
        promptLevel: rebuilt.prompt.level.toLowerCase() as PlayerConfig['promptLevel'],
        outputFormat: rebuilt.prompt.format,
        type: 'llm',
        reasoningEffort: rebuilt.extensions.reasoningEffort,
        maxTokens: rebuilt.extensions.maxTokens ?? undefined,
      } as PlayerConfig,
      opponent: {
        model: rebuilt.opponent.modelId ?? rebuilt.opponent.type,
        displayName: rebuilt.opponent.modelId ?? rebuilt.opponent.type,
        temperature: 0,
        maxRetries: 0,
        type: rebuilt.opponent.type === 'stockfish' ? 'stockfish' : rebuilt.opponent.type === 'human' ? 'human' : 'llm',
        stockfishElo: rebuilt.opponent.elo ?? undefined,
        stockfishDepth: rebuilt.opponent.depth ?? undefined,
      } as PlayerConfig,
      perspectiveColor: rebuilt.game.color === 'black' ? 'black' : 'white',
    },
    {
      source: 'legacy_import',
      openingId: rebuilt.game.opening,
      startingFen: rebuilt.game.startingFen,
      matchStructure: rebuilt.game.matchStructure,
    },
  );
  return {
    ...rebuilt,
    profileId: refreshed.profileId,
    profileName: refreshed.profileName,
  };
}

export function cloneProfile(profile: ExperimentProfile): ExperimentProfile {
  return {
    ...profile,
    createdAt: new Date().toISOString(),
  };
}

export function createPreset(name: string, description: string, profile: ExperimentProfile): ProfilePreset {
  return {
    presetId: hashString(`${name}:${profile.profileId}`),
    name,
    description,
    profile,
  };
}

export function expandFactorialProfile(
  base: ExperimentProfile,
  expansion: Partial<Record<'model' | 'prompt' | 'format', string[]>>,
): ExperimentProfile[] {
  const models = expansion.model ?? [base.model.id];
  const prompts = expansion.prompt ?? [base.prompt.level];
  const formats = expansion.format ?? [base.prompt.format];
  const profiles: ExperimentProfile[] = [];
  for (const model of models) {
    for (const prompt of prompts) {
      for (const format of formats) {
        const next = hotSwapProfile(base, {
          model: { ...base.model, id: model, provider: toProvider(model), variant: toVariant(model) },
          prompt: { ...base.prompt, level: prompt.toUpperCase() as ExperimentProfile['prompt']['level'], format: format as ExperimentProfile['prompt']['format'] },
        });
        profiles.push(next);
      }
    }
  }
  return profiles;
}
