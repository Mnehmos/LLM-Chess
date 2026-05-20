/**
 * scripts/export-render-plan.ts — write a render plan JSON for a PGN
 * or registered episode. Useful for inspecting the plan that the
 * Phase 3 capture pipeline will execute, and as a smoke test that
 * createRenderPlanFromPgn handles a given source cleanly.
 *
 * Usage:
 *   npm run plan:game -- --episode <episode-id>
 *   npm run plan:game -- --pgn <path/to/file.pgn>
 *   npm run plan:game -- --pgn <path> --out exports/<slug>/render-plan.json
 *
 * If neither --episode nor --pgn is supplied, defaults to
 * DEFAULT_EPISODE_ID from src/episodes.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHESS_EPISODES, DEFAULT_EPISODE_ID, getEpisode } from '../src/episodes';
import { createRenderPlanFromPgn, type RenderPlan } from '../src/production/renderPlan';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

interface CliFlags {
  pgnPath: string | null;
  episodeId: string | null;
  outPath: string | null;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { pgnPath: null, episodeId: null, outPath: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pgn') flags.pgnPath = argv[i + 1] ?? null;
    else if (arg.startsWith('--pgn=')) flags.pgnPath = arg.slice('--pgn='.length);
    else if (arg === '--episode') flags.episodeId = argv[i + 1] ?? null;
    else if (arg.startsWith('--episode=')) flags.episodeId = arg.slice('--episode='.length);
    else if (arg === '--out') flags.outPath = argv[i + 1] ?? null;
    else if (arg.startsWith('--out=')) flags.outPath = arg.slice('--out='.length);
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  let pgnText: string;
  let title: string;
  let episodeId: string | undefined;
  let slug: string;

  if (flags.pgnPath) {
    const absolute = path.resolve(repoRoot, flags.pgnPath);
    pgnText = await readFile(absolute, 'utf8');
    const base = path.basename(absolute, path.extname(absolute));
    title = base;
    slug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  } else {
    const id = flags.episodeId ?? DEFAULT_EPISODE_ID;
    if (!id) {
      console.error(
        `No --pgn or --episode supplied and no default episode is registered. Available episodes:\n  ${
          CHESS_EPISODES.map((e) => e.id).join('\n  ') || '(none)'
        }`,
      );
      process.exit(1);
    }
    const episode = getEpisode(id);
    if (!episode) {
      console.error(
        `Unknown episode id "${id}". Available episodes:\n  ${
          CHESS_EPISODES.map((e) => e.id).join('\n  ') || '(none)'
        }`,
      );
      process.exit(1);
    }
    pgnText = episode.pgn;
    title = episode.title;
    episodeId = episode.id;
    slug = episode.id;
  }

  const createdAt = new Date().toISOString();
  const plan: RenderPlan = createRenderPlanFromPgn({
    id: episodeId ?? `pgn:${slug}`,
    runId: `run:${slug}:${createdAt}`,
    title,
    pgn: pgnText,
    episodeId,
    createdAt,
    outputRoot: 'exports',
  });

  const outPath = flags.outPath
    ? path.resolve(repoRoot, flags.outPath)
    : path.resolve(repoRoot, 'exports', slug, 'render-plan.json');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  const moveCount = plan.fullEpisode.timeline.filter((t) => t.kind === 'move').length;
  const commentaryCount = plan.fullEpisode.timeline.filter((t) => t.kind === 'commentary').length;
  const totalSeconds = plan.fullEpisode.range.endMs / 1000;
  console.log(`[plan] ${title}`);
  console.log(`[plan]   ${moveCount} moves, ${commentaryCount} commentary slots`);
  console.log(`[plan]   planned duration: ${totalSeconds.toFixed(1)}s`);
  console.log(`[plan]   wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
