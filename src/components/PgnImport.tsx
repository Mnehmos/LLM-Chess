import { useState, useCallback, useEffect, useRef } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { useSettingsStore } from '../store/settingsStore';
import { ModelSelector } from './ModelSelector';
import { parseSinglePgn, type PgnGame } from '../pgn/parser';
import { checkTtsHealth } from '../tts/tts-client';
import type { CommentaryVerbosity, CommentatorMode, ReasoningEffort } from '../engine/types';

const COMMENTATOR_MODES: { value: CommentatorMode; label: string }[] = [
  { value: 'llm', label: 'LLM' },
  { value: 'oracle', label: 'Oracle' },
];

const REASONING_EFFORTS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Max' },
];

const COMMENTATOR_DEPTH_PRESETS = [8, 12, 15, 18, 20, 24];

// Replay has no dead-air constraint — offer a much higher ceiling than live games.
const REPLAY_TOKEN_PRESETS = [1000, 2000, 4000, 8000, 16000, 32000, 64000];

const VERBOSITY_LEVELS: { value: CommentaryVerbosity; label: string; desc: string }[] = [
  { value: 'brief', label: 'Brief', desc: '1-2 sentences, just the key idea' },
  { value: 'standard', label: 'Standard', desc: '3-5 sentences, balanced' },
  { value: 'detailed', label: 'Detailed', desc: '6-10 sentences, deep analysis' },
  { value: 'deep', label: 'Deep Dive', desc: '10+ sentences, masterclass' },
];

