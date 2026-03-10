import { Chess } from 'chess.js';

// ─── Types ───

export interface PgnHeaders {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white: string;
  black: string;
  result: string;
  eco?: string;
  opening?: string;
  fen?: string;
  [key: string]: string | undefined;
}

export interface PgnMove {
  san: string;
  color: 'w' | 'b';
  turnNumber: number;
  from: string;
  to: string;
  fen: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isCapture: boolean;
  capturedPiece?: string;
}

export interface PgnGame {
  headers: PgnHeaders;
  moves: PgnMove[];
  raw: string;
}

// ─── Piece type map for captured piece names ───

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen',
};

// ─── Multi-game PGN splitter ───

/**
 * Split a PGN string containing multiple games into individual game strings.
 * Games are delimited by tag sections (lines starting with `[`).
 */
function splitPgnGames(pgn: string): string[] {
  const lines = pgn.split('\n');
  const games: string[] = [];
  let current: string[] = [];
  let inTags = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isTag = trimmed.startsWith('[');

    if (isTag && !inTags && current.length > 0) {
      // Starting a new tag section — flush previous game
      const text = current.join('\n').trim();
      if (text) games.push(text);
      current = [];
    }

    inTags = isTag;
    current.push(line);
  }

  const last = current.join('\n').trim();
  if (last) games.push(last);

  return games;
}

// ─── Single game parser ───

/**
 * Parse a single PGN game string into structured data.
 * Uses chess.js for move validation and verbose move extraction.
 */
export function parseSinglePgn(pgn: string): PgnGame {
  const chess = new Chess();

  // Extract headers manually (chess.js header() is set-only before loadPgn)
  const headers: PgnHeaders = { white: 'White', black: 'Black', result: '*' };
  const tagRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(pgn)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2];
    // Map standard PGN tags
    if (key === 'white') headers.white = value;
    else if (key === 'black') headers.black = value;
    else if (key === 'result') headers.result = value;
    else if (key === 'event') headers.event = value;
    else if (key === 'site') headers.site = value;
    else if (key === 'date') headers.date = value;
    else if (key === 'round') headers.round = value;
    else if (key === 'eco') headers.eco = value;
    else if (key === 'opening') headers.opening = value;
    else if (key === 'fen') headers.fen = value;
    else headers[key] = value;
  }

  // Try to extract player names from Event header if not explicitly set
  // e.g. "Capablanca vs Marshall (1918) - Marshall Attack" → White: Capablanca, Black: Marshall
  if (headers.white === 'White' && headers.black === 'Black' && headers.event) {
    const vsMatch = headers.event.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*[\(\[\-–—]|$)/i);
    if (vsMatch) {
      headers.white = vsMatch[1].trim();
      headers.black = vsMatch[2].trim();
    }
  }

  // Load starting position if FEN specified
  if (headers.fen) {
    chess.load(headers.fen);
  }

  // Load PGN moves — chess.js loadPgn() returns void and throws on failure
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch (e) {
    throw new Error(`Failed to parse PGN: ${e instanceof Error ? e.message : pgn.slice(0, 200)}`);
  }

  // Get verbose move history
  const verboseMoves = chess.history({ verbose: true });

  // Replay from start to build per-move FEN and metadata
  const replay = headers.fen ? new Chess(headers.fen) : new Chess();
  const moves: PgnMove[] = [];

  for (const vm of verboseMoves) {
    const applied = replay.move(vm.san);
    if (!applied) {
      throw new Error(`Failed to replay move: ${vm.san} at position ${replay.fen()}`);
    }

    moves.push({
      san: applied.san,
      color: applied.color as 'w' | 'b',
      turnNumber: Math.ceil((moves.length + 1) / 2),
      from: applied.from,
      to: applied.to,
      fen: replay.fen(),
      isCheck: replay.isCheck(),
      isCheckmate: replay.isCheckmate(),
      isCapture: !!applied.captured,
      capturedPiece: applied.captured ? PIECE_NAMES[applied.captured] || applied.captured : undefined,
    });
  }

  return { headers, moves, raw: pgn };
}

// ─── Multi-game parser ───

/**
 * Parse a PGN string that may contain one or more games.
 * Returns an array of parsed games.
 */
export function parsePgn(pgn: string): PgnGame[] {
  const gameStrings = splitPgnGames(pgn.trim());
  return gameStrings.map(g => parseSinglePgn(g));
}

/**
 * Map PGN result string to GameResult-compatible data.
 */
export function pgnResultToGameResult(result: string): {
  outcome: 'decisive' | 'draw' | 'aborted';
  winner?: 'w' | 'b';
  reason: string;
} {
  if (result === '1-0') return { outcome: 'decisive', winner: 'w', reason: 'checkmate' };
  if (result === '0-1') return { outcome: 'decisive', winner: 'b', reason: 'checkmate' };
  if (result === '1/2-1/2') return { outcome: 'draw', reason: 'agreement' };
  return { outcome: 'aborted', reason: 'unknown' };
}
