/**
 * Drive the SPA's broadcast mode from headless Chromium and capture
 * frames via CDP Page.startScreencast.
 *
 * Lifted from Clio's scripts/lib/export/browserCapture.ts with a
 * narrower surface:
 *   - single viewport (no map prewarm, no basemap dance)
 *   - single TTS provider hook (cloud Qwen / local Python server)
 *   - chess-specific bridge name (__CHESS_EXPORT__)
 */

import { mkdir, rm } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { registerPid } from './processRegistry';
import { FrameSequenceWriter } from './frameSequenceWriter';

const DEFAULT_FRAME_RATE = 30;
// JPEG quality for the CDP screencast frames. Higher = more source
// detail for the H.264 encoder downstream. We're encoding 1080p
// text-heavy content (board lines, captions, move list) where JPEG
// chroma subsampling artifacts smear edges; quality 92 keeps those
// edges crisp before the encoder ever sees them. Frame files are
// ~20% bigger than at q84 but that's not a bottleneck.
const SCREENCAST_QUALITY_DEFAULT = 92;
// Fast mode (--fast flag) — lower quality for iteration speed. The
// final upload should never use this.
const SCREENCAST_QUALITY_FAST = 70;
const EXPORT_READY_TIMEOUT_MS = 180_000;
const CAPTURE_POSTROLL_MS = 500;

export interface CaptureOptions {
  /** Vite server URL, e.g. http://127.0.0.1:5173 */
  serverUrl: string;
  /** Episode id passed as ?episode=<id>. */
  episodeId?: string;
  /** Inline PGN passed as ?pgn=<encoded>. Mutually exclusive with episodeId. */
  rawPgn?: string;
  /**
   * Authored short clip id, passed as ?shortId=<id>. BroadcastView
   * uses it to slice the replay to the short's ply range and
   * markEnded once the short's last ply has been played.
   */
  shortId?: string;
  /**
   * Variation id, passed as ?variationId=<id>. BroadcastView resolves
   * the variation's own PGN + lessonContext + title for the capture;
   * the parent episode supplies the commentator config. Used for
   * Track A line-variation Shorts (portrait 1080x1920).
   */
  variationId?: string;
  /** Output frame dir (absolute path). Will be created. */
  frameDir: string;
  /** Viewport for the capture. */
  viewport: { width: number; height: number; deviceScaleFactor?: number };
  /** Iteration / preview mode — lowers JPEG quality. */
  fastMode?: boolean;
  /**
   * Optional hard cap on capture wall time. If set, capture stops at
   * this duration regardless of whether the game has ended.
   */
  previewDurationMs?: number;
  /**
   * Maximum time to wait for state().ended before timing out.
   * Defaults to plannedDurationMs * 1.5 + 5 minutes if not set.
   */
  endTimeoutMs?: number;
  /**
   * Optional TTS config to seed into the SPA's localStorage before
   * the page boots. When set, the SPA's broadcast mode uses TTS and
   * narration paces the replay; recorded narration is muxed into the
   * MP4 via AudioNarrationQueue's MediaRecorder tap.
   */
  ttsConfig?: TtsExportConfig;
}

export interface TtsExportConfig {
  provider: 'openai' | 'qwen-cloud' | 'local';
  /** Required for cloud providers; ignored for local. */
  apiKey?: string;
  /** Provider-specific voice id (e.g. 'nova' for OpenAI, 'Chelsie' for Qwen). */
  voice?: string;
  /** Volume 0..1. Default 0.8. */
  volume?: number;
  /** Local sidecar port. Default 9877. Only used when provider === 'local'. */
  port?: number;
}

export interface CaptureResult {
  frameDir: string;
  frameCount: number;
  frameRate: number;
  /** Wall-clock duration of the recording, ms. */
  durationMs: number;
  /** Map of moveIndex → ms-from-start when each commentary entry began playing. */
  segmentTimings: Record<number, number>;
  /** Browser console errors / warnings collected during the run. */
  consoleEntries: BrowserConsoleEntry[];
  /**
   * Base64-encoded webm/opus narration audio recorded via MediaRecorder
   * tap on the AudioNarrationQueue. Empty string when TTS was disabled
   * or no narration played.
   */
  recordedAudioBase64: string;
}

