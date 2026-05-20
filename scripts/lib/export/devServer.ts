/**
 * Spawn Vite directly so tree-kill works on Windows.
 *
 * `npm run dev` wraps Vite in npm.cmd → node, which on Windows
 * orphans children when the parent is killed. Spawning vite.js
 * directly via Node keeps the process tree under our control so
 * Ctrl+C / signal handlers can clean up reliably.
 *
 * Adapted from Clio's scripts/lib/export/devServer.ts with a
 * narrower surface — we only need a single instance per export run.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { registerPid } from './processRegistry';

export interface ViteServer {
  url: string;
  port: number;
  host: string;
  stop: () => Promise<void>;
}

/**
 * Resolve the local Vite entry script via createRequire so we
 * launch the workspace's exact version, not whatever's on PATH.
 */
function resolveViteBin(cwd: string): string {
  const require = createRequire(path.join(cwd, 'package.json'));
  // Vite ships its CLI entry as bin/vite.js. The package.json `bin`
  // field maps "vite" → "bin/vite.js"; resolving the package then
  // joining is more robust than relying on `require.resolve('vite/bin/vite.js')`
  // which fails when the host project has a different export map.
  const vitePkg = require.resolve('vite/package.json');
  return path.join(path.dirname(vitePkg), 'bin', 'vite.js');
}

export async function startViteServer(
  cwd: string,
  host: string,
  port: number,
): Promise<ViteServer> {
  const viteBin = resolveViteBin(cwd);
  const args = [viteBin, '--host', host, '--port', String(port), '--strictPort'];

  const child = spawn(process.execPath, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
    windowsHide: true,
  });

  if (child.pid !== undefined) {
    const unregister = registerPid(child.pid);
    child.once('exit', unregister);
  }

  const url = await waitForViteReady(child, host, port);
  return {
    url,
    port,
    host,
    stop: () => stopProcess(child),
  };
}

function waitForViteReady(child: ChildProcess, host: string, port: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const READY_TIMEOUT_MS = 120_000;
    const startedAt = Date.now();
    let resolved = false;
    let buffered = '';

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      reject(new Error(`Vite did not become ready within ${READY_TIMEOUT_MS} ms\n--- output ---\n${buffered.slice(-2000)}`));
    }, READY_TIMEOUT_MS);

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buffered += text;
      if (resolved) return;
      // Vite prints "Local:   http://localhost:5173/" once ready, but
      // the line is colored — strip ANSI escape codes before matching.
      // Use the standard ANSI CSI / OSC sequence pattern.
      // eslint-disable-next-line no-control-regex
      const clean = buffered.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
      if (/Local:\s+http/i.test(clean)) {
        resolved = true;
        clearTimeout(timer);
        resolve(`http://${host}:${port}`);
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      reject(
        new Error(
          `Vite exited with code ${code} before becoming ready after ${Date.now() - startedAt} ms\n--- output ---\n${buffered.slice(-2000)}`,
        ),
      );
    });
  });
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    // On Windows, kill the whole tree via taskkill — sending SIGTERM
    // to a Node child sometimes leaves Vite's esbuild service alive.
    if (process.platform === 'win32' && child.pid !== undefined) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      }).on('exit', () => resolve());
    } else {
      child.kill('SIGTERM');
      // Backstop: SIGKILL after a second if it hasn't exited.
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 1000);
    }
  });
}
