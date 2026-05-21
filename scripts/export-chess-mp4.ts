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
 * Shorts modes:
 *   --short=<id1,id2>      authored move-range clips (Track B)
 *   --all-shorts           every authored short (Track B)
 *   --variation=<id1,id2>  line-variation Shorts (Track A)
 *   --all-variations       every line-variation Short for the episode
 *
 * Orientations (default: both):
 *   <base>.mp4             landscape (1920x1080)
 *   <base>_portrait.mp4    portrait (1080x1920)
 *   --landscape-only       skip the portrait render
 *   --portrait-only        skip the landscape render
 *
 * TTS narration in the final MP4 (Phase 3.1):
 *   Configure via a gitignored `.env` at the repo root, or via env
 *   vars in your shell — env beats .env. See `.env.example` for the
 *   full set of supported keys. Quick start with OpenAI:
 *
 *     CHESS_TTS_PROVIDER=openai
 *     CHESS_OPENAI_API_KEY=sk-...
 *     CHESS_TTS_VOICE=nova
 *
 *   The provider, key, and voice are forwarded into the SPA's
 *   localStorage before boot, so the broadcast replay uses TTS and
 *   paces moves at narration speed. The capture also records the
 *   narration via MediaRecorder and ffmpeg-muxes it into the final
 *   MP4 as AAC.
 *
 *   With no TTS env vars set, the MP4 is silent and the replay
 *   speedruns to checkmate in seconds.
 *
 * Output:
 *   exports/<slug>/<slug>.mp4
 *   exports/<slug>/render-plan.json      (retimed with measured offsets)
 *   exports/<slug>/render-manifest.json  (frame count, durations, console errors)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import { CHESS_EPISODES, DEFAULT_EPISODE_ID, getEpisode } from '../src/episodes';
import type { EpisodeShortClip, VariationShort } from '../src/episodes/types';
import {
  createRenderPlanFromPgn,
  retimeRenderPlanWithSegmentTimings,
  type RenderPlan,
} from '../src/production/renderPlan';
import { shortClipToRenderTarget, SHORTS_VIEWPORT } from '../src/production/clipManifest';
import {
  cleanupFrames,
  launchBrowser,
  recordBroadcastPlayback,
  type TtsExportConfig,
} from './lib/export/browserCapture';
import { startViteServer } from './lib/export/devServer';
import { composeMp4 } from './lib/export/ffmpegCompose';
import { compressDeadAir } from './lib/export/compressDeadAir';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/**
 * Load `.env` from the repo root into process.env. Idempotent — only
 * keys not already set are written. Format is the standard
 *   KEY=value
 *   # comment
 * dialect; values may be wrapped in single or double quotes (which
 * are stripped). Lines without `=` are ignored. No new dependency:
 * the file is small enough to parse by hand.
 *
 * .env is gitignored; .env.example is committed as a template.
 */
function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding single or double quotes; preserve inner content.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Don't clobber an explicitly-set env var — env wins over .env.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Load .env once at module init, before any code reads process.env.
loadDotEnv(path.resolve(repoRoot, '.env'));

/**
 * Resolve TTS config from environment variables (or .env). Returns
 * null when no TTS env var is set (capture produces a silent MP4
 * and speedruns the replay since no narration gate is active).
 *
 *   CHESS_TTS_PROVIDER=openai|qwen-cloud|local
 *   CHESS_TTS_VOICE=<provider-specific>
 *   CHESS_TTS_VOLUME=0..1
 *   CHESS_OPENAI_API_KEY=sk-...
 *   CHESS_QWEN_API_KEY=...
 *   CHESS_TTS_PORT=9877       (local provider only)
 */