export interface BrowserConsoleEntry {
  type: string;
  text: string;
}

export async function recordBroadcastPlayback(browser: Browser, options: CaptureOptions): Promise<CaptureResult> {
  await mkdir(options.frameDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: options.viewport.width, height: options.viewport.height },
    deviceScaleFactor: options.viewport.deviceScaleFactor ?? 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  // Seed TTS settings into localStorage BEFORE any SPA module loads
  // so zustand's persist middleware picks them up on boot. The page
  // is started fresh by Playwright, so localStorage is empty — without
  // this seeding, ttsEnabled defaults to false and the replay
  // speedruns to checkmate in milliseconds (no narration gate to
  // pace it).
  if (options.ttsConfig) {
    await context.addInitScript(seedTtsSettingsScript(options.ttsConfig));
  }

  const page = await context.newPage();
  const consoleEntries: BrowserConsoleEntry[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleEntries.push({ type: message.type(), text });
    }
    // Surface broadcast-specific diagnostics to the export stdout so
    // a silent capture is debuggable without re-running with Playwright
    // in non-headless mode. Filter narrowly so we don't pull in
    // unrelated Vite HMR noise.
    if (
      text.startsWith('[broadcast]')
      || text.startsWith('[seed]')
      || text.startsWith('[__CHESS_EXPORT__]')
      || text.startsWith('[Commentary]')
      || text.startsWith('[Replay]')
      || text.startsWith('[TTS')
      || text.startsWith('[OpenAI]')
    ) {
      console.log(`[page] ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    const stack = error.stack && error.stack !== error.message ? `\n${error.stack}` : '';
    consoleEntries.push({ type: 'pageerror', text: `${error.message}${stack}` });
  });

  try {
    const url = buildUrl(options);
    console.log(`[capture] opening ${url} at ${options.viewport.width}x${options.viewport.height}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: EXPORT_READY_TIMEOUT_MS });
    await waitForExportBridge(page);

    // Bridge is ready; reset state and prepare frame writer.
    await page.evaluate(() => window.__CHESS_EXPORT__?.reset());
    await page.waitForTimeout(250);

    const frameWriter = new FrameSequenceWriter({
      frameDir: options.frameDir,
      frameRate: DEFAULT_FRAME_RATE,
    });

    const client = await context.newCDPSession(page);
    client.on('Page.screencastFrame', (event) => {
      frameWriter.ingest(event.data, Date.now());
      void client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
    });
    await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: options.fastMode ? SCREENCAST_QUALITY_FAST : SCREENCAST_QUALITY_DEFAULT,
      everyNthFrame: 1,
    });

    const startedAtMs = Date.now();
    frameWriter.start(startedAtMs);
    await page.evaluate(() => window.__CHESS_EXPORT__?.start());
    console.log('[capture] recording started');

    await waitForPlaybackEnd(page, options);
    const endedAtMs = Date.now();
    await page.waitForTimeout(CAPTURE_POSTROLL_MS);
    await client.send('Page.stopScreencast').catch(() => undefined);

    const durationMs = Math.max(1000, endedAtMs - startedAtMs);
    const frameCount = await frameWriter.finalize(durationMs);

    // Read segment timings + recorded audio back out. The bridge
    // populates segmentTimings as commentary plays, and stores the
    // base64-encoded webm audio after BroadcastView's end-of-replay
    // effect calls finalizeRecording().
    const bridgeReadback = (await page
      .evaluate(() => {
        const s = window.__CHESS_EXPORT__?.state();
        return {
          segmentTimings: s?.segmentTimings ?? {},
          recordedAudio: s?.recordedAudio ?? '',
        };
      })
      .catch(() => ({ segmentTimings: {}, recordedAudio: '' }))) ?? {
      segmentTimings: {},
      recordedAudio: '',
    };
    const segmentTimings = bridgeReadback.segmentTimings;
    const recordedAudioBase64 = bridgeReadback.recordedAudio;

    console.log(
      `[capture] captured ${frameCount} frames in ${(durationMs / 1000).toFixed(1)} s, ${
        Object.keys(segmentTimings).length
      } segment timings, ${
        recordedAudioBase64 ? `${Math.round((recordedAudioBase64.length * 3) / 4 / 1024)} KB audio` : 'no audio'
      }`,
    );
    if (Object.keys(segmentTimings).length === 0) {
      console.warn(
        '[capture] no segment timings captured — audio will use planned offsets (may drift); is TTS enabled in the SPA settings?',
      );
    }

    return {
      frameDir: options.frameDir,
      frameCount,
      frameRate: DEFAULT_FRAME_RATE,
      durationMs,
      segmentTimings,
      consoleEntries,
      recordedAudioBase64,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Serialize a TTS export config into a stringified init script that
 * pre-seeds the SPA's zustand persist record before any module loads.
 *
 * Zustand persist stores state under `<persist.name>` (here:
 * `llm-chess-settings`) as a JSON envelope `{ state: {...}, version }`.
 * We only need to set the TTS-specific fields and an `ttsEnabled: true`
 * flag; the rest of the settings fall back to their schema defaults
 * via the migrate function on first hydrate.
 */
function seedTtsSettingsScript(tts: TtsExportConfig): string {
  // OpenAI's API key serves double duty in this project: TTS synthesis
  // AND the commentary LLM. For headless captures we ALWAYS seed both:
  // commentary generation runs through `apiKey` / `providerKeys`, and
  // its output is what gets handed to TTS. Without the LLM key, the
  // CommentaryQueue silently fails to produce text, no audio plays,
  // and the replay races to the end with paceWithNarration unable to
  // catch anything to wait on.
  //
  // Qwen-cloud and local providers don't double for LLM duty; we leave
  // the LLM provider/key empty in those cases (commentary won't run
  // and the audio output will be silent — that's the user's choice).
  const seedLlmFields = tts.provider === 'openai' && tts.apiKey
    ? {
        provider: 'openai',
        apiKey: tts.apiKey,
        providerKeys: { openrouter: '', openai: tts.apiKey },
      }
    : {};
  const payload = {
    state: {
      ttsEnabled: true,
      ttsProvider: tts.provider,
      ttsCloudApiKey: tts.apiKey ?? '',
      ttsCloudVoice: tts.voice ?? (tts.provider === 'openai' ? 'nova' : 'Chelsie'),
      ttsVoice: tts.voice ?? 'default',
      ttsVolume: tts.volume ?? 0.8,
      ttsPort: tts.port ?? 9877,
      ...seedLlmFields,
    },
    version: 8,
  };
  // The init script runs in the page's main world before any module
  // executes. It merges into any existing persisted state so other
  // settings (provider key, model preferences) survive across calls
  // — though in headless Chromium with a fresh profile there's
  // nothing to merge.
  return `
    (function () {
      try {
        const KEY = 'llm-chess-settings';
        const incoming = ${JSON.stringify(payload)};
        const raw = localStorage.getItem(KEY);
        if (raw) {
          try {
            const existing = JSON.parse(raw);
            const merged = {
              state: { ...(existing.state || {}), ...incoming.state },
              version: incoming.version,
            };
            localStorage.setItem(KEY, JSON.stringify(merged));
            console.log('[seed] merged into existing settings (ttsEnabled=' + merged.state.ttsEnabled + ', provider=' + merged.state.ttsProvider + ', hasKey=' + Boolean(merged.state.ttsCloudApiKey) + ')');
          } catch (_e) {
            localStorage.setItem(KEY, JSON.stringify(incoming));
            console.log('[seed] wrote fresh settings after parse error (ttsEnabled=' + incoming.state.ttsEnabled + ')');
          }
        } else {
          localStorage.setItem(KEY, JSON.stringify(incoming));
          console.log('[seed] wrote fresh settings (ttsEnabled=' + incoming.state.ttsEnabled + ', provider=' + incoming.state.ttsProvider + ', hasKey=' + Boolean(incoming.state.ttsCloudApiKey) + ')');
        }
      } catch (e) {
        console.log('[seed] error: ' + (e && e.message));
      }
    })();
  `;
}

function buildUrl(options: CaptureOptions): string {
  const url = new URL(options.serverUrl);
  url.searchParams.set('export', '1');
  url.searchParams.set('broadcast', '1');
  if (options.episodeId) url.searchParams.set('episode', options.episodeId);
  if (options.rawPgn) url.searchParams.set('pgn', options.rawPgn);
  if (options.shortId) url.searchParams.set('shortId', options.shortId);
  if (options.variationId) url.searchParams.set('variationId', options.variationId);
  url.searchParams.set('w', String(options.viewport.width));
  url.searchParams.set('h', String(options.viewport.height));
  return url.toString();
}

async function waitForExportBridge(page: Page): Promise<void> {
  // Steady-state gate: bridge installed, page mounted, painted at
  // least once, audio context ready, replay runtime ready.
  await page.waitForFunction(
    () => {
      const bridge = window.__CHESS_EXPORT__;
      if (!bridge) return false;
      const state = bridge.state();
      return state.ready && state.broadcastMode && state.painted && state.replayReady && state.audioReady;
    },
    undefined,
    { timeout: EXPORT_READY_TIMEOUT_MS },
  );
}

async function waitForPlaybackEnd(page: Page, options: CaptureOptions): Promise<void> {
  if (options.previewDurationMs !== undefined) {
    // Preview mode races a hard cap against the natural end signal.
    const donePromise = page
      .waitForFunction(() => Boolean(window.__CHESS_EXPORT__?.state().ended), undefined, {
        timeout: options.previewDurationMs + 60_000,
      })
      .catch(() => undefined);
    await Promise.race([donePromise, page.waitForTimeout(options.previewDurationMs)]);
    return;
  }
  // Game-review captures: be generous with the timeout. A Morphy
  // game is ~3 minutes of moves but commentary at high reasoning
  // effort can easily push 30 minutes. The default 60-minute ceiling
  // is intentionally large; override via endTimeoutMs.
  const timeout = options.endTimeoutMs ?? 60 * 60_000;
  await page.waitForFunction(
    () => Boolean(window.__CHESS_EXPORT__?.state().ended),
    undefined,
    { timeout },
  );
}

export async function launchBrowser(): Promise<Browser> {
  const args = [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
  ];
  const browser = await chromium.launch({ headless: true, args });
  try {
    const proc = (browser as unknown as { process?: () => { pid?: number } | null }).process?.();
    if (proc?.pid !== undefined) {
      const unregister = registerPid(proc.pid);
      browser.once('disconnected', unregister);
    }
  } catch {
    // chromium-headless-shell sometimes doesn't expose process(); the
    // browser still works, we just lose the tree-kill safety net for
    // the chromium subtree. browser.close() in the orchestrator's
    // finally block remains the primary cleanup.
  }
  return browser;
}

export async function cleanupFrames(frameDir: string, keep: boolean): Promise<void> {
  if (keep) return;
  await rm(frameDir, { recursive: true, force: true });
}

// Augment the window type for TS callers inside page.evaluate().
declare global {
  interface Window {
    __CHESS_EXPORT__?: {
      reset(): void;
      start(): void;
      state(): {
        ready: boolean;
        painted: boolean;
        broadcastMode: boolean;
        replayReady: boolean;
        audioReady: boolean;
        ended: boolean;
        segmentTimings: Record<number, number>;
        renderPlan?: unknown;
        recordedAudio: string;
      };
    };
  }
}
