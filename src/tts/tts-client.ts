import type { TtsProvider } from '../store/settingsStore';

export interface TtsStatus {
  running: boolean;
  port: number;
  model: string | null;
  error: string | null;
}

export interface TtsVoice {
  id: string;
  name: string;
}

export interface TtsSynthesizeOptions {
  language?: string;
  voice?: string;
  speaker?: string;
  instruct?: string;
  port?: number;
  // Cloud provider options
  provider?: TtsProvider;
  cloudApiKey?: string;
  cloudVoice?: string;
}

const DEFAULT_PORT = 9877;

function localBaseUrl(port?: number): string {
  return `http://localhost:${port || DEFAULT_PORT}`;
}

// --- Alibaba Cloud / DashScope (Qwen3-TTS) ---

const DASHSCOPE_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

// Qwen3-TTS cloud voices (subset of 49+ available)
export const QWEN_CLOUD_VOICES: TtsVoice[] = [
  { id: 'Chelsie', name: 'Chelsie (Female, Narrator)' },
  { id: 'Cherry', name: 'Cherry (Female, Warm)' },
  { id: 'Serena', name: 'Serena (Female, Calm)' },
  { id: 'Ethan', name: 'Ethan (Male, Deep)' },
  { id: 'Aiden', name: 'Aiden (Male, Narrator)' },
  { id: 'River', name: 'River (Male, Clear)' },
];

// OpenAI TTS voices
export const OPENAI_TTS_VOICES: TtsVoice[] = [
  { id: 'alloy', name: 'Alloy (Neutral)' },
  { id: 'echo', name: 'Echo (Male)' },
  { id: 'fable', name: 'Fable (Male, British)' },
  { id: 'onyx', name: 'Onyx (Male, Deep)' },
  { id: 'nova', name: 'Nova (Female)' },
  { id: 'shimmer', name: 'Shimmer (Female, Warm)' },
];

/**
 * Synthesize via Qwen3-TTS Cloud (DashScope).
 * Returns WAV-compatible audio as ArrayBuffer.
 */
async function synthesizeQwenCloud(text: string, apiKey: string, voice: string): Promise<ArrayBuffer> {
  const response = await fetch(DASHSCOPE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: {
        text,
        voice: voice || 'Chelsie',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen Cloud TTS failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    output?: { audio?: { url?: string; data?: string } };
    code?: string;
    message?: string;
  };

  if (data.code && data.code !== '200' && data.code !== 'Success') {
    throw new Error(`Qwen Cloud TTS error: ${data.message || data.code}`);
  }

  const audio = data.output?.audio;
  if (!audio) throw new Error('Qwen Cloud TTS: no audio in response');

  // If base64 data is returned (streaming mode), decode it
  if (audio.data) {
    const binary = atob(audio.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Otherwise fetch the audio URL
  if (audio.url) {
    const audioResp = await fetch(audio.url);
    if (!audioResp.ok) throw new Error(`Failed to fetch audio URL: ${audioResp.status}`);
    return audioResp.arrayBuffer();
  }

  throw new Error('Qwen Cloud TTS: no audio data or URL in response');
}

/**
 * Synthesize via OpenAI TTS API.
 * Returns MP3 audio as ArrayBuffer.
 */
async function synthesizeOpenAI(text: string, apiKey: string, voice: string): Promise<ArrayBuffer> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice || 'nova',
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${errorText}`);
  }

  return response.arrayBuffer();
}

/**
 * Synthesize via local TTS sidecar.
 */
async function synthesizeLocal(text: string, options: TtsSynthesizeOptions): Promise<ArrayBuffer> {
  const response = await fetch(`${localBaseUrl(options.port)}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language: options.language || 'English',
      voice: options.voice || 'default',
      speaker: options.speaker,
      instruct: options.instruct,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local TTS synthesis failed: ${errorText}`);
  }

  return response.arrayBuffer();
}

// --- Public API ---

/**
 * Check if the TTS sidecar is running and responsive.
 */
export async function checkTtsHealth(port?: number): Promise<TtsStatus> {
  try {
    const response = await fetch(`${localBaseUrl(port)}/health`);
    if (!response.ok) {
      return { running: false, port: port || DEFAULT_PORT, model: null, error: `HTTP ${response.status}` };
    }
    const data = await response.json() as { ok: boolean; model?: string; device?: string };
    return {
      running: data.ok,
      port: port || DEFAULT_PORT,
      model: data.model ?? null,
      error: data.ok ? null : 'Model not loaded',
    };
  } catch {
    return { running: false, port: port || DEFAULT_PORT, model: null, error: 'TTS server not reachable' };
  }
}

/**
 * Check if a cloud TTS provider API key is valid.
 */
export async function checkCloudTtsHealth(provider: TtsProvider, apiKey: string): Promise<TtsStatus> {
  if (!apiKey) {
    return { running: false, port: 0, model: null, error: 'No API key configured' };
  }

  try {
    if (provider === 'qwen-cloud') {
      // Quick test synthesis with minimal text
      await synthesizeQwenCloud('test', apiKey, 'Chelsie');
      return { running: true, port: 0, model: 'qwen3-tts-flash', error: null };
    } else if (provider === 'openai') {
      // Check by making a tiny synthesis request
      await synthesizeOpenAI('test', apiKey, 'nova');
      return { running: true, port: 0, model: 'tts-1', error: null };
    }
  } catch (err) {
    return { running: false, port: 0, model: null, error: err instanceof Error ? err.message : String(err) };
  }

  return { running: false, port: 0, model: null, error: 'Unknown provider' };
}

/**
 * List available voices for a provider.
 */
export async function listTtsVoices(port?: number, provider?: TtsProvider): Promise<TtsVoice[]> {
  if (provider === 'qwen-cloud') return QWEN_CLOUD_VOICES;
  if (provider === 'openai') return OPENAI_TTS_VOICES;

  // Local sidecar voices
  try {
    const response = await fetch(`${localBaseUrl(port)}/voices`);
    if (!response.ok) return [];
    return await response.json() as TtsVoice[];
  } catch {
    return [];
  }
}

/**
 * Synthesize text to speech. Routes to the appropriate provider.
 * Returns audio as ArrayBuffer.
 */
export async function synthesize(text: string, options?: TtsSynthesizeOptions): Promise<ArrayBuffer> {
  const provider = options?.provider || 'local';

  if (provider === 'qwen-cloud') {
    if (!options?.cloudApiKey) throw new Error('Qwen Cloud TTS requires an API key');
    return synthesizeQwenCloud(text, options.cloudApiKey, options.cloudVoice || 'Chelsie');
  }

  if (provider === 'openai') {
    if (!options?.cloudApiKey) throw new Error('OpenAI TTS requires an API key');
    return synthesizeOpenAI(text, options.cloudApiKey, options.cloudVoice || 'nova');
  }

  // Local sidecar
  return synthesizeLocal(text, options || {});
}
