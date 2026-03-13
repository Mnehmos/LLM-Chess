/**
 * Tauri bridge — detects if running inside Tauri and exposes
 * native commands (TTS sidecar management) with graceful fallbacks
 * for browser-only mode.
 */

interface TtsStatus {
  running: boolean;
  port: number;
  model: string | null;
  error: string | null;
}

/** True when running inside a Tauri webview (desktop app). */
export const isTauri: boolean = '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new Error('Not running in Tauri');
  // Dynamic import avoids bundling issues when running in browser
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

export async function loadPuzzleCatalog(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return await invoke<string>('load_puzzle_catalog');
  } catch (error) {
    console.warn('[PuzzleBreak] Tauri catalog load failed', error);
    return null;
  }
}

/**
 * Start the TTS Python sidecar via Tauri.
 * Falls back to assuming the server is already running externally in browser mode.
 */
export async function startTtsServer(options?: {
  pythonPath?: string;
  model?: string;
  port?: number;
}): Promise<TtsStatus> {
  if (!isTauri) {
    // In browser mode, just check if the server is already running externally
    return checkTtsServer(options?.port);
  }
  return invoke<TtsStatus>('start_tts_server', {
    pythonPath: options?.pythonPath ?? null,
    model: options?.model ?? null,
    port: options?.port ?? null,
  });
}

/**
 * Stop the TTS sidecar. No-op in browser mode.
 */
export async function stopTtsServer(): Promise<TtsStatus> {
  if (!isTauri) {
    return { running: false, port: 9877, model: null, error: null };
  }
  return invoke<TtsStatus>('stop_tts_server');
}

/**
 * Get TTS server status.
 * In browser mode, pings the health endpoint directly.
 */
export async function checkTtsServer(port?: number): Promise<TtsStatus> {
  if (isTauri) {
    return invoke<TtsStatus>('get_tts_status');
  }
  // Browser fallback: check health endpoint directly
  const p = port || 9877;
  try {
    const resp = await fetch(`http://localhost:${p}/health`);
    if (!resp.ok) return { running: false, port: p, model: null, error: `HTTP ${resp.status}` };
    const data = await resp.json() as { ok: boolean; model?: string };
    return { running: data.ok, port: p, model: data.model ?? null, error: null };
  } catch {
    return { running: false, port: p, model: null, error: 'TTS server not reachable' };
  }
}

/**
 * Check if Ollama is running and return model count.
 */
export async function checkOllamaConnection(baseUrl: string): Promise<{
  connected: boolean;
  modelCount: number;
  error: string | null;
}> {
  try {
    const url = baseUrl.replace(/\/+$/, '');
    const resp = await fetch(`${url}/api/tags`);
    if (!resp.ok) return { connected: false, modelCount: 0, error: `HTTP ${resp.status}` };
    const data = await resp.json() as { models?: Array<{ name: string }> };
    return { connected: true, modelCount: data.models?.length ?? 0, error: null };
  } catch {
    return { connected: false, modelCount: 0, error: 'Ollama not reachable' };
  }
}
