import { useState, useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { createLLMClient, type LLMModel, type LLMProvider } from '../llm/client';

const FEATURED_MODELS: Record<LLMProvider, LLMModel[]> = {
  openrouter: [
    { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', pricing: { prompt: '', completion: '' }, context_length: 1000000 },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super 120B (Free)', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'openai/gpt-5.5', name: 'GPT-5.5', pricing: { prompt: '', completion: '' }, context_length: 1000000 },
    { id: 'openai/gpt-5.4', name: 'GPT-5.4', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', pricing: { prompt: '', completion: '' }, context_length: 200000 },
    { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', pricing: { prompt: '', completion: '' }, context_length: 200000 },
    { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', pricing: { prompt: '', completion: '' }, context_length: 200000 },
    { id: 'openai/gpt-5.2', name: 'GPT-5.2', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'z-ai/glm-5', name: 'GLM-5', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', pricing: { prompt: '', completion: '' }, context_length: 200000 },
    { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', pricing: { prompt: '', completion: '' }, context_length: 1000000 },
    { id: 'openai/gpt-5.1', name: 'GPT-5.1', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', pricing: { prompt: '', completion: '' }, context_length: 128000 },
    { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', pricing: { prompt: '', completion: '' }, context_length: 131072 },
    { id: 'minimax/minimax-m2.5', name: 'MiniMax M2.5', pricing: { prompt: '', completion: '' }, context_length: 1000000 },
    { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', pricing: { prompt: '', completion: '' }, context_length: 131072 },
    { id: 'qwen/qwen3.5-397b-a17b', name: 'Qwen 3.5 397B', pricing: { prompt: '', completion: '' }, context_length: 131072 },
    { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', pricing: { prompt: '', completion: '' }, context_length: 1048576 },
    { id: 'mistralai/mistral-large-2512', name: 'Mistral Large 2512', pricing: { prompt: '', completion: '' }, context_length: 131072 },
    { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', pricing: { prompt: '', completion: '' }, context_length: 1000000 },
    { id: 'google/gemini-3.1-flash-lite-preview:nitro', name: 'Gemini 3.1 Flash Lite Preview (Nitro)', pricing: { prompt: '', completion: '' }, context_length: 1000000 },
  ],
  openai: [
    { id: 'gpt-oss-120b', name: 'GPT OSS 120B' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
    { id: 'codex-mini-latest', name: 'Codex Mini Latest' },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'o4-mini', name: 'o4-mini' },
  ],
  codex: [
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
  ],
  ollama: [
    { id: 'qwen3.5:4b', name: 'Qwen 3.5 4B' },
    { id: 'qwen3.5:35b-a3b', name: 'Qwen 3.5 35B (MoE)' },
    { id: 'qwen3.5:9b', name: 'Qwen 3.5 9B' },
    { id: 'llama4:scout', name: 'Llama 4 Scout' },
    { id: 'gemma3:12b', name: 'Gemma 3 12B' },
  ],
};

const OPENAI_RESPONSES_ONLY_PATTERNS = [
  /^gpt-5-codex(?:$|[-._])/i,
  /^gpt-5\.1-codex(?:$|[-._])/i,
];

interface ModelSelectorProps {
  label: string;
  value: string;
  onChange: (modelId: string, displayName: string) => void;
}

const cachedModels: Record<string, LLMModel[]> = {};

export function ModelSelector({ label, value, onChange }: ModelSelectorProps) {
  const apiKey = useSettingsStore(s => s.apiKey);
  const provider = useSettingsStore(s => s.provider);
  const ollamaBaseUrl = useSettingsStore(s => s.ollamaBaseUrl);
  const favoriteModels = useSettingsStore(s => s.favoriteModels);
  const toggleFavoriteModel = useSettingsStore(s => s.toggleFavoriteModel);
  const cacheKey = provider === 'ollama' ? `ollama:${ollamaBaseUrl}` : `${provider}:${apiKey}`;
  const featuredModels = FEATURED_MODELS[provider];
  const featuredIds = useMemo(() => new Set(featuredModels.map(m => m.id)), [featuredModels]);

  const [remoteModels, setRemoteModels] = useState<LLMModel[]>([]);
  const [fetchedForKey, setFetchedForKey] = useState('');
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const cachedForKey = cachedModels[cacheKey];
  const hasFetchedForCurrentKey = fetchedForKey === cacheKey;
  const effectiveRemoteModels = useMemo(
    () => cachedForKey || (hasFetchedForCurrentKey ? remoteModels : []),
    [cachedForKey, hasFetchedForCurrentKey, remoteModels],
  );
  const modelsLoaded = !!cachedForKey || hasFetchedForCurrentKey;

  useEffect(() => {
    if ((!apiKey && provider !== 'ollama') || modelsLoaded) return;
    let cancelled = false;

    const client = createLLMClient({ provider, apiKey, ollamaBaseUrl });
    client.listModels().then(m => {
      if (cancelled) return;
      const filtered = (provider === 'openai' || provider === 'codex')
        ? m.filter(model => !OPENAI_RESPONSES_ONLY_PATTERNS.some(p => p.test(model.id)))
        : m;
      cachedModels[cacheKey] = filtered;
      setRemoteModels(filtered);
      setFetchedForKey(cacheKey);
    }).finally(() => {
      if (!cancelled && !cachedModels[cacheKey]) {
        setFetchedForKey(cacheKey);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [apiKey, provider, cacheKey, modelsLoaded]);

  const loading = !!apiKey && !modelsLoaded;

  const allModels = useMemo(() => {
    const seen = new Set<string>();
    const merged: LLMModel[] = [];
    for (const m of featuredModels) {
      if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
    }
    for (const m of effectiveRemoteModels) {
      if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
    }
    return merged;
  }, [featuredModels, effectiveRemoteModels]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const result = allModels.filter(m =>
      m.id.toLowerCase().includes(term) || m.name.toLowerCase().includes(term),
    );
    return result.sort((a, b) => {
      const aFeat = featuredIds.has(a.id) ? -1 : 0;
      const bFeat = featuredIds.has(b.id) ? -1 : 0;
      if (aFeat !== bFeat) return aFeat - bFeat;
      const aFav = favoriteModels.includes(a.id) ? -1 : 0;
      const bFav = favoriteModels.includes(b.id) ? -1 : 0;
      return aFav - bFav;
    });
  }, [allModels, search, favoriteModels, featuredIds]);

  const selectedModel = allModels.find(m => m.id === value);

  return (
    <div className="flex flex-col gap-1 relative">
      <label className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-surface-0 border border-surface-3 rounded text-left text-sm text-text-primary hover:border-purple-accent transition-colors"
      >
        {selectedModel ? selectedModel.name : loading ? 'Loading models...' : 'Select model'}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-1 border border-surface-3 rounded-lg shadow-xl z-50 max-h-80 flex flex-col">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="px-3 py-2 bg-surface-0 border-b border-surface-3 text-sm text-text-primary focus:outline-none"
            autoFocus
          />
          <div className="overflow-y-auto">
            {filtered.slice(0, 50).map((m, i) => {
              const isFeatured = featuredIds.has(m.id);
              const prevFeatured = i > 0 && featuredIds.has(filtered[i - 1].id);
              const showDivider = !isFeatured && (i === 0 || prevFeatured);

              return (
                <div key={m.id}>
                  {showDivider && effectiveRemoteModels.length > 0 && (
                    <div className="px-3 py-1 text-xs text-text-muted bg-surface-2/50 border-t border-surface-2">
                      All models
                    </div>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { onChange(m.id, m.name); setIsOpen(false); setSearch(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onChange(m.id, m.name);
                        setIsOpen(false);
                        setSearch('');
                      }
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors flex items-center justify-between cursor-pointer ${m.id === value ? 'bg-purple-dim text-purple-light' : 'text-text-primary'}`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">
                        {isFeatured && <span className="text-purple-light mr-1">*</span>}
                        {m.name}
                      </span>
                      <span className="text-xs text-text-muted truncate">{m.id}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteModel(m.id);
                      }}
                      className={`ml-2 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                        favoriteModels.includes(m.id)
                          ? 'text-yellow-300 bg-yellow-500/15'
                          : 'text-text-muted bg-surface-3/30'
                      }`}
                      title={favoriteModels.includes(m.id) ? 'Remove favorite' : 'Add favorite'}
                    >
                      {favoriteModels.includes(m.id) ? 'Fav' : 'Pin'}
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-text-muted text-center">No models found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
