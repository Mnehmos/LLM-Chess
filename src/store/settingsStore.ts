import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMProvider } from '../llm/client';

export type CodexSubscriptionPlan = 'plus' | 'pro' | 'business' | 'edu' | 'enterprise';
export type TtsModelVariant = '0.6B' | '0.6B-custom' | '1.7B' | '1.7B-custom' | '1.7B-design';
export type TtsProvider = 'local' | 'qwen-cloud' | 'openai';

interface ProviderKeys {
  openrouter: string;
  openai: string;
}

interface SettingsState {
  provider: LLMProvider;
  providerKeys: ProviderKeys;
  apiKey: string;
  codexSubscriptionPlan: CodexSubscriptionPlan;
  codexBridgeLastKnownReady: boolean;
  codexBridgeLastKnownMessage: string;
  ollamaBaseUrl: string;
  defaultTemperature: number;
  defaultMaxRetries: number;
  favoriteModels: string[];
  // TTS settings
  ttsEnabled: boolean;
  ttsProvider: TtsProvider;
  ttsCloudApiKey: string;
  ttsCloudVoice: string;
  ttsModel: TtsModelVariant;
  ttsVoice: string;
  ttsVolume: number;
  ttsPythonPath: string;
  ttsPort: number;
  // Filler / dead air settings
  fillerEnabled: boolean;
  channelName: string;
  channelWebsite: string;
  channelDonationUrl: string;
  channelCustomPlugLines: string;
  // Puzzle Break settings
  puzzleBreakEnabled: boolean;
  puzzleBreakThresholdMs: number;
  puzzleBreakModel: string;
  puzzleBreakReasoningEffort: string;
  puzzleBreakMaxTokens: number;
  setPuzzleBreakEnabled: (v: boolean) => void;
  setPuzzleBreakThresholdMs: (ms: number) => void;
  setPuzzleBreakModel: (model: string) => void;
  setPuzzleBreakReasoningEffort: (effort: string) => void;
  setPuzzleBreakMaxTokens: (tokens: number) => void;
  setFillerEnabled: (enabled: boolean) => void;
  setChannelName: (name: string) => void;
  setChannelWebsite: (url: string) => void;
  setChannelDonationUrl: (url: string) => void;
  setChannelCustomPlugLines: (lines: string) => void;
  setProvider: (provider: LLMProvider) => void;
  setApiKey: (key: string) => void;
  setCodexSubscriptionPlan: (plan: CodexSubscriptionPlan) => void;
  setCodexBridgeStatus: (ready: boolean, message: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setDefaultTemperature: (t: number) => void;
  setDefaultMaxRetries: (n: number) => void;
  toggleFavoriteModel: (modelId: string) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setTtsProvider: (provider: TtsProvider) => void;
  setTtsCloudApiKey: (key: string) => void;
  setTtsCloudVoice: (voice: string) => void;
  setTtsModel: (model: TtsModelVariant) => void;
  setTtsVoice: (voice: string) => void;
  setTtsVolume: (volume: number) => void;
  setTtsPythonPath: (path: string) => void;
  setTtsPort: (port: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      provider: 'openrouter',
      providerKeys: {
        openrouter: '',
        openai: '',
      },
      apiKey: '',
      codexSubscriptionPlan: 'pro',
      codexBridgeLastKnownReady: false,
      codexBridgeLastKnownMessage: '',
      ollamaBaseUrl: 'http://localhost:11434',
      defaultTemperature: 0.3,
      defaultMaxRetries: 3,
      favoriteModels: [],
      ttsEnabled: false,
      ttsProvider: 'qwen-cloud' as TtsProvider,
      ttsCloudApiKey: '',
      ttsCloudVoice: 'Chelsie',
      ttsModel: '0.6B-custom' as TtsModelVariant,
      ttsVoice: 'default',
      ttsVolume: 0.8,
      ttsPythonPath: 'python',
      ttsPort: 9877,
      fillerEnabled: true,
      channelName: '',
      channelWebsite: '',
      channelDonationUrl: '',
      channelCustomPlugLines: '',
      puzzleBreakEnabled: false,
      puzzleBreakThresholdMs: 20000,
      puzzleBreakModel: 'openai/gpt-4o-mini',
      puzzleBreakReasoningEffort: 'none',
      puzzleBreakMaxTokens: 500,

      setFillerEnabled: (fillerEnabled) => set({ fillerEnabled }),
      setChannelName: (channelName) => set({ channelName }),
      setChannelWebsite: (channelWebsite) => set({ channelWebsite }),
      setChannelDonationUrl: (channelDonationUrl) => set({ channelDonationUrl }),
      setChannelCustomPlugLines: (channelCustomPlugLines) => set({ channelCustomPlugLines }),
      setPuzzleBreakEnabled: (puzzleBreakEnabled) => set({ puzzleBreakEnabled }),
      setPuzzleBreakThresholdMs: (puzzleBreakThresholdMs) => set({ puzzleBreakThresholdMs }),
      setPuzzleBreakModel: (puzzleBreakModel) => set({ puzzleBreakModel }),
      setPuzzleBreakReasoningEffort: (puzzleBreakReasoningEffort) => set({ puzzleBreakReasoningEffort }),
      setPuzzleBreakMaxTokens: (puzzleBreakMaxTokens) => set({ puzzleBreakMaxTokens }),

      setProvider: (provider) => {
        const keys = get().providerKeys;
        // Codex and Ollama don't use API keys.
        const keyForProvider = (provider === 'codex' || provider === 'ollama') ? '' : (keys[provider] || '').trim();
        set({
          provider,
          apiKey: keyForProvider,
        });
      },

      setOllamaBaseUrl: (ollamaBaseUrl) => set({ ollamaBaseUrl }),

      setApiKey: (apiKey) => {
        const sanitized = (apiKey || '').trim();
        const provider = get().provider;
        if (provider === 'codex' || provider === 'ollama') return; // These providers don't use API keys.
        const keys = get().providerKeys;
        set({
          apiKey: sanitized,
          providerKeys: {
            ...keys,
            [provider]: sanitized,
          },
        });
      },

      setCodexSubscriptionPlan: (codexSubscriptionPlan) => set({ codexSubscriptionPlan }),
      setCodexBridgeStatus: (codexBridgeLastKnownReady, codexBridgeLastKnownMessage) =>
        set({ codexBridgeLastKnownReady, codexBridgeLastKnownMessage }),
      setDefaultTemperature: (defaultTemperature) => set({ defaultTemperature }),
      setDefaultMaxRetries: (defaultMaxRetries) => set({ defaultMaxRetries }),

      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setTtsProvider: (ttsProvider) => set({ ttsProvider }),
      setTtsCloudApiKey: (ttsCloudApiKey) => set({ ttsCloudApiKey: (ttsCloudApiKey || '').trim() }),
      setTtsCloudVoice: (ttsCloudVoice) => set({ ttsCloudVoice }),
      setTtsModel: (ttsModel) => set({ ttsModel }),
      setTtsVoice: (ttsVoice) => set({ ttsVoice }),
      setTtsVolume: (ttsVolume) => set({ ttsVolume }),
      setTtsPythonPath: (ttsPythonPath) => set({ ttsPythonPath }),
      setTtsPort: (ttsPort) => set({ ttsPort }),

      toggleFavoriteModel: (modelId) => {
        const current = get().favoriteModels;
        set({
          favoriteModels: current.includes(modelId)
            ? current.filter(m => m !== modelId)
            : [...current, modelId],
        });
      },
    }),
    {
      name: 'llm-chess-settings',
      version: 8,
      migrate: (persisted, version) => {
        const state = (persisted || {}) as Partial<SettingsState> & {
          provider?: LLMProvider | string;
          providerKeys?: ProviderKeys;
          apiKey?: string;
          codexSubscriptionPlan?: CodexSubscriptionPlan;
          openaiRuntimeAuthMode?: string;
          codexBridgeLastKnownReady?: boolean;
          codexBridgeLastKnownMessage?: string;
          ollamaBaseUrl?: string;
        };

        // v3+: add ollamaBaseUrl, TTS fields, and filler settings
        if (version >= 3 && state.provider && state.providerKeys) {
          const s = state as Record<string, unknown>;
          return {
            ...state,
            ollamaBaseUrl: state.ollamaBaseUrl || 'http://localhost:11434',
            ttsEnabled: s.ttsEnabled ?? false,
            ttsProvider: s.ttsProvider ?? 'qwen-cloud',
            ttsCloudApiKey: s.ttsCloudApiKey ?? '',
            ttsCloudVoice: s.ttsCloudVoice ?? 'Chelsie',
            ttsModel: s.ttsModel ?? '0.6B-custom',
            ttsVoice: s.ttsVoice ?? 'default',
            ttsVolume: s.ttsVolume ?? 0.8,
            ttsPythonPath: s.ttsPythonPath ?? 'python',
            ttsPort: s.ttsPort ?? 9877,
            fillerEnabled: s.fillerEnabled ?? true,
            channelName: s.channelName ?? '',
            channelWebsite: s.channelWebsite ?? '',
            channelDonationUrl: s.channelDonationUrl ?? '',
            channelCustomPlugLines: s.channelCustomPlugLines ?? '',
            puzzleBreakEnabled: s.puzzleBreakEnabled ?? false,
            puzzleBreakThresholdMs: s.puzzleBreakThresholdMs ?? 20000,
            puzzleBreakModel: s.puzzleBreakModel ?? 'openai/gpt-4o-mini',
            puzzleBreakReasoningEffort: s.puzzleBreakReasoningEffort ?? 'none',
            puzzleBreakMaxTokens: s.puzzleBreakMaxTokens ?? 500,
          } as SettingsState;
        }

        // Migrate from v2: openaiRuntimeAuthMode=codex_subscription → provider=codex
        let provider: LLMProvider;
        if (state.provider === 'openai' && state.openaiRuntimeAuthMode === 'codex_subscription') {
          provider = 'codex';
        } else if (state.provider === 'openai') {
          provider = 'openai';
        } else {
          provider = 'openrouter';
        }

        const legacyApiKey = typeof state.apiKey === 'string' ? state.apiKey.trim() : '';
        const keys: ProviderKeys = {
          openrouter: state.providerKeys?.openrouter?.trim() || (state.provider === 'openrouter' ? legacyApiKey : ''),
          openai: state.providerKeys?.openai?.trim() || (state.provider === 'openai' ? legacyApiKey : ''),
        };

        return {
          provider,
          providerKeys: keys,
          apiKey: provider === 'codex' ? '' : (keys[provider as keyof ProviderKeys] || ''),
          codexSubscriptionPlan: state.codexSubscriptionPlan || 'pro',
          codexBridgeLastKnownReady: !!state.codexBridgeLastKnownReady,
          codexBridgeLastKnownMessage: state.codexBridgeLastKnownMessage || '',
          ollamaBaseUrl: state.ollamaBaseUrl || 'http://localhost:11434',
          defaultTemperature: typeof state.defaultTemperature === 'number' ? state.defaultTemperature : 0.3,
          defaultMaxRetries: typeof state.defaultMaxRetries === 'number' ? state.defaultMaxRetries : 3,
          favoriteModels: Array.isArray(state.favoriteModels) ? state.favoriteModels : [],
          ttsEnabled: false,
          ttsProvider: 'qwen-cloud',
          ttsCloudApiKey: '',
          ttsCloudVoice: 'Chelsie',
          ttsModel: '0.6B-custom',
          ttsVoice: 'default',
          ttsVolume: 0.8,
          ttsPythonPath: 'python',
          ttsPort: 9877,
          fillerEnabled: true,
          channelName: '',
          channelWebsite: '',
          channelDonationUrl: '',
          channelCustomPlugLines: '',
          puzzleBreakEnabled: false,
          puzzleBreakThresholdMs: 20000,
          puzzleBreakModel: 'openai/gpt-4o-mini',
        } as SettingsState;
      },
    },
  ),
);
