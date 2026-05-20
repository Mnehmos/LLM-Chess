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
const SCREENCAST_QUALITY_DEFAULT = 84;
const SCREENCAST_QUALITY_FAST = 60;
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
  const page = await context.newPage();
  const consoleEntries: BrowserConsoleEntry[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleEntries.push({ type: message.type(), text: message.text() });
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

    // Read segment timings + render plan diagnostic back out.
    const segmentTimings =
      (await page
        .evaluate(() => window.__CHESS_EXPORT__?.state().segmentTimings ?? {})
        .catch(() => ({}))) ?? {};

    console.log(
      `[capture] captured ${frameCount} frames in ${(durationMs / 1000).toFixed(1)} s, ${
        Object.keys(segmentTimings).length
      } segment timings`,
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
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function buildUrl(options: CaptureOptions): string {
  const url = new URL(options.serverUrl);
  url.searchParams.set('export', '1');
  url.searchParams.set('broadcast', '1');
  if (options.episodeId) url.searchParams.set('episode', options.episodeId);
  if (options.rawPgn) url.searchParams.set('pgn', options.rawPgn);
  if (options.shortId) url.searchParams.set('shortId', options.shortId);
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
      };
    };
  }
}