function resolveTtsConfigFromEnv(): TtsExportConfig | null {
  const provider = process.env.CHESS_TTS_PROVIDER as TtsExportConfig['provider'] | undefined;
  if (!provider) return null;
  if (provider !== 'openai' && provider !== 'qwen-cloud' && provider !== 'local') {
    throw new Error(
      `CHESS_TTS_PROVIDER must be one of: openai, qwen-cloud, local (got: "${provider}")`,
    );
  }
  const apiKey =
    provider === 'openai'
      ? process.env.CHESS_OPENAI_API_KEY
      : provider === 'qwen-cloud'
        ? process.env.CHESS_QWEN_API_KEY
        : undefined;
  if (provider !== 'local' && !apiKey) {
    throw new Error(
      `CHESS_TTS_PROVIDER=${provider} requires ${
        provider === 'openai' ? 'CHESS_OPENAI_API_KEY' : 'CHESS_QWEN_API_KEY'
      } to be set.`,
    );
  }
  // Catch obvious placeholder values before they reach the SPA. The
  // synthesize() call rejects bad keys silently from the capture's
  // perspective (no audio is recorded, replay speedruns), which is
  // the worst failure mode — fail loud instead.
  if (provider === 'openai' && apiKey && !apiKey.startsWith('sk-')) {
    throw new Error(
      `CHESS_OPENAI_API_KEY does not start with "sk-" (got ${apiKey.length} chars). ` +
        'Looks like you left the .env.example placeholder in place. Paste your real OpenAI key into .env.',
    );
  }
  if (provider !== 'local' && apiKey && apiKey.length < 20) {
    throw new Error(
      `${provider === 'openai' ? 'CHESS_OPENAI_API_KEY' : 'CHESS_QWEN_API_KEY'} is only ${apiKey.length} chars long; that's not a real API key.`,
    );
  }
  const volume = process.env.CHESS_TTS_VOLUME ? Number(process.env.CHESS_TTS_VOLUME) : undefined;
  const port = process.env.CHESS_TTS_PORT ? Number(process.env.CHESS_TTS_PORT) : undefined;
  return {
    provider,
    apiKey,
    voice: process.env.CHESS_TTS_VOICE,
    volume: volume && Number.isFinite(volume) ? volume : undefined,
    port: port && Number.isFinite(port) ? port : undefined,
  };
}

interface CliFlags {
  pgnPath: string | null;
  episodeId: string | null;
  fastMode: boolean;
  previewDurationMs: number | null;
  keepFrames: boolean;
  outputRoot: string;
  /** When set, capture only these specific authored shorts (and skip full). */
  shortIds: string[];
  /** When true, capture every authored short (and skip full). */
  allShorts: boolean;
  /** When set, capture only these specific variations (and skip full). */
  variationIds: string[];
  /** When true, capture every line-variation Short (and skip full). */
  allVariations: boolean;
  /**
   * Which orientations to render. Default: both (every PGN run produces
   * a 1920x1080 landscape MP4 AND a 1080x1920 portrait MP4). Pass
   * --landscape-only / --portrait-only to skip one.
   */
  renderLandscape: boolean;
  renderPortrait: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    pgnPath: null,
    episodeId: null,
    fastMode: false,
    previewDurationMs: null,
    keepFrames: false,
    outputRoot: 'exports',
    shortIds: [],
    allShorts: false,
    variationIds: [],
    allVariations: false,
    renderLandscape: true,
    renderPortrait: true,
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
    else if (arg === '--all-shorts') flags.allShorts = true;
    else if (arg === '--short' || arg === '--shorts') {
      const value = argv[i + 1];
      if (value) flags.shortIds.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--short=') || arg.startsWith('--shorts=')) {
      const value = arg.slice(arg.indexOf('=') + 1);
      if (value) flags.shortIds.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    }
    else if (arg === '--all-variations') flags.allVariations = true;
    else if (arg === '--variation' || arg === '--variations') {
      const value = argv[i + 1];
      if (value) flags.variationIds.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg.startsWith('--variation=') || arg.startsWith('--variations=')) {
      const value = arg.slice(arg.indexOf('=') + 1);
      if (value) flags.variationIds.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    }
    else if (arg === '--landscape-only') flags.renderPortrait = false;
    else if (arg === '--portrait-only') flags.renderLandscape = false;
  }
  if (!flags.renderLandscape && !flags.renderPortrait) {
    throw new Error('--landscape-only and --portrait-only are mutually exclusive.');
  }
  return flags;
}

interface ResolvedInput {
  pgnText: string;
  title: string;
  slug: string;
  episodeId?: string;
  /** Authored shorts available for this input. Empty for raw-PGN inputs. */
  authoredShorts: EpisodeShortClip[];
  /** Line-variation Shorts available for this input. Empty for raw-PGN inputs. */
  variations: VariationShort[];
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
      authoredShorts: [],
      variations: [],
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
    authoredShorts: episode.exports?.shorts ?? [],
    variations: episode.exports?.variations ?? [],
  };
}

/**
 * Filter the authored-shorts list according to CLI flags.
 *
 *   --all-shorts          → include every authored short, skip full
 *   --short=<id1,id2>     → include only the named clips, skip full
 *   (neither)             → no shorts captured; full only
 *
 * Returns `{ shorts, skipFull }`. Throws on unknown clip ids.
 */
