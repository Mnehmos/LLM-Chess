import { useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { useBenchmarkStore } from '../store/benchmarkStore';
import { ModelSelector } from './ModelSelector';
import { AdvancedPlayerConfig } from './AdvancedPlayerConfig';
import type {
  CommentatorMode,
  OutputFormat,
  PlayerConfig,
  PromptLevel,
  PlayerType,
  ReasoningEffort,
  ReasoningOrder,
} from '../engine/types';

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
  model: string;
  name: string;
  type: PlayerType;
  stockfishElo: number;
  stockfishDepth: number;
  oracleMaxCorrections: number;
  reasoningEffort: ReasoningEffort;
  maxTokens: number;
}

const DEFAULT_SLOT: PlayerSlot = {
  model: '', name: '', type: 'llm',
  stockfishElo: 2000, stockfishDepth: 12, oracleMaxCorrections: 2,
  reasoningEffort: 'high', maxTokens: 6000,
};

const PLAYER_TYPES: { value: PlayerType; label: string }[] = [
  { value: 'llm', label: 'LLM' },
  { value: 'stockfish_oracle', label: 'Oracle' },
  { value: 'stockfish', label: 'Stockfish' },
  { value: 'human', label: 'Human' },
];

const REASONING_EFFORTS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Max' },
];

const TOKEN_PRESETS = [2000, 4000, 6000, 8000, 12000, 16000, 24000, 32000, 64000, 96000, 128000];
const COMMENTATOR_TOKEN_PRESETS = [500, 1000, 2000, 4000];
const COMMENTATOR_DEPTH_PRESETS = [8, 12, 15, 18, 20, 24];

const COMMENTATOR_MODES: { value: CommentatorMode; label: string }[] = [
  { value: 'llm', label: 'LLM' },
  { value: 'oracle', label: 'Oracle' },
];

