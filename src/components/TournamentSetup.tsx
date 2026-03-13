import { useEffect, useState } from 'react';
import { ModelSelector } from './ModelSelector';
import { AdvancedPlayerConfig } from './AdvancedPlayerConfig';
import { useTournamentStore } from '../store/tournamentStore';
import { useSettingsStore } from '../store/settingsStore';
import { getOpeningCount } from '../engine/openings';
import { checkTtsHealth } from '../tts/tts-client';
import type { CommentatorMode, OutputFormat, PlayerConfig, PromptLevel, ReasoningEffort, ReasoningOrder, PlayerType } from '../engine/types';
import type { LLMProvider } from '../llm/client';

type AdvancedSlotConfig = Pick<
  PlayerConfig,
  'constraints'
  | 'advisor'
  | 'contextMode'
  | 'scratchpadConfig'
  | 'fogOfWar'
  | 'attacks'
  | 'transition'
  | 'graduatedResponse'
  | 'linePrediction'
  | 'evalAwareness'
>;

interface PlayerSlot extends AdvancedSlotConfig {
  id: string;
  model: string;
  name: string;
  type: PlayerType;
  stockfishElo: number;
  stockfishDepth: number;
  oracleMaxCorrections: number;
  reasoningEffort: ReasoningEffort;
  maxTokens: number;
}

function createSlot(overrides?: Partial<PlayerSlot>): PlayerSlot {
  return {
    id: String(nextId++),
    model: '',
    name: '',
    type: 'llm',
    stockfishElo: 2000,
    stockfishDepth: 18,
    oracleMaxCorrections: 2,
    reasoningEffort: 'high',
    maxTokens: 6000,
    ...overrides,
  };
}

interface CommentatorSlot {
  id: string;
  name: string;
  mode: CommentatorMode;
  reasoningEffort: ReasoningEffort;
  maxTokens: number;
  stockfishDepth: number;
}

