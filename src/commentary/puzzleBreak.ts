import { Chess } from 'chess.js';
import { isTauri, loadPuzzleCatalog } from '../tauri-bridge';

export interface LichessPuzzle {
  id: string;
  fen: string;
  themes: string[];
  rating: number;
  solution: string[];
}

export interface PuzzleTurn {
  side: 'w' | 'b';
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  commentary: string;
  rawCommentary: string;
  annotations: import('../utils/board-annotations').BoardAnnotations;
}

interface LichessPuzzleResponse {
  puzzle?: {
    id: string;
    rating: number;
    themes: string[];
    solution: string[];
    initialPly?: number;
    fen?: string;
  };
  game?: {
    pgn?: string;
    fen?: string;
  };
}

interface LocalPuzzleCatalog {
  generatedAt?: string;
  minRating?: number;
  sampleSize?: number;
  eligibleCount?: number;
  puzzles?: LichessPuzzle[];
}

const MIN_PUZZLE_RATING = 1500;
const PUZZLE_POOL_TARGET = 96;
const PUZZLE_POOL_LOW_WATER = 32;
const LOCAL_CATALOG_HTTP_PATH = `${import.meta.env.BASE_URL}data/lichess-puzzles-1500-plus.json`;

const puzzlePool: LichessPuzzle[] = [];
const pooledPuzzleIds = new Set<string>();
let refillPromise: Promise<void> | null = null;
let localCatalogPromise: Promise<LichessPuzzle[]> | null = null;
let localCatalogOrder: number[] = [];
let localCatalogCursor = 0;

export function getPuzzleFamilyId(id: string): string {
  return id;
}