export function GameControls() {
  const { isRunning, isPaused, gameState, startGame, pauseGame, resumeGame, abortGame, commentatorModel, setCommentatorModel } = useGameStore();
  const { apiKey, provider, ollamaBaseUrl, defaultTemperature, defaultMaxRetries } = useSettingsStore();
  const recordGame = useBenchmarkStore(s => s.recordGame);

  const [white, setWhite] = useState<PlayerSlot>({ ...DEFAULT_SLOT });
  const [black, setBlack] = useState<PlayerSlot>({ ...DEFAULT_SLOT });
  const [temperature, setTemperature] = useState(defaultTemperature);
  const [maxRetries, setMaxRetries] = useState(defaultMaxRetries);
  const [promptLevel, setPromptLevel] = useState<PromptLevel>('p2');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('A');
  const reasoningOrder: ReasoningOrder = outputFormat === 'B' ? 'act_first' : 'reason_first';
  const isWhiteReady = white.type === 'human' || white.type === 'stockfish' || white.model;
  const isBlackReady = black.type === 'human' || black.type === 'stockfish' || black.model;
  const hasAuth = provider === 'codex' || provider === 'ollama' || !!apiKey;
  const canStart = !isRunning && isWhiteReady && isBlackReady && hasAuth;

  const handleStart = useCallback(() => {
    if (!isWhiteReady || !isBlackReady || !hasAuth) return;
    const buildPlayer = (slot: PlayerSlot) => ({
      model: slot.model,
      displayName: slot.name || slot.type,
      temperature,
      maxRetries,
      promptLevel,
      reasoningOrder,
      outputFormat,
      type: slot.type,
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
      ...(slot.type === 'stockfish' && { stockfishElo: slot.stockfishElo, stockfishDepth: slot.stockfishDepth }),
      ...(slot.type === 'stockfish_oracle' && { stockfishDepth: slot.stockfishDepth, oracleMaxCorrections: slot.oracleMaxCorrections }),
    });

    startGame(
      buildPlayer(white),
      buildPlayer(black),
      { provider, apiKey, ollamaBaseUrl },
    );
  }, [white, black, isWhiteReady, isBlackReady, hasAuth, apiKey, provider, ollamaBaseUrl, temperature, maxRetries, promptLevel, reasoningOrder, outputFormat, startGame]);

  const handleAbort = useCallback(() => {
    abortGame('User aborted');
    if (gameState) {
      recordGame(gameState, {
        source: 'single_game',
        matchStructure: 'single',
        commentatorModel,
      });
    }
  }, [abortGame, commentatorModel, gameState, recordGame]);

  const commentatorMode: CommentatorMode = commentatorModel.mode ?? 'oracle';
  const commentatorDepth = commentatorModel.stockfishDepth ?? 18;
  const commentatorTokens = commentatorModel.maxTokens ?? 1000;
  const commentatorReasoning = commentatorModel.reasoningEffort ?? 'high';

  const patchCommentatorModel = (updates: Partial<typeof commentatorModel>) => {
    setCommentatorModel({ ...commentatorModel, ...updates });
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-surface-1 rounded-lg">
      <h2 className="text-lg font-semibold text-text-primary">Match Setup</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* White */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-text-muted font-medium uppercase tracking-wide">White</label>
          <PlayerSlotEditor slot={white} onChange={(u) => setWhite(prev => ({ ...prev, ...u }))} disabled={isRunning} />
        </div>

        {/* Black */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-text-muted font-medium uppercase tracking-wide">Black</label>
          <PlayerSlotEditor slot={black} onChange={(u) => setBlack(prev => ({ ...prev, ...u }))} disabled={isRunning} />
        </div>

        {/* Commentator */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-text-muted font-medium uppercase tracking-wide">Commentator</label>
          <div className="flex gap-0.5">
            {COMMENTATOR_MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => patchCommentatorModel({ mode: mode.value })}
                disabled={isRunning}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  commentatorMode === mode.value
                    ? 'bg-purple-accent text-white'
                    : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                } disabled:opacity-50`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <ModelSelector
            label=""
            value={commentatorModel.id}
            onChange={(id, name) => patchCommentatorModel({ id, name })}
          />
          {commentatorModel.id && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">Rsn:</span>
                {REASONING_EFFORTS.map(re => (
                  <button key={re.value} disabled={isRunning}
                    onClick={() => patchCommentatorModel({ reasoningEffort: re.value })}
                    className={`px-1 py-0.5 rounded text-xs transition-colors ${
                      commentatorReasoning === re.value
                        ? 'bg-purple-accent/80 text-white' : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                    } disabled:opacity-50`}
                  >{re.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-text-muted">Tokens:</span>
                <select value={commentatorTokens} disabled={isRunning}
                  onChange={(e) => patchCommentatorModel({ maxTokens: Number(e.target.value) })}
                  className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border disabled:opacity-50"
                >
                  {COMMENTATOR_TOKEN_PRESETS.map(t => <option key={t} value={t}>{t < 1000 ? t : `${(t/1000).toFixed(0)}k`}</option>)}
                </select>

                {commentatorMode === 'oracle' && (
                  <>
                    <span className="text-xs text-text-muted ml-1">Depth:</span>
                    <select value={commentatorDepth} disabled={isRunning}
                      onChange={(e) => patchCommentatorModel({ stockfishDepth: Number(e.target.value) })}
                      className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border disabled:opacity-50"
                    >
                      {COMMENTATOR_DEPTH_PRESETS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompt Level */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-muted font-medium uppercase tracking-wide">
          Prompt Level
        </label>
        <div className="flex gap-1 flex-wrap">
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
              disabled={isRunning}
              title={opt.desc}
              className={`flex-1 min-w-[52px] px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                promptLevel === opt.value
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              } disabled:opacity-50`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          {promptLevel === 'p0' ? 'Bare minimum prompt.' :
           promptLevel === 'p1' ? 'Goal + JSON format only.' :
           promptLevel === 'p2' ? 'Standard role + strategy prompt.' :
           promptLevel === 'p3' ? 'Phase-aware strategic prompt.' :
           promptLevel === 'p4' ? 'Metacognitive protocol + failure guards.' :
           promptLevel === 'p5' ? 'Adds confidence and plan calibration.' :
           'Full behavioral engineering prompt.'}
        </p>
      </div>

      {/* Output Format */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-muted font-medium uppercase tracking-wide">
          Output Format
        </label>
        <div className="flex gap-1">
          {([
            { value: 'A' as const, label: 'A', desc: 'Reason → Move' },
            { value: 'B' as const, label: 'B', desc: 'Move → Reason' },
            { value: 'C' as const, label: 'C', desc: 'Move → Reason → Revise' },
            { value: 'D' as const, label: 'D', desc: 'Move → Reason → Advisor → Revise' },
            { value: 'E' as const, label: 'E', desc: 'Reason → Move → Advisor → Revise' },
            { value: 'F' as const, label: 'F', desc: 'Reason → Advisor → Move' },
          ]).map(opt => (
            <button
              key={opt.value}
              onClick={() => setOutputFormat(opt.value)}
              disabled={isRunning}
              title={opt.desc}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                outputFormat === opt.value
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              } disabled:opacity-50`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          {outputFormat === 'A' ? 'Reason first, then move.' :
           outputFormat === 'B' ? 'Move first, then justification.' :
           outputFormat === 'C' ? 'Single-call self revision.' :
           outputFormat === 'D' ? 'Post-commit advisor revision.' :
           outputFormat === 'E' ? 'Reason, commit, then advisor revision.' :
           'Advisor enters before final move choice.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted font-medium uppercase tracking-wide">
            Temperature: {temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="accent-purple-accent"
            disabled={isRunning}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted font-medium uppercase tracking-wide">
            Max Retries: {maxRetries}
          </label>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            value={maxRetries}
            onChange={(e) => setMaxRetries(parseInt(e.target.value))}
            className="accent-purple-accent"
            disabled={isRunning}
          />
        </div>
      </div>

      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="flex-1 px-4 py-2 bg-purple-accent hover:bg-purple-hover text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Start Game
          </button>
        ) : (
          <>
            <button
              onClick={isPaused ? resumeGame : pauseGame}
              className="flex-1 px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text-primary rounded font-medium transition-colors"
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={handleAbort}
              className="px-4 py-2 bg-error/20 hover:bg-error/30 text-error rounded font-medium transition-colors"
            >
              Abort
            </button>
          </>
        )}
      </div>

      {!hasAuth && (
        <p className="text-xs text-warning">
          {provider === 'openai'
            ? 'Set OpenAI auth above (Codex subscription bridge or API key) to start'
            : 'Set your OpenRouter API key above to start'}
        </p>
      )}
    </div>
  );
}