const TOP_MODELS: Record<LLMProvider, { model: string; name: string }[]> = {
  openrouter: [
    { model: 'openai/gpt-5.4', name: 'GPT-5.4' },
    { model: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    { model: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
    { model: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
    { model: 'z-ai/glm-5', name: 'GLM-5' },
    { model: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2' },
    { model: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
    { model: 'minimax/minimax-m2.5', name: 'MiniMax M2.5' },
    { model: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5' },
    { model: 'qwen/qwen3.5-397b-a17b', name: 'Qwen 3.5 397B' },
    { model: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick' },
    { model: 'mistralai/mistral-large-2512', name: 'Mistral Large 2512' },
    { model: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview' },
    { model: 'google/gemini-3.1-flash-lite-preview:nitro', name: 'Gemini 3.1 Flash Lite (Nitro)' },
  ],
  openai: [
    { model: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    { model: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
    { model: 'codex-mini-latest', name: 'Codex Mini Latest' },
    { model: 'gpt-5.4', name: 'GPT-5.4' },
    { model: 'gpt-5.2', name: 'GPT-5.2' },
    { model: 'gpt-5.1', name: 'GPT-5.1' },
    { model: 'gpt-4.1', name: 'GPT-4.1' },
    { model: 'o4-mini', name: 'o4-mini' },
  ],
  codex: [
    { model: 'gpt-5.4', name: 'GPT-5.4' },
    { model: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    { model: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
    { model: 'gpt-5.2', name: 'GPT-5.2' },
  ],
  ollama: [
    { model: 'qwen3.5:4b', name: 'Qwen 3.5 4B' },
    { model: 'qwen3.5:35b-a3b', name: 'Qwen 3.5 35B (MoE)' },
    { model: 'qwen3.5:9b', name: 'Qwen 3.5 9B' },
    { model: 'llama4:scout', name: 'Llama 4 Scout' },
  ],
};

const PLAYER_TYPES: { value: PlayerType; label: string; desc: string }[] = [
  { value: 'llm', label: 'LLM', desc: 'Standard LLM player' },
  { value: 'stockfish_oracle', label: 'Oracle', desc: 'LLM + Stockfish correction loop' },
  { value: 'stockfish', label: 'Stockfish', desc: 'Pure engine at capped ELO' },
  { value: 'human', label: 'Human', desc: 'Type moves manually' },
];

const REASONING_EFFORTS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Max' },
];

const TOKEN_PRESETS = [2000, 4000, 6000, 8000, 12000, 16000, 24000, 32000, 64000, 96000, 128000];
const COMMENTATOR_TOKEN_PRESETS = [500, 1000, 2000, 4000, 8000, 12000, 16000];
const PUZZLE_BREAK_TOKEN_PRESETS = [500, 1000, 2000, 4000];
const COMMENTATOR_DEPTH_PRESETS = [8, 12, 15, 18, 20, 24];
const COMMENTATOR_MODES: { value: CommentatorMode; label: string }[] = [
  { value: 'llm', label: 'LLM' },
  { value: 'oracle', label: 'Oracle' },
];

let nextId = 0;

// Stockfish defender presets — ascending difficulty
const STOCKFISH_LADDER = [
  { elo: 1400, label: 'Novice' },
  { elo: 1600, label: 'Club' },
  { elo: 1800, label: 'Intermediate' },
  { elo: 2000, label: 'Strong Club' },
  { elo: 2200, label: 'Expert' },
  { elo: 2500, label: 'Master' },
  { elo: 2800, label: 'GM' },
  { elo: 3190, label: 'Maximum' },
];

const STOCKFISH_PRESETS = {
  beginner: [1320, 1400, 1500, 1600, 1700, 1800],
  intermediate: [1800, 1900, 2000, 2100, 2200, 2400],
  advanced: [2400, 2600, 2800, 3000, 3190],
  gauntlet: [1320, 1500, 1700, 1900, 2000, 2200, 2400, 2600, 2800, 3190],
};

export function TournamentSetup() {
  const apiKey = useSettingsStore(s => s.apiKey);
  const provider = useSettingsStore(s => s.provider);
  const ollamaBaseUrl = useSettingsStore(s => s.ollamaBaseUrl);
  const createTournament = useTournamentStore(s => s.createTournament);
  const startTournament = useTournamentStore(s => s.startTournament);
  const topModels = TOP_MODELS[provider];

  const [challenger, setChallenger] = useState<PlayerSlot>(createSlot());
  const [defenders, setDefenders] = useState<PlayerSlot[]>([createSlot()]);

  const selectPreset = (challengerModel: string) => {
    const chosen = topModels.find(m => m.model === challengerModel);
    if (!chosen) return;
    setChallenger(prev => ({ ...prev, model: chosen.model, name: chosen.name, type: 'llm' }));
    const others = topModels.filter(m => m.model !== challengerModel);
    setDefenders(others.map(m => createSlot({ model: m.model, name: m.name })));
  };

  const selectSpecialPreset = (type: 'stockfish' | 'human') => {
    if (type === 'stockfish') {
      setChallenger(prev => ({ ...prev, type: 'stockfish', model: 'stockfish', name: `Stockfish (${prev.stockfishElo} ELO)` }));
    } else {
      setChallenger(prev => ({ ...prev, type: 'human', model: 'human', name: 'Human' }));
    }
    setDefenders(topModels.map(m => createSlot({ model: m.model, name: m.name })));
  };

  const [temperature, setTemperature] = useState(0.7);
  const [maxRetries, setMaxRetries] = useState(3);
  const [promptLevel, setPromptLevel] = useState<PromptLevel>('p2');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('A');
  // Keep legacy reasoningOrder derived from outputFormat for backward compat
  const reasoningOrder: ReasoningOrder = outputFormat === 'B' ? 'act_first' : 'reason_first';
  const [commentator, setCommentator] = useState<CommentatorSlot>({
    id: '',
    name: '',
    mode: 'oracle',
    reasoningEffort: 'high',
    maxTokens: 1000,
    stockfishDepth: 18,
  });

  // TTS settings
  const ttsEnabled = useSettingsStore(s => s.ttsEnabled);
  const setTtsEnabled = useSettingsStore(s => s.setTtsEnabled);
  const ttsProvider = useSettingsStore(s => s.ttsProvider);
  const setTtsProvider = useSettingsStore(s => s.setTtsProvider);
  const ttsCloudApiKey = useSettingsStore(s => s.ttsCloudApiKey);
  const setTtsCloudApiKey = useSettingsStore(s => s.setTtsCloudApiKey);
  const ttsCloudVoice = useSettingsStore(s => s.ttsCloudVoice);
  const setTtsCloudVoice = useSettingsStore(s => s.setTtsCloudVoice);
  const ttsVoice = useSettingsStore(s => s.ttsVoice);
  const setTtsVoice = useSettingsStore(s => s.setTtsVoice);
  const ttsVolume = useSettingsStore(s => s.ttsVolume);
  const setTtsVolume = useSettingsStore(s => s.setTtsVolume);
  const ttsPort = useSettingsStore(s => s.ttsPort);
  const [ttsStatus, setTtsStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  // Filler / Stream Info settings
  const fillerEnabled = useSettingsStore(s => s.fillerEnabled);
  const setFillerEnabled = useSettingsStore(s => s.setFillerEnabled);
  const channelName = useSettingsStore(s => s.channelName);
  const setChannelName = useSettingsStore(s => s.setChannelName);
  const channelWebsite = useSettingsStore(s => s.channelWebsite);
  const setChannelWebsite = useSettingsStore(s => s.setChannelWebsite);
  const channelDonationUrl = useSettingsStore(s => s.channelDonationUrl);
  const setChannelDonationUrl = useSettingsStore(s => s.setChannelDonationUrl);
  const channelCustomPlugLines = useSettingsStore(s => s.channelCustomPlugLines);
  const setChannelCustomPlugLines = useSettingsStore(s => s.setChannelCustomPlugLines);
  // Puzzle Break settings
  const puzzleBreakEnabled = useSettingsStore(s => s.puzzleBreakEnabled);
  const setPuzzleBreakEnabled = useSettingsStore(s => s.setPuzzleBreakEnabled);
  const puzzleBreakThresholdMs = useSettingsStore(s => s.puzzleBreakThresholdMs);
  const setPuzzleBreakThresholdMs = useSettingsStore(s => s.setPuzzleBreakThresholdMs);
  const puzzleBreakModel = useSettingsStore(s => s.puzzleBreakModel);
  const setPuzzleBreakModel = useSettingsStore(s => s.setPuzzleBreakModel);
  const puzzleBreakReasoningEffort = useSettingsStore(s => s.puzzleBreakReasoningEffort);
  const setPuzzleBreakReasoningEffort = useSettingsStore(s => s.setPuzzleBreakReasoningEffort);
  const puzzleBreakMaxTokens = useSettingsStore(s => s.puzzleBreakMaxTokens);
  const setPuzzleBreakMaxTokens = useSettingsStore(s => s.setPuzzleBreakMaxTokens);

  useEffect(() => {
    if (!ttsEnabled) { setTtsStatus('unknown'); return; }
    if (ttsProvider === 'local') {
      void checkTtsHealth(ttsPort).then(s => setTtsStatus(s.running ? 'online' : 'offline'));
    } else {
      // Cloud: mark online if API key is set (actual validation happens on first synth)
      setTtsStatus(ttsCloudApiKey ? 'online' : 'offline');
    }
  }, [ttsEnabled, ttsProvider, ttsCloudApiKey, ttsPort]);

  const addDefender = (type: PlayerType = 'llm') => {
    if (defenders.length >= 10) return;
    const slot = type === 'stockfish'
      ? createSlot({ type: 'stockfish', model: 'stockfish', name: 'Stockfish (2000 ELO)' })
      : type === 'human'
        ? createSlot({ type: 'human', model: 'human', name: 'Human' })
        : createSlot({ type });
    setDefenders([...defenders, slot]);
  };

  const removeDefender = (id: string) => {
    if (defenders.length <= 1) return;
    setDefenders(defenders.filter(d => d.id !== id));
  };

  const updateDefender = (id: string, updates: Partial<PlayerSlot>) => {
    setDefenders(defenders.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const validDefenders = defenders.filter(d => {
    if (d.type === 'stockfish') return true;
    if (d.type === 'human') return true;
    return d.model && d.model !== challenger.model;
  });
  const hasAuth = provider === 'codex' || provider === 'ollama' || !!apiKey;
  const canStart = hasAuth && (challenger.model || challenger.type === 'human') && validDefenders.length > 0;

  const totalMatchups = validDefenders.length;
  const minGames = totalMatchups * 4;
  const maxGames = totalMatchups * 6;

  const handleStart = () => {
    if (!canStart) return;
    const buildPlayerConfig = (slot: PlayerSlot) => ({
      model: slot.model,
      displayName: slot.name,
      temperature,
      maxRetries,
      promptLevel,
      reasoningOrder,
      outputFormat,
      type: slot.type as PlayerType,
      maxTokens: slot.maxTokens,
      reasoningEffort: slot.reasoningEffort,
      constraints: slot.constraints,
      advisor: slot.advisor,
      contextMode: slot.contextMode,
      scratchpadConfig: slot.scratchpadConfig,
      fogOfWar: slot.fogOfWar,
      attacks: slot.attacks,
      transition: slot.transition,
      graduatedResponse: slot.graduatedResponse,
      linePrediction: slot.linePrediction,
      evalAwareness: slot.evalAwareness,
      ...(slot.type === 'stockfish' && { stockfishElo: slot.stockfishElo }),
      ...((slot.type === 'stockfish' || slot.type === 'stockfish_oracle') && { stockfishDepth: slot.stockfishDepth }),
      ...(slot.type === 'stockfish_oracle' && { oracleMaxCorrections: slot.oracleMaxCorrections }),
    });

    createTournament({
      challenger: buildPlayerConfig(challenger),
      defenders: validDefenders.map(buildPlayerConfig),
      temperature,
      maxRetries,
      promptLevel,
      reasoningOrder,
      commentatorModel: commentator.id
        ? {
            id: commentator.id,
            name: commentator.name,
            mode: commentator.mode,
            reasoningEffort: commentator.reasoningEffort,
            maxTokens: commentator.maxTokens,
            stockfishDepth: commentator.stockfishDepth,
          }
        : undefined,
    });
    startTournament({ provider, apiKey, ollamaBaseUrl });
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-bold text-text-primary mb-1">Gauntlet Tournament</h2>
        <p className="text-sm text-text-muted">
          One challenger faces up to 10 defenders in best-of-3 pair matchups. Manual start per game.
        </p>
      </div>

      {/* Quick Preset */}
      <Section title="Quick Select Challenger (vs all others)">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => selectSpecialPreset('stockfish')}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              challenger.type === 'stockfish'
                ? 'bg-green-600 text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-border'
            }`}
          >
            Stockfish
          </button>
          <button
            onClick={() => selectSpecialPreset('human')}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              challenger.type === 'human'
                ? 'bg-blue-600 text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-border'
            }`}
          >
            Human
          </button>
          <span className="text-text-muted self-center px-1">|</span>
          {topModels.map(m => (
            <button
              key={m.model}
              onClick={() => selectPreset(m.model)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                challenger.model === m.model && challenger.type === 'llm'
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-2">
          Pick a challenger — all {topModels.length} LLM models auto-fill as defenders.
        </p>
      </Section>

      {/* Challenger */}
      <Section title="Challenger">
        <PlayerSlotEditor
          slot={challenger}
          onChange={(updates) => setChallenger(prev => ({ ...prev, ...updates }))}
        />
      </Section>

      {/* Defenders */}
      <Section title={`Defenders (${defenders.length}/10)`}>
        {/* Stockfish Quick Challenge */}
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">Quick Challenge — fill defenders with Stockfish at preset levels:</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setDefenders(STOCKFISH_LADDER.map(sf =>
                createSlot({ type: 'stockfish', model: 'stockfish', name: `Stockfish (${sf.elo} ELO)`, stockfishElo: sf.elo })
              ))}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-border transition-colors"
            >
              Ladder (1400→3190)
            </button>
            <button
              onClick={() => setDefenders(STOCKFISH_PRESETS.beginner.map(elo =>
                createSlot({ type: 'stockfish', model: 'stockfish', name: `Stockfish (${elo} ELO)`, stockfishElo: elo })
              ))}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-green-900/30 text-green-300 hover:bg-green-900/50 border border-green-800/50 transition-colors"
            >
              Beginner (1320-1800)
            </button>
            <button
              onClick={() => setDefenders(STOCKFISH_PRESETS.intermediate.map(elo =>
                createSlot({ type: 'stockfish', model: 'stockfish', name: `Stockfish (${elo} ELO)`, stockfishElo: elo })
              ))}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50 border border-yellow-800/50 transition-colors"
            >
              Intermediate (1800-2400)
            </button>
            <button
              onClick={() => setDefenders(STOCKFISH_PRESETS.advanced.map(elo =>
                createSlot({ type: 'stockfish', model: 'stockfish', name: `Stockfish (${elo} ELO)`, stockfishElo: elo })
              ))}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-red-900/30 text-red-300 hover:bg-red-900/50 border border-red-800/50 transition-colors"
            >
              Advanced (2400-3190)
            </button>
            <button
              onClick={() => setDefenders(STOCKFISH_PRESETS.gauntlet.map(elo =>
                createSlot({ type: 'stockfish', model: 'stockfish', name: `Stockfish (${elo} ELO)`, stockfishElo: elo })
              ))}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 border border-purple-800/50 transition-colors"
            >
              Full Gauntlet (10 levels)
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {defenders.map((d) => (
            <div key={d.id} className="relative">
              <PlayerSlotEditor
                slot={d}
                onChange={(updates) => updateDefender(d.id, updates)}
              />
              {defenders.length > 1 && (
                <button
                  onClick={() => removeDefender(d.id)}
                  className="absolute top-0 right-0 px-2 py-1 text-text-muted hover:text-error text-xs transition-colors"
                  title="Remove"
                >
                  remove
                </button>
              )}
            </div>
          ))}
          {defenders.length < 10 && (
            <div className="flex gap-3">
              <button onClick={() => addDefender('llm')} className="text-sm text-purple-light hover:text-purple-accent transition-colors">
                + LLM
              </button>
              <button onClick={() => addDefender('stockfish_oracle')} className="text-sm text-purple-light hover:text-purple-accent transition-colors">
                + Oracle
              </button>
              <button onClick={() => addDefender('stockfish')} className="text-sm text-purple-light hover:text-purple-accent transition-colors">
                + Stockfish
              </button>
              <button onClick={() => addDefender('human')} className="text-sm text-purple-light hover:text-purple-accent transition-colors">
                + Human
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* Commentator */}
      <Section title="Commentator">
        <div className="flex gap-1 mb-2">
          {COMMENTATOR_MODES.map(mode => (
            <button
              key={mode.value}
              onClick={() => setCommentator(prev => ({ ...prev, mode: mode.value }))}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                commentator.mode === mode.value
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <ModelSelector
          label="Commentator Model (optional)"
          value={commentator.id}
          onChange={(id, name) => setCommentator(prev => ({ ...prev, id, name }))}
        />
        {commentator.id && (
          <div className="flex gap-3 items-center flex-wrap mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Reasoning:</span>
              <div className="flex gap-0.5">
                {REASONING_EFFORTS.map(re => (
                  <button
                    key={re.value}
                    onClick={() => setCommentator(prev => ({ ...prev, reasoningEffort: re.value }))}
                    className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                      commentator.reasoningEffort === re.value
                        ? 'bg-purple-accent/80 text-white'
                        : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {re.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Tokens:</span>
              <select
                value={commentator.maxTokens}
                onChange={(e) => setCommentator(prev => ({ ...prev, maxTokens: Number(e.target.value) }))}
                className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
              >
                {COMMENTATOR_TOKEN_PRESETS.map(t => (
                  <option key={t} value={t}>{t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t}</option>
                ))}
              </select>
            </div>
            {commentator.mode === 'oracle' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">Depth:</span>
                <select
                  value={commentator.stockfishDepth}
                  onChange={(e) => setCommentator(prev => ({ ...prev, stockfishDepth: Number(e.target.value) }))}
                  className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
                >
                  {COMMENTATOR_DEPTH_PRESETS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-text-muted mt-1">
          {commentator.mode === 'oracle'
            ? 'Oracle mode uses Stockfish evaluation to ground commentary after each move.'
            : 'LLM mode provides commentary from board state and move context only.'}
        </p>
        {/* TTS Narration */}
        {commentator.id && (
          <div className="mt-3 pt-3 border-t border-surface-2 space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  ttsEnabled
                    ? 'bg-purple-accent text-white'
                    : 'bg-surface-2 text-text-muted hover:text-text-primary'
                }`}
              >
                {ttsEnabled ? 'TTS ON' : 'TTS OFF'}
              </button>
              {ttsEnabled && (
                <>
                  <select
                    value={ttsProvider}
                    onChange={(e) => setTtsProvider(e.target.value as 'local' | 'qwen-cloud' | 'openai')}
                    className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
                  >
                    <option value="qwen-cloud">Qwen Cloud (~100ms)</option>
                    <option value="openai">OpenAI TTS (~300ms)</option>
                    <option value="local">Local Sidecar (~13s)</option>
                  </select>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">Vol:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(ttsVolume * 100)}
                      onChange={(e) => setTtsVolume(Number(e.target.value) / 100)}
                      className="w-16 h-1 accent-purple-accent"
                    />
                  </div>
                  {ttsStatus === 'online' && <span className="text-[10px] text-success">ready</span>}
                  {ttsStatus === 'offline' && <span className="text-[10px] text-warning">
                    {ttsProvider === 'local' ? 'server offline' : 'needs API key'}
                  </span>}
                </>
              )}
            </div>
            {ttsEnabled && ttsProvider !== 'local' && (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={ttsProvider === 'qwen-cloud' ? 'DashScope API Key (sk-...)' : 'OpenAI API Key (sk-...)'}
                  value={ttsCloudApiKey}
                  onChange={(e) => setTtsCloudApiKey(e.target.value)}
                  className="flex-1 bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border placeholder:text-text-muted"
                />
                <select
                  value={ttsCloudVoice}
                  onChange={(e) => setTtsCloudVoice(e.target.value)}
                  className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
                >
                  {ttsProvider === 'qwen-cloud' ? (
                    <>
                      <option value="Chelsie">Chelsie (F, Narrator)</option>
                      <option value="Cherry">Cherry (F, Warm)</option>
                      <option value="Serena">Serena (F, Calm)</option>
                      <option value="Ethan">Ethan (M, Deep)</option>
                      <option value="Aiden">Aiden (M, Narrator)</option>
                      <option value="River">River (M, Clear)</option>
                    </>
                  ) : (
                    <>
                      <option value="nova">Nova (Female)</option>
                      <option value="shimmer">Shimmer (F, Warm)</option>
                      <option value="alloy">Alloy (Neutral)</option>
                      <option value="echo">Echo (Male)</option>
                      <option value="fable">Fable (M, British)</option>
                      <option value="onyx">Onyx (M, Deep)</option>
                    </>
                  )}
                </select>
              </div>
            )}
            {ttsEnabled && ttsProvider === 'local' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Voice:</span>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
                >
                  <option value="Ryan">Ryan (Male)</option>
                  <option value="Vivian">Vivian (Female)</option>
                  <option value="Aria">Aria (Female)</option>
                  <option value="Ethan">Ethan (Male)</option>
                  <option value="Luna">Luna (Female)</option>
                  <option value="Leo">Leo (Male)</option>
                </select>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Filler / Stream Info */}
      <Section title="Dead Air Filler">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted">Generate filler commentary during long thinking pauses</span>
          <button
            type="button"
            onClick={() => setFillerEnabled(!fillerEnabled)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              fillerEnabled ? 'bg-purple-accent/20 text-purple-light' : 'bg-surface-2 text-text-muted hover:text-text-primary'
            }`}
          >
            {fillerEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted w-24 flex-shrink-0">Channel name</span>
            <input
              type="text"
              value={channelName}
              onChange={e => setChannelName(e.target.value)}
              placeholder="e.g. LLM Chess Arena"
              className="flex-1 px-2 py-1 rounded bg-surface-2 border border-surface-3 text-xs text-text-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted w-24 flex-shrink-0">Website</span>
            <input
              type="text"
              value={channelWebsite}
              onChange={e => setChannelWebsite(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-2 py-1 rounded bg-surface-2 border border-surface-3 text-xs text-text-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted w-24 flex-shrink-0">Donation URL</span>
            <input
              type="text"
              value={channelDonationUrl}
              onChange={e => setChannelDonationUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-2 py-1 rounded bg-surface-2 border border-surface-3 text-xs text-text-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-text-muted">Custom plug lines (one per line)</span>
            <textarea
              value={channelCustomPlugLines}
              onChange={e => setChannelCustomPlugLines(e.target.value)}
              placeholder={"Join our Discord!\nNew match every hour"}
              rows={3}
              className="w-full px-2 py-1 rounded bg-surface-2 border border-surface-3 text-xs text-text-primary resize-none"
            />
          </div>
          <p className="text-[10px] text-text-muted">Channel info is woven into commentary during natural pauses and channel plugs. Filler fires after 10+ second thinking pauses.</p>
        </div>
      </Section>

      {/* Puzzle Break */}
      <Section title="Puzzle Break">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted">Show a live chess puzzle when an LLM thinks too long</span>
          <button
            type="button"
            onClick={() => setPuzzleBreakEnabled(!puzzleBreakEnabled)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              puzzleBreakEnabled ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-2 text-text-muted hover:text-text-primary'
            }`}
          >
            {puzzleBreakEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {puzzleBreakEnabled && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-muted w-20">Threshold</span>
              <input
                type="number"
                min={5}
                max={300}
                step={5}
                value={puzzleBreakThresholdMs / 1000}
                onChange={e => setPuzzleBreakThresholdMs(Number(e.target.value) * 1000)}
                className="w-16 px-2 py-0.5 rounded bg-surface-2 border border-surface-3 text-xs text-text-primary"
              />
              <span className="text-[11px] text-text-muted">seconds</span>
            </div>
            <ModelSelector
              label="Puzzle model"
              value={puzzleBreakModel}
              onChange={(id) => setPuzzleBreakModel(id)}
            />
            {puzzleBreakModel && (
              <div className="flex gap-3 items-center flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-muted">Reasoning:</span>
                  <div className="flex gap-0.5">
                    {REASONING_EFFORTS.map(re => (
                      <button
                        key={re.value}
                        type="button"
                        onClick={() => setPuzzleBreakReasoningEffort(re.value)}
                        className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                          puzzleBreakReasoningEffort === re.value
                            ? 'bg-amber-500/30 text-amber-300'
                            : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        {re.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-muted">Tokens:</span>
                  <select
                    value={puzzleBreakMaxTokens}
                    onChange={e => setPuzzleBreakMaxTokens(Number(e.target.value))}
                    className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
                  >
                    {PUZZLE_BREAK_TOKEN_PRESETS.map(t => (
                      <option key={t} value={t}>{t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <p className="text-[10px] text-text-muted">Requires Livestream mode. Uses the same provider as the main game. Puzzle fetched from Lichess.org (falls back to offline puzzles).</p>
          </div>
        )}
      </Section>

      {/* Prompt Level (P0-P6) */}
      <Section title="Prompt Level">
        <div className="flex gap-1">
          {([
            { value: 'p0' as const, label: 'P0', desc: 'Bare minimum (~15 tokens)' },
            { value: 'p1' as const, label: 'P1', desc: 'Goal + format (~80 tokens)' },
            { value: 'p2' as const, label: 'P2', desc: 'Role + strategy (~200 tokens)' },
            { value: 'p3' as const, label: 'P3', desc: 'Phase-aware (~500 tokens)' },
            { value: 'p4' as const, label: 'P4', desc: 'Metacognitive (~900 tokens)' },
            { value: 'p5' as const, label: 'P5', desc: 'Calibrated (~1400 tokens)' },
            { value: 'p6' as const, label: 'P6', desc: 'Full engineering (~2500 tokens)' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setPromptLevel(opt.value)}
              title={opt.desc}
              className={`flex-1 px-2 py-2 rounded text-sm font-medium transition-colors ${
                promptLevel === opt.value
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-1">
          {promptLevel === 'p0' ? 'Bare minimum: "Play chess." No format instruction.' :
           promptLevel === 'p1' ? 'Goal + JSON format. Minimal guidance.' :
           promptLevel === 'p2' ? 'Chess role + basic strategy. Standard prompt.' :
           promptLevel === 'p3' ? 'Phase-aware strategy (opening/middlegame/endgame).' :
           promptLevel === 'p4' ? 'Metacognitive protocol + known failure patterns. Legal moves shown.' :
           promptLevel === 'p5' ? 'Confidence calibration + resource awareness. Extended JSON output.' :
           'Full behavioral engineering: opponent modeling, tactical overrides, LLM failure guards.'}
        </p>
      </Section>

      {/* Output Format (A-F) */}
      <Section title="Output Format">
        <div className="flex gap-1">
          {([
            { value: 'A' as const, label: 'A', desc: 'Reason → Move (1 call)' },
            { value: 'B' as const, label: 'B', desc: 'Move → Reason (1 call)' },
            { value: 'C' as const, label: 'C', desc: 'Move → Reason → Revise (1 call)' },
            { value: 'D' as const, label: 'D', desc: 'Move → Reason → Advisor → Revise (2 calls)' },
            { value: 'E' as const, label: 'E', desc: 'Reason → Move → Advisor → Revise (2 calls)' },
            { value: 'F' as const, label: 'F', desc: 'Reason → Advisor → Move (2 calls)' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setOutputFormat(opt.value)}
              title={opt.desc}
              className={`flex-1 px-2 py-2 rounded text-sm font-medium transition-colors ${
                outputFormat === opt.value
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-1">
          {outputFormat === 'A' ? 'Reason first, then commit. Standard chain-of-thought.' :
           outputFormat === 'B' ? 'Commit first, then justify. Tests intuition vs deliberation.' :
           outputFormat === 'C' ? 'Move → Reason → optional self-revision. Single call with revision fields.' :
           outputFormat === 'D' ? 'Move → Reason → Stockfish advisor injection → Revise. 2 API calls per turn.' :
           outputFormat === 'E' ? 'Reason → Move → Stockfish advisor injection → Revise. 2 API calls per turn.' :
           'Reason → Stockfish advisor injection → Final move. 2 API calls per turn.'}
        </p>
        {['D', 'E', 'F'].includes(outputFormat) && (
          <p className="text-xs text-yellow-300/80 mt-1">
            Formats D-F use 2 API calls per turn (Stockfish advisor injected between calls). Higher cost but measures advice integration.
          </p>
        )}
      </Section>

      {/* Settings */}
      <Section title="Settings">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Temperature: {temperature}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-purple-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Max Retries: {maxRetries}</label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              className="w-full accent-purple-accent"
            />
          </div>
        </div>
      </Section>

      {/* Info */}
      <div className="bg-surface-2/50 rounded-lg p-4 text-sm text-text-secondary">
        <div className="grid grid-cols-2 gap-2">
          <div>Matchups: <span className="text-text-primary font-medium">{totalMatchups}</span></div>
          <div>Games: <span className="text-text-primary font-medium">{minGames}-{maxGames}</span></div>
          <div>Opening book: <span className="text-text-primary font-medium">{getOpeningCount()} UHO positions</span></div>
          <div>Format: <span className="text-text-primary font-medium">Best of 3 pairs</span></div>
          <div>Prompt: <span className="text-text-primary font-medium uppercase">{promptLevel}</span></div>
          <div>Format: <span className="text-text-primary font-medium">{outputFormat}</span></div>
          <div>Commentary: <span className="text-text-primary font-medium">{commentator.id ? commentator.name.split('/').pop() : 'Off'}</span></div>
        </div>
        <div className="mt-3 text-xs text-text-muted">
          All pairs use random UHO openings (unique per pair). Pair 3 is tiebreaker (if needed).
          Each game starts manually. Stockfish eval + commentary after every move.
        </div>
      </div>

      {/* Start */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
          canStart
            ? 'bg-purple-accent text-white hover:bg-purple-accent/80'
            : 'bg-surface-2 text-text-muted cursor-not-allowed'
        }`}
      >
        {!hasAuth
          ? (provider === 'openai' ? 'Set OpenAI auth first' : 'Enter API key first')
          : !(challenger.model || challenger.type === 'human')
            ? 'Select challenger'
            : validDefenders.length === 0
              ? 'Add at least one defender'
              : `Start Gauntlet (${totalMatchups} matchups)`}
      </button>
    </div>
  );
}

// --- Per-player slot editor (used for both challenger and defenders) ---

function PlayerSlotEditor({ slot, onChange }: {
  slot: PlayerSlot;
  onChange: (updates: Partial<PlayerSlot>) => void;
}) {
  const needsModel = slot.type === 'llm' || slot.type === 'stockfish_oracle';
  const needsReasoning = slot.type === 'llm' || slot.type === 'stockfish_oracle';
  const needsTokens = slot.type === 'llm' || slot.type === 'stockfish_oracle';

  const handleTypeChange = (type: PlayerType) => {
    const updates: Partial<PlayerSlot> = { type };
    if (type === 'stockfish') {
      updates.model = 'stockfish';
      updates.name = `Stockfish (${slot.stockfishElo} ELO)`;
    } else if (type === 'human') {
      updates.model = 'human';
      updates.name = 'Human';
    } else if ((slot.type === 'stockfish' || slot.type === 'human') && (type === 'llm' || type === 'stockfish_oracle')) {
      updates.model = '';
      updates.name = '';
    }
    onChange(updates);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Type selector */}
      <div className="flex gap-1">
        {PLAYER_TYPES.map(pt => (
          <button
            key={pt.value}
            onClick={() => handleTypeChange(pt.value)}
            title={pt.desc}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              slot.type === pt.value
                ? 'bg-purple-accent text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {pt.label}
          </button>
        ))}
      </div>

      {/* Model selector (LLM / Oracle) */}
      {needsModel && (
        <ModelSelector
          label=""
          value={slot.model}
          onChange={(id, name) => onChange({ model: id, name })}
        />
      )}

      {/* Stockfish ELO slider */}
      {slot.type === 'stockfish' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">ELO: {slot.stockfishElo}</span>
          </div>
          <input
            type="range"
            min="1320"
            max="3190"
            step="10"
            value={slot.stockfishElo}
            onChange={(e) => onChange({
              stockfishElo: Number(e.target.value),
              name: `Stockfish (${e.target.value} ELO)`,
            })}
            className="w-full accent-purple-accent"
          />
          <div className="flex justify-between text-xs text-text-muted">
            <span>1320</span><span>2000</span><span>3190</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Depth:</span>
            <select
              value={slot.stockfishDepth}
              onChange={(e) => onChange({ stockfishDepth: Number(e.target.value) })}
              className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
            >
              {[8, 12, 15, 18, 20, 24].map((depth) => (
                <option key={depth} value={depth}>{depth}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Human label */}
      {slot.type === 'human' && (
        <p className="text-xs text-text-muted">Human player — type moves via SAN notation form during gameplay.</p>
      )}

      {/* Inline settings row: reasoning effort + token budget + oracle corrections */}
      {(needsReasoning || needsTokens) && (
        <div className="flex gap-3 items-center flex-wrap">
          {/* Reasoning effort */}
          {needsReasoning && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Reasoning:</span>
              <div className="flex gap-0.5">
                {REASONING_EFFORTS.map(re => (
                  <button
                    key={re.value}
                    onClick={() => onChange({ reasoningEffort: re.value })}
                    className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                      slot.reasoningEffort === re.value
                        ? 'bg-purple-accent/80 text-white'
                        : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {re.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Token budget */}
          {needsTokens && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Tokens:</span>
              <select
                value={slot.maxTokens}
                onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
                className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
              >
                {TOKEN_PRESETS.map(t => (
                  <option key={t} value={t}>{t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Oracle corrections */}
          {slot.type === 'stockfish_oracle' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Corrections:</span>
              <select
                value={slot.oracleMaxCorrections}
                onChange={(e) => onChange({ oracleMaxCorrections: Number(e.target.value) })}
                className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </div>
          )}

          {/* Engine depth (oracle + stockfish) */}
          {(slot.type === 'stockfish_oracle' || slot.type === 'stockfish') && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Depth:</span>
              <select
                value={slot.stockfishDepth}
                onChange={(e) => onChange({ stockfishDepth: Number(e.target.value) })}
                className="bg-surface-2 text-text-primary text-xs rounded px-2 py-1 border border-border"
              >
                {[8, 12, 15, 18, 20, 24].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {(slot.type === 'llm' || slot.type === 'stockfish_oracle') && (
        <AdvancedPlayerConfig
          constraints={slot.constraints}
          advisor={slot.advisor}
          contextMode={slot.contextMode}
          scratchpadConfig={slot.scratchpadConfig}
          fogOfWar={slot.fogOfWar}
          attacks={slot.attacks}
          transition={slot.transition}
          graduatedResponse={slot.graduatedResponse}
          linePrediction={slot.linePrediction}
          evalAwareness={slot.evalAwareness}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-1 rounded-lg p-4">
      {title && <h3 className="text-sm font-semibold text-text-secondary mb-3">{title}</h3>}
      {children}
    </div>
  );
}
