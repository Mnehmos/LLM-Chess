import { spawn, type SpawnOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// Windows needs shell:true to resolve .cmd scripts (npm global installs).
const SPAWN_OPTS: SpawnOptions = process.platform === 'win32' ? { shell: true } : {};

interface BridgeChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface BridgeChatRequest {
  model: string;
  messages: BridgeChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: string;
}

interface CodexExecResult {
  content: string;
  tokensUsed?: number;
  durationMs: number;
}

interface CodexLoginStatus {
  loggedIn: boolean;
  statusText: string;
}

interface CodexCommandInfo {
  command: string;
  source: string;
}

let cachedVersion: string | null = null;
let cachedVersionAt = 0;
let cachedCommandInfo: CodexCommandInfo | null = null;
let cachedCommandAt = 0;
let lastCodexLookupError = 'Codex binary not resolved';
const LOCAL_PUZZLE_CATALOG_ROUTE = '/data/lichess-puzzles-1500-plus.json';
const LOCAL_PUZZLE_CATALOG_PATH = path.join(process.cwd(), 'public', 'data', 'lichess-puzzles-1500-plus.json');

export function codexBridgePlugin(): Plugin {
  return {
    name: 'codex-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await tryServeLocalPuzzleCatalog(req, res)) {
          return;
        }
        if (!req.url?.startsWith('/api/codex-bridge/')) {
          next();
          return;
        }
        await handleBridgeRequest(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await tryServeLocalPuzzleCatalog(req, res)) {
          return;
        }
        if (!req.url?.startsWith('/api/codex-bridge/')) {
          next();
          return;
        }
        await handleBridgeRequest(req, res);
      });
    },
  };
}

async function tryServeLocalPuzzleCatalog(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const requestUrl = req.url?.split('?')[0];
  if (req.method !== 'GET' || requestUrl !== LOCAL_PUZZLE_CATALOG_ROUTE) {
    return false;
  }

  try {
    const payload = await fs.readFile(LOCAL_PUZZLE_CATALOG_PATH);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(payload);
  } catch {
    sendJson(res, 404, {
      error: 'Local puzzle catalog not found',
      path: LOCAL_PUZZLE_CATALOG_PATH,
    });
  }

  return true;
}