function PlayerSlotEditor({ slot, onChange, disabled }: {
  slot: PlayerSlot;
  onChange: (updates: Partial<PlayerSlot>) => void;
  disabled?: boolean;
}) {
  const needsModel = slot.type === 'llm' || slot.type === 'stockfish_oracle';
  const needsSettings = slot.type === 'llm' || slot.type === 'stockfish_oracle';

  const handleTypeChange = (type: PlayerType) => {
    if (disabled) return;
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
    <div className="flex flex-col gap-1.5">
      {/* Type pills */}
      <div className="flex gap-0.5">
        {PLAYER_TYPES.map(pt => (
          <button
            key={pt.value}
            onClick={() => handleTypeChange(pt.value)}
            disabled={disabled}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              slot.type === pt.value
                ? 'bg-purple-accent text-white'
                : 'bg-surface-2 text-text-muted hover:text-text-secondary'
            } disabled:opacity-50`}
          >
            {pt.label}
          </button>
        ))}
      </div>

      {/* Model selector */}
      {needsModel && (
        <ModelSelector
          label=""
          value={slot.model}
          onChange={(id, name) => onChange({ model: id, name })}
        />
      )}

      {/* Stockfish ELO */}
      {slot.type === 'stockfish' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">ELO:</span>
            <input
              type="range" min="1320" max="3190" step="10"
              value={slot.stockfishElo} disabled={disabled}
              onChange={(e) => onChange({ stockfishElo: Number(e.target.value), name: `Stockfish (${e.target.value} ELO)` })}
              className="flex-1 accent-purple-accent"
            />
            <span className="text-xs text-text-primary w-8 text-right">{slot.stockfishElo}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Depth:</span>
            <select value={slot.stockfishDepth} disabled={disabled}
              onChange={(e) => onChange({ stockfishDepth: Number(e.target.value) })}
              className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border disabled:opacity-50"
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
        <p className="text-xs text-text-muted">Type moves via notation form.</p>
      )}

      {/* Reasoning + Tokens */}
      {needsSettings && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted">Rsn:</span>
            {REASONING_EFFORTS.map(re => (
              <button key={re.value} disabled={disabled}
                onClick={() => onChange({ reasoningEffort: re.value })}
                className={`px-1 py-0.5 rounded text-xs transition-colors ${
                  slot.reasoningEffort === re.value
                    ? 'bg-purple-accent/80 text-white' : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                } disabled:opacity-50`}
              >{re.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Tokens:</span>
            <select value={slot.maxTokens} disabled={disabled}
              onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
              className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border disabled:opacity-50"
            >
              {TOKEN_PRESETS.map(t => <option key={t} value={t}>{t >= 1000 ? `${(t/1000).toFixed(0)}k` : t}</option>)}
            </select>
            {slot.type === 'stockfish_oracle' && (
              <>
                <span className="text-xs text-text-muted ml-1">Corr:</span>
                <select value={slot.oracleMaxCorrections} disabled={disabled}
                  onChange={(e) => onChange({ oracleMaxCorrections: Number(e.target.value) })}
                  className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border disabled:opacity-50"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </>
            )}
            {(slot.type === 'stockfish' || slot.type === 'stockfish_oracle') && (
              <>
                <span className="text-xs text-text-muted ml-1">Depth:</span>
                <select value={slot.stockfishDepth} disabled={disabled}
                  onChange={(e) => onChange({ stockfishDepth: Number(e.target.value) })}
                  className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border disabled:opacity-50"
                >
                  {[8, 12, 15, 18, 20, 24].map((depth) => (
                    <option key={depth} value={depth}>{depth}</option>
                  ))}
                </select>
              </>
            )}
          </div>
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
          disabled={disabled}
        />
      )}
    </div>
  );
}
