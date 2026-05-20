/**
 * Tracks PIDs of long-running children (Vite, Chromium, ffmpeg) so
 * the export script's signal handlers can tree-kill them on Ctrl+C.
 *
 * On Windows, killing a Node child with SIGTERM doesn't propagate to
 * grandchildren (esbuild, chromium renderers, etc.) — they orphan.
 * The signal handlers walk the registry and call `taskkill /t /f`.
 *
 * Mirrors Clio's scripts/lib/export/processRegistry.ts narrowly:
 * just the PID set, the register/unregister API, and the signal
 * handlers. No watchdog, no idle-timeout, no per-process metadata.
 */

import { spawnSync } from 'node:child_process';

const tracked = new Set<number>();
let handlersInstalled = false;

/**
 * Register a PID. Returns an unregister function to call when the
 * process exits normally. Idempotent.
 */
export function registerPid(pid: number): () => void {
  tracked.add(pid);
  installHandlersOnce();
  return () => {
    tracked.delete(pid);
  };
}

/** Kill all tracked PIDs immediately (best-effort tree-kill). */
export function killAllTracked(): void {
  for (const pid of tracked) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      // Process may already be dead; ignore.
    }
  }
  tracked.clear();
}

function installHandlersOnce(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  // SIGINT (Ctrl+C) and SIGTERM (graceful kill from a parent) both
  // route through the same cleanup. The handler is synchronous —
  // async cleanup is unreliable from signal handlers, and taskkill
  // /f is effectively synchronous anyway.
  const handle = (signal: NodeJS.Signals): void => {
    killAllTracked();
    // Re-raise so the default behaviour (exit) still happens.
    process.kill(process.pid, signal);
  };
  process.once('SIGINT', () => handle('SIGINT'));
  process.once('SIGTERM', () => handle('SIGTERM'));
  // uncaughtException keeps the cleanup running on a programming
  // error — without it, Vite/Chromium orphan when the script throws.
  process.once('uncaughtException', (err) => {
    console.error('[export] uncaught exception, cleaning up children');
    console.error(err);
    killAllTracked();
    process.exit(1);
  });
}
