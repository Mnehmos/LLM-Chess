#!/usr/bin/env node
/**
 * Batch capture the Oracle Trust Calibration openings series.
 *
 * For each registered Track A lesson episode:
 *   1. Long-form in landscape (1920x1080)  → for YouTube long-form upload
 *   2. All 4 variations in portrait (1080x1920) → for vertical / pseudo-Shorts
 *
 * Matches the channel's actual upload pattern (per the 2026-05-21
 * feedback: "horizontal long-form, vertical clips") and halves
 * capture time vs the default dual-orientation render.
 *
 * Output paths land where the existing pipeline writes:
 *   exports/<episode>/<episode>.mp4              landscape long-form
 *   exports/<episode>/<episode>_tight.mp4        dead-air sibling
 *   exports/<episode>/variations/<vid>_portrait.mp4   portrait variations
 *
 * Per-episode wallclock: ~70 min. Five episodes: ~6 hours.
 *
 * Logs to exports/_batch-logs/.
 * Failures in one episode don't halt the batch.
 */

import { spawn } from 'node:child_process';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const EPISODES = [
  'italian_game_lesson',
  'ruy_lopez_lesson',
  'sicilian_najdorf_lesson',
  'french_winawer_lesson',
  'qgd_orthodox_lesson',
];

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), '..');
const logRoot = path.join(repoRoot, 'exports', '_batch-logs');

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const batchStamp = stamp();
const summaryPath = path.join(logRoot, `summary_${batchStamp}.log`);

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  await appendFile(summaryPath, line + '\n').catch(() => {});
}

function runNpmExport(args, logPath) {
  return new Promise(async (resolve) => {
    const fileHandle = logPath;
    // Direct npm.cmd spawn fails with EINVAL on Windows Node 22 — the
    // shim is a batch file, and Node's spawn refuses to execute .cmd
    // without going through a shell. shell:true delegates to cmd.exe,
    // which knows how to resolve npm.cmd from PATH. Args are all
    // alphanumeric + dashes so the shell quoting risk is minimal.
    const child = spawn('npm', ['run', 'export:game', '--', ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
    });
    const onData = (chunk) => {
      // Append to per-job log. Don't block on disk; if it throws, just skip.
      appendFile(fileHandle, chunk).catch(() => {});
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      log(`spawn error: ${err.message}`);
      resolve(1);
    });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main() {
  if (!existsSync(logRoot)) await mkdir(logRoot, { recursive: true });
  await writeFile(summaryPath, '');

  const batchStart = Date.now();
  await log('=== Openings series batch starting ===');
  await log(`Episodes: ${EPISODES.join(', ')}`);

  for (const ep of EPISODES) {
    const epStart = Date.now();

    const longLog = path.join(logRoot, `${ep}_long_${batchStamp}.log`);
    await log(`[${ep}] long-form landscape -> ${path.relative(repoRoot, longLog)}`);
    await writeFile(longLog, '');
    const longCode = await runNpmExport(['--episode', ep, '--landscape-only'], longLog);
    if (longCode !== 0) {
      await log(`[${ep}] long-form FAILED (exit ${longCode}) — continuing to variations`);
    } else {
      await log(`[${ep}] long-form OK`);
    }

    const varLog = path.join(logRoot, `${ep}_variations_${batchStamp}.log`);
    await log(`[${ep}] variations portrait -> ${path.relative(repoRoot, varLog)}`);
    await writeFile(varLog, '');
    const varCode = await runNpmExport(['--episode', ep, '--all-variations', '--portrait-only'], varLog);
    if (varCode !== 0) {
      await log(`[${ep}] variations FAILED (exit ${varCode}) — continuing to next episode`);
    } else {
      await log(`[${ep}] variations OK`);
    }

    const epElapsed = ((Date.now() - epStart) / 1000 / 60).toFixed(1);
    await log(`[${ep}] done in ${epElapsed} min`);
  }

  const batchElapsed = ((Date.now() - batchStart) / 1000 / 60).toFixed(1);
  await log(`=== Batch complete in ${batchElapsed} min ===`);
  await log(`Summary: ${path.relative(repoRoot, summaryPath)}`);
}

main().catch((err) => {
  console.error('[batch] fatal:', err);
  process.exit(1);
});
