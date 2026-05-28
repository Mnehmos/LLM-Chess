#!/usr/bin/env node
/**
 * Sequential capture of London System + King's Indian Defense.
 * Both landscape-only at the new bitrate / multi-modal layout.
 * Estimated wallclock: ~30-40 min total.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args) {
  return new Promise((resolve) => {
    console.log(`\n========== ${args.join(' ')} ==========`);
    const child = spawn('npm', ['run', 'export:game', '--', ...args], {
      cwd: repoRoot, stdio: 'inherit', shell: true, windowsHide: true,
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const episodes = ['london_system_lesson', 'kings_indian_classical_lesson'];
const start = Date.now();
for (const ep of episodes) {
  const t0 = Date.now();
  console.log(`\n[batch] starting ${ep} at ${new Date().toISOString()}`);
  const code = await run(['--episode', ep, '--landscape-only']);
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`[batch] ${ep} ${code === 0 ? 'OK' : 'FAILED (' + code + ')'} in ${mins} min`);
}
console.log(`\n[batch] all done in ${((Date.now() - start) / 60000).toFixed(1)} min`);