export function PgnImport() {
  const [pgnText, setPgnText] = useState('');
  const [historicalContext, setHistoricalContext] = useState('');
  const [startFromMove, setStartFromMove] = useState(1);
  const startFromMoveRef = useRef(startFromMove);
  // Keep ref in sync with state so handleStart always reads the latest value
  startFromMoveRef.current = startFromMove;
  const [preview, setPreview] = useState<PgnGame | null>(null);
  const [parseError, setParseError] = useState('');

  const startReplay = useTournamentStore(s => s.startReplay);
  const replayMode = useTournamentStore(s => s.replayMode);
  const isRunning = useTournamentStore(s => s.isRunning);
  const stopReplay = useTournamentStore(s => s.stopReplay);
  const replayCommentatorModel = useTournamentStore(s => s.replayCommentatorModel);
  const setReplayCommentatorModel = useTournamentStore(s => s.setReplayCommentatorModel);

  const commentatorMode: CommentatorMode = replayCommentatorModel?.mode ?? 'oracle';
  const commentatorDepth = replayCommentatorModel?.stockfishDepth ?? 18;
  const commentatorReasoning = replayCommentatorModel?.reasoningEffort ?? 'high';
  const commentatorVerbosity: CommentaryVerbosity = replayCommentatorModel?.verbosity ?? 'standard';
  const commentatorTokens = replayCommentatorModel?.maxTokens ?? 16000;

  // TTS settings (global, same store as tournament)
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

  useEffect(() => {
    if (!ttsEnabled) { setTtsStatus('unknown'); return; }
    if (ttsProvider === 'local') {
      void checkTtsHealth(ttsPort).then(s => setTtsStatus(s.running ? 'online' : 'offline'));
    } else {
      setTtsStatus(ttsCloudApiKey ? 'online' : 'offline');
    }
  }, [ttsEnabled, ttsProvider, ttsCloudApiKey, ttsPort]);

  const patchCommentator = useCallback((updates: Record<string, unknown>) => {
    setReplayCommentatorModel({
      ...(replayCommentatorModel || {
        id: '', name: '',
        mode: 'oracle' as const,
        reasoningEffort: 'high' as const,
        maxTokens: 16000,
        stockfishDepth: 18,
      }),
      ...updates,
    });
  }, [replayCommentatorModel, setReplayCommentatorModel]);

  const handleParse = useCallback(() => {
    setParseError('');
    setPreview(null);
    if (!pgnText.trim()) return;
    try {
      const game = parseSinglePgn(pgnText);
      setPreview(game);
      setStartFromMove(1);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse PGN');
    }
  }, [pgnText]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setPgnText(text);
      // Auto-parse
      try {
        setParseError('');
        setPreview(parseSinglePgn(text));
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse PGN');
        setPreview(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleStart = useCallback(() => {
    if (!pgnText.trim()) return;
    // Use ref to always read latest startFromMove — immune to stale closure
    const current = startFromMoveRef.current;
    const startFromPly = current > 1 ? (current - 1) * 2 : 0;
    console.log('[PgnImport] handleStart: startFromMove =', current, '→ startFromPly =', startFromPly);
    startReplay(pgnText, { historicalContext: historicalContext || undefined, moveDelayMs: 0, startFromPly });
  }, [pgnText, historicalContext, startReplay]);

  // If replay is running, show stop controls
  if (replayMode && isRunning) {
    return (
      <div className="bg-surface-1 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-purple-light">Replay In Progress</h3>
          <button
            type="button"
            onClick={stopReplay}
            className="px-3 py-1.5 bg-error/20 text-error hover:bg-error/30 rounded text-xs font-medium transition-colors"
          >
            Stop Replay
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-1 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-secondary">Replay PGN</h3>
        <label className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text-secondary rounded text-xs font-medium cursor-pointer transition-colors">
          Upload .pgn
          <input
            type="file"
            accept=".pgn,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* PGN textarea */}
      <textarea
        value={pgnText}
        onChange={(e) => setPgnText(e.target.value)}
        onBlur={handleParse}
        placeholder={'Paste PGN here...\n\n[Event "World Championship 1972"]\n[White "Boris Spassky"]\n[Black "Bobby Fischer"]\n[Result "0-1"]\n\n1. c4 Nf6 2. Nc3 e6 ...'}
        className="w-full h-32 px-3 py-2 bg-surface-0 border border-border rounded text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-purple-accent resize-y"
        spellCheck={false}
      />

      {parseError && (
        <p className="text-xs text-error">{parseError}</p>
      )}

      {/* Preview */}
      {preview && (
        <div className="bg-surface-0 rounded border border-border p-3 space-y-1">
          <p className="text-xs font-semibold text-text-secondary">
            {preview.headers.event || 'Chess Game'}
            {preview.headers.round ? ` — Round ${preview.headers.round}` : ''}
          </p>
          <div className="flex gap-4 text-xs text-text-muted">
            <span>{preview.headers.white} vs {preview.headers.black}</span>
            {preview.headers.date && <span>{preview.headers.date}</span>}
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span>{preview.moves.length} moves</span>
            <span>Result: {preview.headers.result}</span>
            {preview.headers.eco && <span>ECO: {preview.headers.eco}</span>}
            {preview.headers.opening && <span>{preview.headers.opening}</span>}
            {/* Start from move picker — only shown when game has multiple moves */}
            {preview.moves.length > 2 && (
              <label className="flex items-center gap-1.5 ml-auto">
                <span className="text-text-muted whitespace-nowrap">Start from move:</span>
                <input
                  type="number"
                  min={1}
                  max={Math.ceil(preview.moves.length / 2)}
                  value={startFromMove}
                  onChange={(e) => setStartFromMove(Math.max(1, Math.min(Math.ceil(preview.moves.length / 2), Number(e.target.value) || 1)))}
                  className="w-14 bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border text-center"
                />
                <span className="text-text-muted/60">/ {Math.ceil(preview.moves.length / 2)}</span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Historical context */}
      <div>
        <label className="text-xs text-text-muted block mb-1">
          Historical Context <span className="text-text-muted/50">(optional — fed to commentator)</span>
        </label>
        <textarea
          value={historicalContext}
          onChange={(e) => setHistoricalContext(e.target.value)}
          placeholder="This is Game 6 of the 1972 World Championship. Fischer, playing Black, is about to produce what many consider the greatest game of chess ever played."
          className="w-full h-16 px-3 py-2 bg-surface-0 border border-border rounded text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-purple-accent resize-y"
        />
      </div>

      {/* Commentator settings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-muted font-medium uppercase tracking-wide">Commentator</label>
          {replayCommentatorModel && (
            <button
              type="button"
              onClick={() => setReplayCommentatorModel(null)}
              className="text-xs text-text-muted hover:text-error transition-colors"
              title="Disable commentary"
            >
              disable
            </button>
          )}
        </div>
        {/* Mode toggle */}
        <div className="flex gap-0.5">
          {COMMENTATOR_MODES.map(mode => (
            <button
              key={mode.value}
              type="button"
              onClick={() => patchCommentator({ mode: mode.value })}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                commentatorMode === mode.value
                  ? 'bg-purple-accent text-white'
                  : 'bg-surface-2 text-text-muted hover:text-text-secondary'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {/* Model selector */}
        <ModelSelector
          label=""
          value={replayCommentatorModel?.id || ''}
          onChange={(id, name) => patchCommentator({ id, name })}
        />
        {/* Sub-settings when model selected */}
        {replayCommentatorModel?.id && (
          <div className="flex flex-col gap-1.5">
            {/* Verbosity */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-muted">Depth:</span>
              {VERBOSITY_LEVELS.map(v => (
                <button
                  key={v.value}
                  type="button"
                  title={v.desc}
                  onClick={() => patchCommentator({ verbosity: v.value })}
                  className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                    commentatorVerbosity === v.value
                      ? 'bg-purple-accent text-white'
                      : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {/* Reasoning effort */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-muted">Rsn:</span>
              {REASONING_EFFORTS.map(re => (
                <button
                  key={re.value}
                  type="button"
                  onClick={() => patchCommentator({ reasoningEffort: re.value })}
                  className={`px-1 py-0.5 rounded text-xs transition-colors ${
                    commentatorReasoning === re.value
                      ? 'bg-purple-accent/80 text-white'
                      : 'bg-surface-2 text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {re.label}
                </button>
              ))}
            </div>
            {/* Tokens + SF Depth row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-text-muted">Tokens:</span>
              <select
                value={commentatorTokens}
                onChange={(e) => patchCommentator({ maxTokens: Number(e.target.value) })}
                className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border"
              >
                {REPLAY_TOKEN_PRESETS.map(t => (
                  <option key={t} value={t}>{t >= 1000 ? `${t / 1000}k` : t}</option>
                ))}
              </select>
              {commentatorMode === 'oracle' && (
                <>
                  <span className="text-xs text-text-muted ml-1">SF Depth:</span>
                  <select
                    value={commentatorDepth}
                    onChange={(e) => patchCommentator({ stockfishDepth: Number(e.target.value) })}
                    className="bg-surface-2 text-text-primary text-xs rounded px-1.5 py-0.5 border border-border"
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
        {/* TTS Narration */}
        {replayCommentatorModel?.id && (
          <div className="mt-2 pt-2 border-t border-surface-2 space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  ttsEnabled ? 'bg-purple-accent text-white' : 'bg-surface-2 text-text-muted hover:text-text-primary'
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
                      type="range" min="0" max="100"
                      value={Math.round(ttsVolume * 100)}
                      onChange={(e) => setTtsVolume(Number(e.target.value) / 100)}
                      className="w-16 h-1 accent-purple-accent"
                    />
                  </div>
                  {ttsStatus === 'online' && <span className="text-[10px] text-success">ready</span>}
                  {ttsStatus === 'offline' && (
                    <span className="text-[10px] text-warning">
                      {ttsProvider === 'local' ? 'server offline' : 'needs API key'}
                    </span>
                  )}
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
        {!replayCommentatorModel?.id && (
          <p className="text-xs text-text-muted/60">No commentator — replay will run silently</p>
        )}
      </div>

      {/* Start button */}
      <button
        type="button"
        onClick={handleStart}
        disabled={!pgnText.trim()}
        className="w-full px-4 py-2.5 bg-purple-accent hover:bg-purple-hover text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Start Replay
      </button>
    </div>
  );
}