async function handleBridgeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method === 'GET' && req.url === '/api/codex-bridge/health') {
      const version = await getCodexVersion();
      if (!version) {
        sendJson(res, 503, {
          ok: false,
          codexAvailable: false,
          error: lastCodexLookupError,
        });
        return;
      }
      const login = await getCodexLoginStatus();
      sendJson(res, 200, {
        ok: login.loggedIn,
        codexAvailable: true,
        loggedIn: login.loggedIn,
        loginStatus: login.statusText,
        version,
        commandSource: cachedCommandInfo?.source,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/codex-bridge/chat') {
      const raw = await readRequestBody(req);
      const parsed = JSON.parse(raw) as Partial<BridgeChatRequest>;
      if (!parsed.model || !Array.isArray(parsed.messages)) {
        sendJson(res, 400, { error: 'Invalid request body' });
        return;
      }

      const request: BridgeChatRequest = {
        model: parsed.model,
        messages: parsed.messages
          .filter((m): m is BridgeChatMessage =>
            !!m && typeof m === 'object' && typeof m.role === 'string' && typeof m.content === 'string',
          )
          .map(m => ({ role: m.role, content: m.content })),
        temperature: parsed.temperature,
        maxTokens: parsed.maxTokens,
        reasoningEffort: parsed.reasoningEffort,
      };

      if (request.messages.length === 0) {
        sendJson(res, 400, { error: 'No messages provided' });
        return;
      }

      const result = await runCodexExec(request);
      sendJson(res, 200, {
        content: result.content,
        model: request.model,
        responseTimeMs: result.durationMs,
        tokensUsed: result.tokensUsed,
        finishReason: 'stop',
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: message });
  }
}

async function runCodexExec(request: BridgeChatRequest): Promise<CodexExecResult> {
  const outputPath = path.join(os.tmpdir(), `llm-chess-codex-${randomUUID()}.txt`);
  const prompt = buildBridgePrompt(request.messages);
  const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-m', request.model, '-o', outputPath];
  // Map reasoning effort to Codex CLI config override.
  const effort = request.reasoningEffort?.toLowerCase();
  if (effort && effort !== 'none') {
    args.push('-c', `reasoning.effort="${effort}"`);
  } else {
    args.push('-c', 'reasoning.effort="low"');
  }
  args.push('-');
  const command = await getCodexCommand();
  if (!command) {
    throw new Error(lastCodexLookupError);
  }

  const startedAt = Date.now();
  let stdout = '';
  let stderr = '';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      ...SPAWN_OPTS,
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(new Error(`Failed to start codex CLI: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`codex exec failed (exit ${code}): ${stderr || stdout || 'unknown error'}`));
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });

  try {
    const content = (await fs.readFile(outputPath, 'utf8')).trim();
    const tokensUsed = extractTokensUsed(stdout);
    return {
      content,
      tokensUsed,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await fs.unlink(outputPath).catch(() => undefined);
  }
}

function buildBridgePrompt(messages: BridgeChatMessage[]): string {
  const transcript = messages
    .map((message) => {
      return `[${message.role.toUpperCase()}]\n${message.content}`;
    })
    .join('\n\n');

  return [
    'You are serving as a chat-completions bridge for a local chess benchmark app.',
    'Produce only the assistant reply text for the provided conversation.',
    'Do not run tools, do not execute commands, and do not modify files.',
    'If the conversation asks for strict JSON, return strict JSON only.',
    '',
    'Conversation:',
    transcript,
    '',
    'Assistant response:',
  ].join('\n');
}

function extractTokensUsed(stdout: string): number | undefined {
  const match = stdout.match(/tokens used\s*[\r\n]+([\d,]+)/i);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function getCodexVersion(): Promise<string | null> {
  const now = Date.now();
  if (cachedVersion && now - cachedVersionAt < 10_000) {
    return cachedVersion;
  }

  const command = await getCodexCommand();
  if (!command) {
    cachedVersion = null;
    cachedVersionAt = now;
    return null;
  }

  const version = await new Promise<string | null>((resolve) => {
    const child = spawn(command, ['--version'], { ...SPAWN_OPTS, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    child.on('error', (error) => {
      lastCodexLookupError = `Failed to launch Codex binary: ${error.message}`;
      resolve(null);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        lastCodexLookupError = errorOutput.trim() || `Codex exited with status ${code}`;
        resolve(null);
        return;
      }
      resolve(output.trim() || null);
    });
  });

  cachedVersion = version;
  cachedVersionAt = now;
  return version;
}

async function getCodexLoginStatus(): Promise<CodexLoginStatus> {
  const command = await getCodexCommand();
  if (!command) {
    return { loggedIn: false, statusText: lastCodexLookupError };
  }

  return new Promise<CodexLoginStatus>((resolve) => {
    const child = spawn(command, ['login', 'status'], { ...SPAWN_OPTS, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ loggedIn: false, statusText: `login status unavailable: ${error.message}` });
    });
    child.on('close', (code) => {
      const statusText = output.trim() || 'unknown';
      const loggedIn = code === 0 && /logged in/i.test(statusText);
      resolve({ loggedIn, statusText });
    });
  });
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  const maxBytes = 5 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

async function getCodexCommand(): Promise<string | null> {
  const now = Date.now();
  if (cachedCommandInfo && now - cachedCommandAt < 60_000) {
    return cachedCommandInfo.command;
  }

  const direct = await findWorkingCodexCommand([{ command: 'codex', source: 'PATH' }]);
  if (direct) {
    cachedCommandInfo = direct;
    cachedCommandAt = now;
    return direct.command;
  }

  const discovered = await findWorkingCodexCommand(await discoverCodexCandidates());
  if (discovered) {
    cachedCommandInfo = discovered;
    cachedCommandAt = now;
    return discovered.command;
  }

  cachedCommandInfo = null;
  cachedCommandAt = now;
  if (!lastCodexLookupError) {
    lastCodexLookupError = 'Codex binary not found on PATH or VS Code extension install paths';
  }
  return null;
}

async function findWorkingCodexCommand(candidates: CodexCommandInfo[]): Promise<CodexCommandInfo | null> {
  for (const candidate of candidates) {
    if (!candidate.command) continue;
    const works = await canSpawnCommand(candidate.command);
    if (works) return candidate;
  }
  return null;
}

async function canSpawnCommand(command: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ['--version'], { ...SPAWN_OPTS, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      lastCodexLookupError = `Failed to launch "${command}": ${error.message}`;
      resolve(false);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      lastCodexLookupError = stderr.trim() || `Command "${command}" exited with status ${code}`;
      resolve(false);
    });
  });
}

async function discoverCodexCandidates(): Promise<CodexCommandInfo[]> {
  const candidates: CodexCommandInfo[] = [];
  const envCandidate = process.env.CODEX_CLI_PATH?.trim();
  if (envCandidate) {
    candidates.push({ command: envCandidate, source: 'CODEX_CLI_PATH' });
  }

  if (process.platform === 'win32') {
    const whereMatches = await readWhereCandidates();
    candidates.push(...whereMatches);
    const vscodeMatches = await readVsCodeExtensionCandidates();
    candidates.push(...vscodeMatches);
  }

  return dedupeCandidates(candidates);
}

async function readWhereCandidates(): Promise<CodexCommandInfo[]> {
  return new Promise<CodexCommandInfo[]>((resolve) => {
    const child = spawn('where.exe', ['codex'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', () => resolve([]));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      const matches = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(command => ({ command, source: 'where.exe' }));
      resolve(matches);
    });
  });
}

async function readVsCodeExtensionCandidates(): Promise<CodexCommandInfo[]> {
  const root = path.join(os.homedir(), '.vscode', 'extensions');
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const matches: CodexCommandInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('openai.chatgpt-')) continue;
      const command = path.join(root, entry.name, 'bin', 'windows-x86_64', 'codex.exe');
      const exists = await fileExists(command);
      if (exists) {
        matches.push({ command, source: 'VS Code extension' });
      }
    }
    return matches;
  } catch {
    return [];
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function dedupeCandidates(candidates: CodexCommandInfo[]): CodexCommandInfo[] {
  const seen = new Set<string>();
  const result: CodexCommandInfo[] = [];
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate.command).toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(candidate);
  }
  return result;
}