function selectShorts(
  flags: CliFlags,
  authored: EpisodeShortClip[],
): { shorts: EpisodeShortClip[]; skipFull: boolean } {
  if (!flags.allShorts && flags.shortIds.length === 0) {
    return { shorts: [], skipFull: false };
  }
  if (authored.length === 0) {
    throw new Error(
      '--short / --all-shorts was requested but the resolved input has no authored shorts.',
    );
  }
  if (flags.allShorts) {
    return { shorts: [...authored], skipFull: true };
  }
  const known = new Map(authored.map((s) => [s.id, s]));
  const missing = flags.shortIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(
      `--short referenced unknown clip id(s): ${missing.join(', ')}. Available: ${[...known.keys()].join(
        ', ',
      )}`,
    );
  }
  return {
    shorts: flags.shortIds.map((id) => known.get(id) as EpisodeShortClip),
    skipFull: true,
  };
}

/**
 * Filter the variations list according to CLI flags.
 *
 *   --all-variations          → include every variation, skip full
 *   --variation=<id1,id2>     → include only the named variations, skip full
 *   (neither)                 → no variations captured
 *
 * Returns `{ variations, skipFull }`. Throws on unknown variation ids.
 */
function selectVariations(
  flags: CliFlags,
  available: VariationShort[],
): { variations: VariationShort[]; skipFull: boolean } {
  if (!flags.allVariations && flags.variationIds.length === 0) {
    return { variations: [], skipFull: false };
  }
  if (available.length === 0) {
    throw new Error(
      '--variation / --all-variations was requested but the resolved input has no variation shorts.',
    );
  }
  if (flags.allVariations) {
    return { variations: [...available], skipFull: true };
  }
  const known = new Map(available.map((v) => [v.id, v]));
  const missing = flags.variationIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(
      `--variation referenced unknown id(s): ${missing.join(', ')}. Available: ${[...known.keys()].join(
        ', ',
      )}`,
    );
  }
  return {
    variations: flags.variationIds.map((id) => known.get(id) as VariationShort),
    skipFull: true,
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
  // Phase 4: select shorts based on CLI flags.
  const shortsSelection = selectShorts(flags, input.authoredShorts);
  const variationsSelection = selectVariations(flags, input.variations);
  const selectedShorts = shortsSelection.shorts;
  const selectedVariations = variationsSelection.variations;
  const skipFull = shortsSelection.skipFull || variationsSelection.skipFull;

  // Working dirs.
  const outDir = path.resolve(repoRoot, flags.outputRoot, slug);
  await mkdir(outDir, { recursive: true });

  console.log(`[export] ${input.title}`);
  console.log(
    `[export]   ${initialPlan.fullEpisode.timeline.length} segments, planned ${(initialPlan.fullEpisode.range.endMs / 1000).toFixed(1)} s, viewport ${viewport.width}x${viewport.height}`,
  );
  if (flags.fastMode) console.log('[export]   --fast (lower JPEG quality)');
  if (flags.previewDurationMs) console.log(`[export]   --preview=${flags.previewDurationMs / 1000} s`);
  if (skipFull) {
    const tags = [
      ...selectedShorts.map((s) => `short:${s.id}`),
      ...selectedVariations.map((v) => `variation:${v.id}`),
    ];
    console.log(`[export]   shorts mode: ${tags.join(', ')}`);
  } else {
    if (input.authoredShorts.length > 0) {
      console.log(
        `[export]   ${input.authoredShorts.length} authored short(s) available (skipped; pass --all-shorts to include)`,
      );
    }
    if (input.variations.length > 0) {
      console.log(
        `[export]   ${input.variations.length} variation short(s) available (skipped; pass --all-variations to include)`,
      );
    }
  }

  // Phase 3.1: resolve TTS config from env. Without TTS the capture
  // produces a silent MP4 and the replay speedruns (no narration gate
  // to pace move advancement). With TTS, narration is recorded via
  // MediaRecorder in the SPA and muxed into the MP4 here.
  const ttsConfig = resolveTtsConfigFromEnv();
  if (ttsConfig) {
    console.log(
      `[export]   TTS: ${ttsConfig.provider}${ttsConfig.voice ? ` voice=${ttsConfig.voice}` : ''}`,
    );
  } else {
    console.log(
      '[export]   TTS: disabled (set CHESS_TTS_PROVIDER + key to enable; otherwise replay speedruns and MP4 is silent)',
    );
  }

  let server: Awaited<ReturnType<typeof startViteServer>> | undefined;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  const frameDirs: string[] = [];
  try {
    server = await startViteServer(repoRoot, '127.0.0.1', 5173);
    console.log(`[export] vite ready at ${server.url}`);
    browser = await launchBrowser();
    console.log('[export] chromium launched');

    // Targets array. The orchestrator captures them sequentially with
    // a fresh browser context per target — parallel capture is a
    // follow-up (Clio pattern); chess captures are short enough that
    // serial is acceptable for Phase 4.
    interface CaptureJob {
      label: string;
      shortId?: string;
      variationId?: string;
      orientation: 'landscape' | 'portrait';
      viewport: { width: number; height: number; deviceScaleFactor?: number };
      outputPath: string;
    }

    // Channel content standard ([PR #54](github)): every logical video
    // ships in BOTH landscape (1920×1080 for long-form / web) and
    // portrait (1080×1920 for mobile / pseudo-Shorts). One PGN run per
    // orientation. Toggle with --landscape-only / --portrait-only.
    //
    // Naming convention (consistent across all kinds):
    //   <base>.mp4           landscape (no suffix)
    //   <base>_portrait.mp4  portrait
    //   <base>_tight.mp4     dead-air-compressed landscape sibling
    //   <base>_portrait_tight.mp4  dead-air-compressed portrait sibling
    const LANDSCAPE_VIEWPORT = {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    };
    const PORTRAIT_VIEWPORT = {
      width: SHORTS_VIEWPORT.width,
      height: SHORTS_VIEWPORT.height,
      deviceScaleFactor: SHORTS_VIEWPORT.deviceScaleFactor ?? 1,
    };

    function withPortraitSuffix(outputPath: string): string {
      return outputPath.replace(/\.mp4$/, '_portrait.mp4');
    }
    function expandOrientations(
      base: Omit<CaptureJob, 'orientation' | 'viewport' | 'outputPath'> & { outputPath: string },
    ): CaptureJob[] {
      const out: CaptureJob[] = [];
      if (flags.renderLandscape) {
        out.push({
          ...base,
          orientation: 'landscape',
          viewport: LANDSCAPE_VIEWPORT,
          outputPath: base.outputPath,
        });
      }
      if (flags.renderPortrait) {
        out.push({
          ...base,
          orientation: 'portrait',
          viewport: PORTRAIT_VIEWPORT,
          outputPath: withPortraitSuffix(base.outputPath),
        });
      }
      return out;
    }

    const jobs: CaptureJob[] = [];
    if (!skipFull) {
      let outputPath = path.resolve(repoRoot, initialPlan.fullEpisode.outputPath);
      if (flags.previewDurationMs) outputPath = outputPath.replace(/\.mp4$/, '_preview.mp4');
      jobs.push(...expandOrientations({ label: 'full', outputPath }));
    }
    for (const clip of selectedShorts) {
      const shortTarget = shortClipToRenderTarget({
        clip,
        episodeSlug: slug,
        outputRoot: flags.outputRoot,
        timing: initialPlan.timing,
        fullTimeline: initialPlan.fullEpisode.timeline,
      });
      jobs.push(
        ...expandOrientations({
          label: `short:${clip.id}`,
          shortId: clip.id,
          outputPath: path.resolve(repoRoot, shortTarget.outputPath),
        }),
      );
    }
    for (const variation of selectedVariations) {
      jobs.push(
        ...expandOrientations({
          label: `variation:${variation.id}`,
          variationId: variation.id,
          outputPath: path.resolve(
            repoRoot,
            flags.outputRoot,
            slug,
            'variations',
            `${variation.id}.mp4`,
          ),
        }),
      );
    }

    const captures: Array<{
      job: CaptureJob;
      segmentTimings: Record<number, number>;
      durationMs: number;
      frameCount: number;
      audioBytes: number;
      tightOutputPath?: string;
      compressedRemovedS: number;
    }> = [];
    for (const job of jobs) {
      // Sanitize job.label for use as a Windows directory name —
      // `short:opera_game_setup` breaks mkdir because `:` is reserved.
      // Append orientation so dual-orientation jobs get distinct dirs
      // even if the logical label is the same.
      const safeLabel = `${job.label}-${job.orientation}`.replace(/[:/\\?*"<>|]/g, '_');
      const frameDir = path.resolve(
        repoRoot,
        '.tmp',
        'export-frames',
        `${slug}-${safeLabel}-${Date.now().toString(36)}`,
      );
      frameDirs.push(frameDir);
      // Ensure the job's output directory exists. Variation jobs land
      // in <slug>/variations/ which may not exist yet on first run.
      await mkdir(path.dirname(job.outputPath), { recursive: true });
      console.log(`[export] capturing ${job.label} ${job.orientation} (${job.viewport.width}x${job.viewport.height})`);
      const capture = await recordBroadcastPlayback(browser, {
        serverUrl: server.url,
        episodeId: input.episodeId,
        rawPgn: input.episodeId ? undefined : input.pgnText,
        shortId: job.shortId,
        variationId: job.variationId,
        frameDir,
        viewport: job.viewport,
        fastMode: flags.fastMode,
        previewDurationMs: flags.previewDurationMs ?? undefined,
        ttsConfig: ttsConfig ?? undefined,
      });

      // Write recorded narration audio to the per-job frame dir so it's
      // cleaned up alongside the frames. ffmpeg reads it as a second
      // input and re-encodes to AAC. Skip when nothing was recorded.
      let audioPath: string | undefined;
      let audioBytes = 0;
      if (capture.recordedAudioBase64) {
        const audioBuffer = Buffer.from(capture.recordedAudioBase64, 'base64');
        audioBytes = audioBuffer.length;
        audioPath = path.join(frameDir, 'narration.webm');
        await writeFile(audioPath, audioBuffer);
      }

      await composeMp4({
        frameDir: capture.frameDir,
        frameRate: capture.frameRate,
        outputPath: job.outputPath,
        ffmpegPath,
        audioPath,
      });

      // Dead-air compression. The narration recording is full of
      // multi-second silences between moves (the commentator LLM is
      // generating the next move's text while the previous TTS clip
      // has already finished). Detecting + trimming those silences
      // typically cuts 30-50% off the video duration without losing
      // any narrated content. Only runs when there's an audio track
      // to analyze — silent MP4s pass through unchanged.
      let tightOutputPath: string | undefined;
      let compressedRemovedS = 0;
      if (audioPath && audioBytes > 0) {
        tightOutputPath = job.outputPath.replace(/\.mp4$/, '_tight.mp4');
        try {
          const result = await compressDeadAir({
            inputPath: job.outputPath,
            outputPath: tightOutputPath,
            ffmpegPath,
          });
          compressedRemovedS = result.removedS;
          console.log(
            `[dead-air] ${path.basename(job.outputPath)}: ${result.inputDurationS.toFixed(1)}s → ${result.outputDurationS.toFixed(1)}s (removed ${result.removedS.toFixed(1)}s, ${result.silenceRanges.length} silence ranges)`,
          );
        } catch (err) {
          console.warn(
            `[dead-air] compression failed for ${path.basename(job.outputPath)}: ${err instanceof Error ? err.message : String(err)}. The uncompressed MP4 is still usable.`,
          );
          tightOutputPath = undefined;
        }
      }

      captures.push({
        job,
        segmentTimings: capture.segmentTimings,
        durationMs: capture.durationMs,
        frameCount: capture.frameCount,
        audioBytes,
        tightOutputPath,
        compressedRemovedS,
      });
      console.log(`[export] wrote ${path.relative(repoRoot, job.outputPath)}`);
      if (tightOutputPath) {
        console.log(`[export] wrote ${path.relative(repoRoot, tightOutputPath)} (dead air removed)`);
      }
    }

    // Use the FULL landscape capture's timings (if present) for retiming.
    // Short captures only cover a slice of the game and would produce a
    // partial offsets map; portrait captures of the same logical content
    // have their own timings but landscape is the canonical reference.
    const retimeSource =
      captures.find((c) => c.job.label === 'full' && c.job.orientation === 'landscape') ??
      captures.find((c) => c.job.label === 'full');
    const retimedPlan = retimeSource
      ? retimeRenderPlanWithSegmentTimings(initialPlan, retimeSource.segmentTimings)
      : initialPlan;

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
          fastMode: flags.fastMode,
          previewDurationMs: flags.previewDurationMs,
          ttsProvider: ttsConfig?.provider ?? null,
          captures: captures.map((c) => ({
            label: c.job.label,
            shortId: c.job.shortId,
            variationId: c.job.variationId,
            orientation: c.job.orientation,
            outputPath: path.relative(repoRoot, c.job.outputPath),
            tightOutputPath: c.tightOutputPath ? path.relative(repoRoot, c.tightOutputPath) : undefined,
            compressedRemovedS: c.compressedRemovedS,
            viewport: c.job.viewport,
            frameCount: c.frameCount,
            durationMs: c.durationMs,
            segmentTimingsCount: Object.keys(c.segmentTimings).length,
            audioBytes: c.audioBytes,
          })),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    console.log(`[export] wrote ${path.relative(repoRoot, path.join(outDir, 'render-plan.json'))}`);
    console.log(`[export] wrote ${path.relative(repoRoot, path.join(outDir, 'render-manifest.json'))}`);
  } finally {
    await Promise.allSettled([
      browser?.close(),
      server?.stop(),
      ...frameDirs.map((dir) => cleanupFrames(dir, flags.keepFrames)),
    ]);
  }
}

main().catch((err) => {
  console.error('[export] failed:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
