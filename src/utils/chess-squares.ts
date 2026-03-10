/**
 * Extract chess squares referenced in commentary text.
 * Used for narration-synced board highlighting.
 */

// SAN move pattern: optional piece letter, optional file/rank disambiguator,
// optional capture 'x', destination square, optional promotion/check
const SAN_PATTERN = /\b([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:[+#=][QRBN]?)?\b/g;

// Castling patterns
const CASTLE_KINGSIDE = /\bO-O\b(?!-)/g;
const CASTLE_QUEENSIDE = /\bO-O-O\b/g;

/**
 * Extract destination squares from chess notation in text.
 * Returns deduplicated array of square strings (e.g., ['c3', 'e4', 'd5']).
 */
export function extractChessSquares(text: string): string[] {
  const squares = new Set<string>();

  // Queenside castling (check first — longer pattern)
  for (const _match of text.matchAll(CASTLE_QUEENSIDE)) {
    squares.add('c1');
    squares.add('c8');
  }

  // Kingside castling
  for (const _match of text.matchAll(CASTLE_KINGSIDE)) {
    squares.add('g1');
    squares.add('g8');
  }

  // Standard SAN moves → destination square (group 4)
  for (const match of text.matchAll(SAN_PATTERN)) {
    squares.add(match[4]);
  }

  return [...squares];
}

const PIECE_NAMES: Record<string, string> = {
  K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight',
};

const FILE_NAMES: Record<string, string> = {
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h',
};

/**
 * Convert SAN notation in text to natural spoken English for TTS.
 * "Nf3" → "Knight f3", "Bxe5" → "Bishop takes e5", "O-O" → "castles kingside"
 * The original text is preserved for display; this output is only for speech synthesis.
 */
export function sanToSpoken(text: string): string {
  // Castling first (longer pattern first)
  let result = text.replace(/\bO-O-O\b/g, 'castles queenside');
  result = result.replace(/\bO-O\b(?!-)/g, 'castles kingside');

  // SAN moves: piece + optional disambiguator + optional capture + destination + optional promotion/check
  const sanSpoken = /\b([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?\b/g;

  result = result.replace(sanSpoken, (_match, piece, disFile, disRank, capture, dest, promo, check) => {
    const parts: string[] = [];

    if (piece) {
      parts.push(PIECE_NAMES[piece]);
    }

    // Disambiguator (e.g. Rae1 → "Rook a, e1")
    if (disFile && piece) {
      parts.push(FILE_NAMES[disFile]);
    }
    // Rank disambiguator rare but possible (R1e1)
    if (disRank && piece) {
      parts.push(disRank);
    }

    if (capture) {
      parts.push('takes');
    }

    // Destination square — spell it naturally
    parts.push(dest);

    if (promo) {
      parts.push('promotes to');
      parts.push(PIECE_NAMES[promo]);
    }

    if (check === '#') {
      parts.push('checkmate');
    } else if (check === '+') {
      parts.push('check');
    }

    return parts.join(' ');
  });

  return result;
}

export interface TextSegment {
  text: string;
  isChessMove: boolean;
  square?: string;
}

/**
 * Split text into segments, marking chess move references for rich display.
 * Chess moves are isolated as separate segments for styling.
 */
export function segmentChessMoves(text: string): TextSegment[] {
  // Combined pattern: castling or SAN moves
  const combined = /O-O-O|O-O|\b[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8][+#=]?[QRBN]?\b/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(combined)) {
    const start = match.index;
    // Add preceding plain text
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), isChessMove: false });
    }

    const moveText = match[0];
    // Extract the square for this specific match
    const squares = extractChessSquares(moveText);
    segments.push({
      text: moveText,
      isChessMove: true,
      square: squares[0],
    });

    lastIndex = start + moveText.length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isChessMove: false });
  }

  return segments;
}
