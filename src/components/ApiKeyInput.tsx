import { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { createLLMClient, type LLMProvider } from '../llm/client';

export function ApiKeyInput() {
  const {
    provider,
    apiKey,
    providerKeys,
    codexSubscriptionPlan,
    codexBridgeLastKnownReady,
    codexBridgeLastKnownMessage,
    ollamaBaseUrl,
    setProvider,
    setApiKey,
    setCodexSubscriptionPlan,
    setCodexBridgeStatus,
    setOllamaBaseUrl,
  } = useSettingsStore();
  const [input, setInput] = useState(apiKey);
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'checking' | 'ready' | 'error'>(
    codexBridgeLastKnownMessage ? (codexBridgeLastKnownReady ? 'ready' : 'error') : 'idle',
  );
  const [bridgeMessage, setBridgeMessage] = useState(codexBridgeLastKnownMessage);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [ollamaMessage, setOllamaMessage] = useState('');
  const [ollamaUrlInput, setOllamaUrlInput] = useState(ollamaBaseUrl);

  const handleSave = async () => {
    if (!input.trim()) return;
    setStatus('validating');
    const client = createLLMClient({ provider, apiKey: input.trim(), ollamaBaseUrl });
    const valid = await client.validateKey();
    if (valid) {
      setApiKey(input.trim());
      setStatus('valid');
    } else {
      setStatus('invalid');
    }
  };

  const checkBridgeStatus = useCallback(async (background = false) => {
    if (!background) {
      setBridgeStatus('checking');
      setBridgeMessage('');
    }
    try {
      const response = await fetch('/api/codex-bridge/health');
      if (!response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text) as { error?: string };
          throw new Error(data.error || `Bridge health check failed (${response.status})`);
        } catch {
          throw new Error(text || `Bridge health check failed (${response.status})`);
        }
      }
      const data = await response.json() as { codexAvailable?: boolean; loggedIn?: boolean; loginStatus?: string; version?: string };
      if (!data.codexAvailable) {
        throw new Error('Codex CLI not found. Run: npm install -g @openai/codex');
      }
      if (!data.loggedIn) {
        throw new Error(data.loginStatus || 'Not logged in. Run: codex login');
      }
      const message = data.version ? `Connected (${data.version})` : 'Connected';
      setBridgeStatus('ready');
      setBridgeMessage(message);
      setCodexBridgeStatus(true, message);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBridgeStatus('error');
      setBridgeMessage(message);
      setCodexBridgeStatus(false, message);
    }
  }, [setCodexBridgeStatus]);

  useEffect(() => {
    if (provider !== 'codex') return;
    void checkBridgeStatus(true);
  }, [provider, checkBridgeStatus]);

  const handleCheckBridge = async () => {
    await checkBridgeStatus(false);
  };

  const checkOllamaStatus = useCallback(async () => {
    setOllamaStatus('checking');
    setOllamaMessage('');
    try {
      const baseUrl = ollamaUrlInput.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) throw new Error(`Ollama responded with ${response.status}`);
      const data = await response.json() as { models?: Array<{ name: string }> };
      const count = data.models?.length ?? 0;
      setOllamaStatus('connected');
      setOllamaMessage(`Connected — ${count} model${count !== 1 ? 's' : ''} available`);
      setOllamaBaseUrl(baseUrl);
    } catch (err) {
      setOllamaStatus('error');
      setOllamaMessage(err instanceof Error ? err.message : String(err));
    }
  }, [ollamaUrlInput, setOllamaBaseUrl]);

  useEffect(() => {
    if (provider !== 'ollama') return;
    void checkOllamaStatus();
  }, [provider, checkOllamaStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-surface-1 rounded-lg">
      <div className="flex flex-col gap-1">
        <label className="text-sm text-text-secondary">Provider</label>
        <div className="flex gap-1">
          <ProviderButton
            active={provider === 'openrouter'}
            label="OpenRouter"
            onClick={() => {
              setProvider('openrouter');
              setInput(providerKeys.openrouter || '');
              setStatus('idle');
            }}
          />
          <ProviderButton
            active={provider === 'openai'}
            label="OpenAI"
            onClick={() => {
              setProvider('openai');
              setInput(providerKeys.openai || '');
              setStatus('idle');
            }}
          />
          <ProviderButton
            active={provider === 'codex'}
            label="Codex"
            onClick={() => {
              setProvider('codex');
              setInput('');
              setStatus('idle');
            }}
          />
          <ProviderButton
            active={provider === 'ollama'}
            label="Local (Ollama)"
            onClick={() => {
              setProvider('ollama');
              setInput('');
              setStatus('idle');
            }}
          />
        </div>
      </div>

      {provider === 'codex' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-text-secondary">Codex Subscription Plan</label>
          <select
            value={codexSubscriptionPlan}
            onChange={(e) => setCodexSubscriptionPlan(e.target.value as typeof codexSubscriptionPlan)}
            className="px-3 py-2 bg-surface-0 border border-surface-3 rounded text-text-primary text-sm focus:outline-none focus:border-purple-accent"
          >
            <option value="plus">ChatGPT Plus</option>
            <option value="pro">ChatGPT Pro</option>
            <option value="business">ChatGPT Business</option>
            <option value="edu">ChatGPT Edu</option>
            <option value="enterprise">ChatGPT Enterprise</option>
          </select>
          <span className="text-xs text-text-muted">
            Uses local Codex CLI. No API key required.
          </span>

          <div className="mt-2 p-2 rounded border border-surface-3 bg-surface-0/60 text-xs text-text-muted flex flex-col gap-2">
            <div className="font-medium text-text-secondary">Codex CLI Bridge</div>
            <div>
              The app routes API calls through your local Codex CLI using your ChatGPT subscription.
            </div>
            <div className="text-[11px] text-text-muted">
              Setup: <code className="text-purple-light">npm install -g @openai/codex</code> then <code className="text-purple-light">codex login</code>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCheckBridge}
                disabled={bridgeStatus === 'checking'}
                className="px-3 py-1.5 bg-purple-accent hover:bg-purple-hover text-white rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {bridgeStatus === 'checking' ? 'Checking...' : 'Check Bridge'}
              </button>
            </div>
            {bridgeStatus === 'ready' && (
              <div className="text-[11px] text-success">{bridgeMessage}</div>
            )}
            {bridgeStatus === 'error' && (
              <div className="text-[11px] text-warning">{bridgeMessage}</div>
            )}
          </div>
        </div>
      )}

      {provider === 'ollama' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-text-secondary">Ollama Base URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={ollamaUrlInput}
              onChange={(e) => { setOllamaUrlInput(e.target.value); setOllamaStatus('idle'); }}
              placeholder="http://localhost:11434"
              className="flex-1 px-3 py-2 bg-surface-0 border border-surface-3 rounded text-text-primary text-sm focus:outline-none focus:border-purple-accent"
            />
            <button
              type="button"
              onClick={() => void checkOllamaStatus()}
              disabled={ollamaStatus === 'checking'}
              className="px-3 py-2 bg-purple-accent hover:bg-purple-hover text-white rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {ollamaStatus === 'checking' ? 'Checking...' : 'Connect'}
            </button>
          </div>
          <span className="text-xs text-text-muted">
            Runs locally via Ollama. No API key required.
          </span>
          {ollamaStatus === 'connected' && (
            <span className="text-xs text-success">{ollamaMessage}</span>
          )}
          {ollamaStatus === 'error' && (
            <div className="text-xs text-warning">
              <div>{ollamaMessage}</div>
              <div className="mt-1 text-text-muted">
                Install Ollama from <code className="text-purple-light">ollama.com</code>, then run: <code className="text-purple-light">ollama serve</code>
              </div>
            </div>
          )}
        </div>
      )}

      {provider !== 'codex' && provider !== 'ollama' && (
        <>
          <label className="text-sm text-text-secondary">
            {providerLabel(provider)} API Key
          </label>
          <form className="flex gap-2" onSubmit={handleSubmit}>
            <input
              type="password"
              value={input}
              onChange={(e) => { setInput(e.target.value); setStatus('idle'); }}
              placeholder={provider === 'openrouter' ? 'sk-or-...' : 'sk-...'}
              className="flex-1 px-3 py-2 bg-surface-0 border border-surface-3 rounded text-text-primary text-sm focus:outline-none focus:border-purple-accent"
            />
            <button
              type="submit"
              disabled={status === 'validating' || !input.trim()}
              className="px-4 py-2 bg-purple-accent hover:bg-purple-hover text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'validating' ? 'Checking...' : 'Save'}
            </button>
          </form>
          {status === 'valid' && <span className="text-sm text-success">Key validated successfully</span>}
          {status === 'invalid' && <span className="text-sm text-error">Invalid API key</span>}
          {apiKey && status === 'idle' && <span className="text-sm text-text-muted">{providerLabel(provider)} key configured</span>}
        </>
      )}
    </div>
  );
}

function providerLabel(provider: LLMProvider): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'codex') return 'Codex';
  if (provider === 'ollama') return 'Ollama';
  return 'OpenRouter';
}

function ProviderButton({ active, label, onClick }: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-purple-accent text-white'
          : 'bg-surface-2 text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}