function canReplaySolution(fen: string, solution: string[], pliesToCheck = Math.min(solution.length, 3)): boolean {
  try {
    const chess = new Chess(fen);
    for (const move of solution.slice(0, pliesToCheck)) {
      if (!chess.move(move)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function replayFen(history: ReturnType<Chess['history']>, plyCount: number): string {
  const replay = new Chess();
  for (let i = 0; i < plyCount; i++) {
    if (history[i]) replay.move(history[i]);
  }
  return replay.fen();
}

function resolvePuzzleFen(history: ReturnType<Chess['history']>, initialPly: number, solution: string[]): string {
  const orderedCandidates = Array.from({ length: history.length + 1 }, (_, ply) => ply)
    .sort((a, b) => Math.abs(a - initialPly) - Math.abs(b - initialPly));

  for (const ply of orderedCandidates) {
    const fen = replayFen(history, ply);
    if (canReplaySolution(fen, solution)) {
      if (ply !== initialPly) {
        console.warn(`[PuzzleBreak] Adjusted puzzle start ply ${initialPly} -> ${ply} to match solution`);
      }
      return fen;
    }
  }

  return replayFen(history, initialPly);
}

function isCatalogPuzzleEligible(puzzle: LichessPuzzle): boolean {
  if (!puzzle?.id || !puzzle.fen || !Array.isArray(puzzle.solution) || puzzle.solution.length === 0) return false;
  if (puzzle.rating < MIN_PUZZLE_RATING) return false;
  return true;
}

function isPuzzleEligible(puzzle: LichessPuzzle, excludedIds?: ReadonlySet<string>): boolean {
  if (!isCatalogPuzzleEligible(puzzle)) return false;
  if (excludedIds?.has(puzzle.id)) return false;
  if (!canReplaySolution(puzzle.fen, puzzle.solution)) return false;
  return true;
}

function logPuzzlePool(event: string, details: Record<string, unknown>): void {
  console.log(`[PuzzleBreak] ${event}`, details);
}

function parseLocalCatalogPayload(data: LocalPuzzleCatalog, source: string): LichessPuzzle[] {
  const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
  const filtered = puzzles.filter(puzzle => isCatalogPuzzleEligible(puzzle));
  logPuzzlePool('Loaded local catalog', {
    source,
    count: filtered.length,
    minRating: data.minRating ?? MIN_PUZZLE_RATING,
    sampleSize: data.sampleSize ?? filtered.length,
    eligibleCount: data.eligibleCount ?? null,
  });
  return filtered;
}

function parsePuzzleResponse(data: LichessPuzzleResponse): LichessPuzzle | null {
  if (!data.puzzle?.id || !Array.isArray(data.puzzle.solution) || data.puzzle.solution.length === 0) return null;
  let fen = data.puzzle.fen ?? data.game?.fen ?? '';

  if (!fen && data.game?.pgn) {
    const chess = new Chess();
    chess.loadPgn(data.game.pgn);
    const history = chess.history({ verbose: true });
    fen = resolvePuzzleFen(history, data.puzzle.initialPly ?? history.length, data.puzzle.solution);
  }

  if (!fen) return null;

  return {
    id: data.puzzle.id,
    fen,
    themes: data.puzzle.themes ?? [],
    rating: data.puzzle.rating ?? 0,
    solution: data.puzzle.solution,
  };
}

async function loadLocalPuzzleCatalog(): Promise<LichessPuzzle[]> {
  if (!localCatalogPromise) {
    localCatalogPromise = (async () => {
      if (isTauri) {
        try {
          const rawCatalog = await loadPuzzleCatalog();
          if (rawCatalog) {
            const data = JSON.parse(rawCatalog) as LocalPuzzleCatalog;
            return parseLocalCatalogPayload(data, 'tauri-file');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logPuzzlePool('Local catalog unavailable', {
            source: 'tauri-file',
            error: message,
          });
        }
      }

      try {
        const res = await fetch(LOCAL_CATALOG_HTTP_PATH, {
          headers: { Accept: 'application/json' },
          cache: 'force-cache',
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as LocalPuzzleCatalog;
        return parseLocalCatalogPayload(data, 'http');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logPuzzlePool('Local catalog unavailable', {
          source: 'http',
          path: LOCAL_CATALOG_HTTP_PATH,
          error: message,
        });
        if (message.includes('404')) {
          console.warn('[PuzzleBreak] Local catalog returned 404. In Tauri dev, the backend file loader should handle this after a full app restart.');
        }
        return [];
      }
    })();
  }
  return localCatalogPromise;
}

function pushPuzzleToPool(puzzle: LichessPuzzle): void {
  if (pooledPuzzleIds.has(puzzle.id)) return;
  puzzlePool.push(puzzle);
  pooledPuzzleIds.add(puzzle.id);
}

function resetLocalCatalogOrder(size: number): void {
  localCatalogOrder = Array.from({ length: size }, (_, index) => index);
  for (let i = localCatalogOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [localCatalogOrder[i], localCatalogOrder[j]] = [localCatalogOrder[j], localCatalogOrder[i]];
  }
  localCatalogCursor = 0;
}

async function refillPuzzlePool(excludedIds?: ReadonlySet<string>): Promise<void> {
  if (puzzlePool.length >= PUZZLE_POOL_TARGET) return;

  const localCatalog = await loadLocalPuzzleCatalog();
  if (localCatalog.length === 0) return;

  if (localCatalogOrder.length !== localCatalog.length || localCatalogCursor >= localCatalogOrder.length) {
    resetLocalCatalogOrder(localCatalog.length);
  }

  let added = 0;
  let scanned = 0;
  while (puzzlePool.length < PUZZLE_POOL_TARGET && scanned < localCatalog.length) {
    if (localCatalogCursor >= localCatalogOrder.length) {
      resetLocalCatalogOrder(localCatalog.length);
    }

    const puzzle = localCatalog[localCatalogOrder[localCatalogCursor++]];
    scanned += 1;
    if (!isPuzzleEligible(puzzle, excludedIds)) continue;
    pushPuzzleToPool(puzzle);
    added += 1;
  }

  logPuzzlePool('Pool refill', {
    source: 'local-catalog',
    added,
    scanned,
    size: puzzlePool.length,
    target: PUZZLE_POOL_TARGET,
    remaining: Math.max(localCatalogOrder.length - localCatalogCursor, 0),
  });
}

function pickRandomAvailablePuzzle(excludedIds?: ReadonlySet<string>): { puzzle: LichessPuzzle; index: number } | null {
  if (puzzlePool.length === 0) return null;

  const candidateOrder = Array.from({ length: puzzlePool.length }, (_, index) => index);
  for (let i = candidateOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidateOrder[i], candidateOrder[j]] = [candidateOrder[j], candidateOrder[i]];
  }

  for (const index of candidateOrder) {
    const puzzle = puzzlePool[index];
    if (isPuzzleEligible(puzzle, excludedIds)) {
      return { puzzle, index };
    }
  }

  return null;
}

async function ensurePuzzlePool(excludedIds?: ReadonlySet<string>): Promise<void> {
  if (puzzlePool.length >= PUZZLE_POOL_LOW_WATER) return;
  if (!refillPromise) {
    refillPromise = refillPuzzlePool(excludedIds).finally(() => {
      refillPromise = null;
    });
  }
  await refillPromise;
}

function removeFromPool(index: number): LichessPuzzle {
  const [puzzle] = puzzlePool.splice(index, 1);
  pooledPuzzleIds.delete(puzzle.id);
  return puzzle;
}

async function fetchDailyPuzzle(excludedIds?: ReadonlySet<string>): Promise<LichessPuzzle | null> {
  try {
    const res = await fetch('https://lichess.org/api/puzzle/daily', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as LichessPuzzleResponse;
    const puzzle = parsePuzzleResponse(data);
    if (!puzzle || !isPuzzleEligible(puzzle, excludedIds)) {
      logPuzzlePool('Reject daily puzzle', {
        source: 'daily-fallback',
        id: puzzle?.id ?? null,
        rating: puzzle?.rating ?? null,
      });
      return null;
    }
    return puzzle;
  } catch (error) {
    logPuzzlePool('Daily fetch failed', {
      source: 'daily-fallback',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function prefillPuzzlePool(excludedIds?: ReadonlySet<string>): Promise<void> {
  await ensurePuzzlePool(excludedIds);
}

export async function getNextPuzzle(excludedIds?: ReadonlySet<string>): Promise<LichessPuzzle> {
  await ensurePuzzlePool(excludedIds);

  const choice = pickRandomAvailablePuzzle(excludedIds);
  if (choice) {
    const puzzle = removeFromPool(choice.index);
    logPuzzlePool('Pool draw', { source: 'local-catalog', id: puzzle.id, rating: puzzle.rating, size: puzzlePool.length });
    void ensurePuzzlePool(excludedIds);
    return puzzle;
  }

  const dailyPuzzle = await fetchDailyPuzzle(excludedIds);
  if (dailyPuzzle) {
    logPuzzlePool('Pool draw', { source: 'daily-fallback', id: dailyPuzzle.id, rating: dailyPuzzle.rating, size: puzzlePool.length });
    return dailyPuzzle;
  }

  throw new Error('No eligible puzzle available from local catalog or daily fallback');
}

export async function fetchLichessPuzzle(excludedIds?: ReadonlySet<string>): Promise<LichessPuzzle> {
  return getNextPuzzle(excludedIds);
}
