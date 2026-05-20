/**
 * scripts/export-chess-mp4.ts — produce a playable MP4 of any
 * registered episode (or inline PGN) via headless-Chromium capture.
 *
 * Usage:
 *   npm run export:game                                 # default episode
 *   npm run export:game -- --episode opera_game_morphy_1858
 *   npm run export:game -- --pgn matches/some.pgn
 *   npm run export:game -- --episode <id> --fast
 *   npm run export:game -- --episode <id> --preview=30
 *   npm run export:game -- --episode <id> --keep-frames
 *
 * Output:
 *   exports/<slug>/<slug>.mp4
 *   exports/<slug>/render-plan.json      (retimed with measured offsets)
 *   exports/<slug>/render-manifest.json  (frame count, durations, console errors)
 *
 * Phase 3 produces a SILENT mp4. Audio mux lands as a Phase 3.1
 * follow-up — the SPA plays TTS live during capture, but CDP
 * screencast does not capture audio. The render-plan.json + segment
 * timings preserve everything the audio composition step needs.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import { CHESS_EPISODES, DEFAULT_EPISODE_ID, getEpisode } from '../src/episodes';
import {
  createRenderPlanFromPgn,
  retimeRenderPlanWithSegmentTimings,
  type RenderPlan,
} from '../src/production/renderPlan';
import {
  cleanupFrames,
  launchBrowser,
  recordBroadcastPlayback,
} from './lib/export/browserCapture';
import { startViteServer } from './lib/export/devServer';
import { composeMp4 } from './lib/export/ffmpegCompose';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

interface CliFlags {
  pgnPath: string | null;
  episodeId: string | null;
  fastMode: boolean;
  previewDurationMs: number | null;
  keepFrames: boolean;
  outputRoot: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    pgnPath: null,
    episodeId: null,
    fastMode: false,
    previewDurationMs: null,
    keepFrames: false,
    outputRoot: 'exports',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pgn') flags.pgnPath = argv[i + 1] ?? null;
    else if (arg.startsWith('--pgn=')) flags.pgnPath = arg.slice('--pgn='.length);
    else if (arg === '--episode') flags.episodeId = argv[i + 1] ?? null;
    else if (arg.startsWith('--episode=')) flags.episodeId = arg.slice('--episode='.length);
    else if (arg === '--fast') flags.fastMode = true;
    else if (arg.startsWith('--preview=')) {
      const sec = Number(arg.slice('--preview='.length));
      if (Number.isFinite(sec) && sec > 0) flags.previewDurationMs = Math.round(sec * 1000);
    } else if (arg === '--preview') {
      const sec = Number(argv[i + 1]);
      if (Number.isFinite(sec) && sec > 0) flags.previewDurationMs = Math.round(sec * 1000);
    } else if (arg === '--keep-frames') flags.keepFrames = true;
    else if (arg.startsWith('--output-root=')) flags.outputRoot = arg.slice('--output-root='.length);
  }
  return flags;
}

interface ResolvedInput {
  pgnText: string;
  title: string;
  slug: string;
  episodeId?: string;
}

async function resolveInput(flags: CliFlags): Promise<ResolvedInput> {
  if (flags.pgnPath) {
    const absolute = path.resolve(repoRoot, flags.pgnPath);
    const pgnText = await readFile(absolute, 'utf8');
    const base = path.basename(absolute, path.extname(absolute));
    return {
      pgnText,
      title: base,
      slug: base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
    };
  }
  const id = flags.episodeId ?? DEFAULT_EPISODE_ID;
  if (!id) {
    throw new Error(
      `No --pgn or --episode supplied and no default episode is registered. Available:\n  ${
        CHESS_EPISODES.map((e) => e.id).join('\n  ') || '(none)'
      }`,
    );
  }
  const episode = getEpisode(id);
  if (!episode) {
    throw new Error(
      `Unknown episode id "${id}". Available:\n  ${CHESS_EPISODES.map((e) => e.id).join('\n  ') || '(none)'}`,
    );
  }
  return {
    pgnText: episode.pgn,
    title: episode.title,
    slug: episode.id,
    episodeId: episode.id,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const ffmpegPath = ffmpegStatic;
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not resolve a binary path');
  }
  const input = await resolveInput(flags);
  const slug = input.slug;
  const createdAt = new Date().toISOString();

  // Initial plan — planned durations only. Retimed after capture.
  const initialPlan: RenderPlan = createRenderPlanFromPgn({
    id: input.episodeId ?? `pgn:${slug}`,
    runId: `run:${slug}:${createdAt}`,
    title: input.title,
    pgn: input.pgnText,
    episodeId: input.episodeId,
    createdAt,
    outputRoot: flags.outputRoot,
  });
  const viewport = {
    width: initialPlan.fullEpisode.viewport.width,
    height: initialPlan.fullEpisode.viewport.height,
    deviceScaleFactor: initialPlan.fullEpisode.viewport.deviceScaleFactor ?? 1,
  };

  // Working dirs.
  const outDir = path.resolve(repoRoot, flags.outputRoot, slug);
  const frameDir = path.resolve(repoRoot, '.tmp', 'export-frames', `${slug}-${Date.now().toString(36)}`);
  await mkdir(outDir, { recursive: true });

  console.log(`[export] ${input.title}`);
  console.log(
    `[export]   ${initialPlan.fullEpisode.timeline.length} segments, planned ${(initialPlan.fullEpisode.range.endMs / 1000).toFixed(1)} s, viewport ${viewport.width}x${viewport.height}`,
  );
  if (flags.fastMode) console.log('[export]   --fast (lower JPEG quality)');
  if (flags.previewDurationMs) console.log(`[export]   --preview=${flags.previewDurationMs / 1000} s`);

  let server: Awaited<ReturnType<typeof startViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    server = await startViteServer(repoRoot, '127.0.0.1', 5173);
    console.log(`[export] vite ready at ${server.url}`);
    browser = await launchBrowser();
    console.log('[export] chromium launched');

    const capture = await recordBroadcastPlayback(browser, {
      serverUrl: server.url,
      episodeId: input.episodeId,
      rawPgn: input.episodeId ? undefined : input.pgnText,
      frameDir,
      viewport,
      fastMode: flags.fastMode,
      previewDurationMs: flags.previewDurationMs ?? undefined,
    });

    const retimedPlan = retimeRenderPlanWithSegmentTimings(initialPlan, capture.segmentTimings);
    let outputPath = path.resolve(repoRoot, retimedPlan.fullEpisode.outputPath);
    if (flags.previewDurationMs) {
      outputPath = outputPath.replace(/\.mp4$/, '_preview.mp4');
    }

    await composeMp4({
      frameDir: capture.frameDir,
      frameRate: capture.frameRate,
      outputPath,
      ffmpegPath,
    });

    // Sidecar manifests.
    await writeFile(
      path.join(outDir, 'render-plan.json'),
      `${JSON.stringify(retimedPlan, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(outDir, 'render-manifest.json'),
      `${JSON.stringify(
        {
          slug,
          title: input.title,
          episodeId: input.episodeId,
          createdAt,
          outputPath: path.relative(repoRoot, outputPath),
          fastMode: flags.fastMode,
          previewDurationMs: flags.previewDurationMs,
          capture: {
            frameCount: capture.frameCount,
            frameRate: capture.frameRate,
            durationMs: capture.durationMs,
            segmentTimingsCount: Object.keys(capture.segmentTimings).length,
          },
          consoleEntries: capture.consoleEntries.slice(-30),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    console.log(`[export] wrote ${path.relative(repoRoot, outputPath)}`);
    console.log(`[export] wrote ${path.relative(repoRoot, path.join(outDir, 'render-plan.json'))}`);
    console.log(`[export] wrote ${path.relative(repoRoot, path.join(outDir, 'render-manifest.json'))}`);
  } finally {
    await Promise.allSettled([
      browser?.close(),
      server?.stop(),
      cleanupFrames(frameDir, flags.keepFrames),
    ]);
  }
}

main().catch((err) => {
  console.error('[export] failed:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
