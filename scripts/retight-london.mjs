#!/usr/bin/env node
// One-shot: re-run the dead-air-compression step on the existing London full mp4.
// The original batch died mid-tight-encode with exit 127; the full mp4 is intact.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = [
  'tsx',
  path.join('scripts', 'retight-london.ts'),
];
const child = spawn('npx', args, { cwd: repoRoot, stdio: 'inherit', shell: true, windowsHide: true });
child.on('exit', (code) => process.exit(code ?? 1));
