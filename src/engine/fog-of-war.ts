import type {
  AdvisorReporterType, FogOfWarConfig, FogVisibilityMode, PieceColor,
} from './types';

export interface FoggedBoardState {
  /** FEN with hidden squares replaced by '?' */
  visibleFen: string;
  /** ASCII board with '?' for hidden squares */
  asciiBoard: string;
  /** Set of visible square names (e.g., 'e4') */
  visibleSquares: Set<string>;
  /** Set of hidden square names */
  hiddenSquares: Set<string>;
  /** The visibility mode applied */
  mode: FogVisibilityMode;
}

interface SquareInfo {
  piece: string | null; // e.g., 'P', 'p', 'R', 'r', null for empty
  file: number;         // 0-7 (a-h)
  rank: number;         // 0-7 (1-8)
  name: string;         // e.g., 'e4'
}

const FILES = 'abcdefgh';

function parseFenBoard(fen: string): SquareInfo[][] {
  const boardStr = fen.split(' ')[0];
  const ranks = boardStr.split('/');
  const board: SquareInfo[][] = [];

  for (let r = 0; r < 8; r++) {
    const row: SquareInfo[] = [];
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch); i++) {
          row.push({ piece: null, file, rank: 7 - r, name: `${FILES[file]}${8 - r}` });
          file++;
        }
      } else {
        row.push({ piece: ch, file, rank: 7 - r, name: `${FILES[file]}${8 - r}` });
        file++;
      }
    }
    board.push(row);
  }
  return board;
}

function isOwnPiece(piece: string | null, color: PieceColor): boolean {
  if (!piece) return false;
  return color === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

function findKing(board: SquareInfo[][], color: PieceColor): { file: number; rank: number } | null {
  const kingChar = color === 'w' ? 'K' : 'k';
  for (const row of board) {
    for (const sq of row) {
      if (sq.piece === kingChar) return { file: sq.file, rank: sq.rank };
    }
  }
  return null;
}

function squareDistance(f1: number, r1: number, f2: number, r2: number): number {
  return Math.max(Math.abs(f1 - f2), Math.abs(r1 - r2)); // Chebyshev distance
}

function boardToFen(board: SquareInfo[][], originalFen: string, hidden: Set<string>): string {
  const fenParts = originalFen.split(' ');
  const ranks: string[] = [];

  for (let r = 0; r < 8; r++) {
    let rankStr = '';
    let emptyCount = 0;
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (hidden.has(sq.name)) {
        emptyCount++;
      } else if (sq.piece) {
        if (emptyCount > 0) { rankStr += emptyCount; emptyCount = 0; }
        rankStr += sq.piece;
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) rankStr += emptyCount;
    ranks.push(rankStr);
  }

  fenParts[0] = ranks.join('/');
  return fenParts.join(' ');
}

function boardToAscii(board: SquareInfo[][], hidden: Set<string>): string {
  const lines: string[] = ['  a b c d e f g h'];
  for (let r = 0; r < 8; r++) {
    let line = `${8 - r} `;
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (hidden.has(sq.name)) {
        line += '? ';
      } else {
        line += (sq.piece || '.') + ' ';
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}

/**
 * Apply fog of war to a real FEN position, returning what the player can see.
 */
export function applyFog(
  realFen: string,
  playerColor: PieceColor,
  config: FogOfWarConfig,
  _moveHistory?: string[],
  scoutedSquares?: Set<string>,
): FoggedBoardState {
  if (!config.enabled || config.visibilityMode === 'full') {
    const board = parseFenBoard(realFen);
    const allSquares = new Set<string>();
    for (const row of board) for (const sq of row) allSquares.add(sq.name);
    return {
      visibleFen: realFen,
      asciiBoard: boardToAscii(board, new Set()),
      visibleSquares: allSquares,
      hiddenSquares: new Set(),
      mode: 'full',
    };
  }

  const board = parseFenBoard(realFen);
  const hidden = new Set<string>();
  const visible = new Set<string>();
  const mode = config.visibilityMode ?? 'full';

  // First pass: determine visibility per mode
  for (const row of board) {
    for (const sq of row) {
      let isVisible = false;

      switch (mode) {
        case 'own_pieces':
          // Own pieces always visible, empty squares adjacent to own pieces visible
          isVisible = isOwnPiece(sq.piece, playerColor) || !sq.piece;
          if (sq.piece && !isOwnPiece(sq.piece, playerColor)) isVisible = false;
          break;

        case 'radius': {
          const radius = config.radiusSquares ?? 3;
          const king = findKing(board, playerColor);
          if (king) {
            isVisible = squareDistance(sq.file, sq.rank, king.file, king.rank) <= radius;
          }
          // Own pieces always visible regardless of radius
          if (isOwnPiece(sq.piece, playerColor)) isVisible = true;
          break;
        }

        case 'last_known':
          // Own pieces visible, opponent pieces hidden (caller tracks last-known)
          isVisible = !sq.piece || isOwnPiece(sq.piece, playerColor);
          break;

        case 'fog_zones': {
          const fogZones = new Set(config.fogZones || []);
          isVisible = !fogZones.has(sq.name);
          break;
        }

        case 'piece_type':
          // Only certain piece types visible (pawns and kings always visible)
          if (!sq.piece) isVisible = true;
          else if (sq.piece.toLowerCase() === 'p' || sq.piece.toLowerCase() === 'k') isVisible = true;
          else isVisible = isOwnPiece(sq.piece, playerColor);
          break;

        case 'no_board':
          isVisible = false;
          break;

        default:
          isVisible = true;
      }

      // Scouted squares override fog
      if (scoutedSquares?.has(sq.name)) isVisible = true;

      if (isVisible) visible.add(sq.name);
      else hidden.add(sq.name);
    }
  }

  return {
    visibleFen: boardToFen(board, realFen, hidden),
    asciiBoard: boardToAscii(board, hidden),
    visibleSquares: visible,
    hiddenSquares: hidden,
    mode,
  };
}

/**
 * Measure how accurately a model's believed board state matches reality.
 * Returns 0-1 accuracy score (fraction of squares correctly identified).
 */
export function measureReconstructionAccuracy(
  modelBoardFen: string,
  realFen: string,
): number {
  const modelBoard = parseFenBoard(modelBoardFen);
  const realBoard = parseFenBoard(realFen);
  let correct = 0;
  let total = 64;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if (modelBoard[r][f].piece === realBoard[r][f].piece) correct++;
    }
  }

  return correct / total;
}

/**
 * Process a scout action — reveal what's on a specific square.
 */
export function processScoutAction(
  scoutSquare: string,
  realFen: string,
): { square: string; piece: string | null; occupied: boolean } {
  const board = parseFenBoard(realFen);
  for (const row of board) {
    for (const sq of row) {
      if (sq.name === scoutSquare) {
        return { square: scoutSquare, piece: sq.piece, occupied: sq.piece !== null };
      }
    }
  }
  return { square: scoutSquare, piece: null, occupied: false };
}

/**
 * Generate a board report from the advisor-as-reporter.
 * Different reporter types produce different quality reports.
 */
export function generateBoardReport(
  realFen: string,
  reporterType: AdvisorReporterType,
  config: FogOfWarConfig,
  currentMoveNumber?: number,
  historicalFens?: string[],
): string {
  const board = parseFenBoard(realFen);

  switch (reporterType) {
    case 'honest': {
      const pieces: string[] = [];
      for (const row of board) {
        for (const sq of row) {
          if (sq.piece) pieces.push(`${sq.piece} on ${sq.name}`);
        }
      }
      return `Board report: ${pieces.join(', ')}.`;
    }

    case 'noisy': {
      const noiseRate = (config.noisePercent ?? 10) / 100;
      const pieces: string[] = [];
      for (const row of board) {
        for (const sq of row) {
          if (sq.piece) {
            if (Math.random() < noiseRate) {
              // Misreport: swap with random piece or remove
              const fakePieces = 'PNBRQKpnbrqk';
              pieces.push(`${fakePieces[Math.floor(Math.random() * fakePieces.length)]} on ${sq.name}`);
            } else {
              pieces.push(`${sq.piece} on ${sq.name}`);
            }
          }
        }
      }
      return `Board report: ${pieces.join(', ')}.`;
    }

    case 'biased':
      return generateBiasedReport(board);

    case 'delayed': {
      const delay = config.delayMoves ?? 2;
      if (historicalFens && currentMoveNumber !== undefined) {
        const delayedIndex = Math.max(0, currentMoveNumber - delay);
        if (delayedIndex < historicalFens.length) {
          const delayedBoard = parseFenBoard(historicalFens[delayedIndex]);
          const pieces: string[] = [];
          for (const row of delayedBoard) {
            for (const sq of row) {
              if (sq.piece) pieces.push(`${sq.piece} on ${sq.name}`);
            }
          }
          return `Board report (may be slightly outdated): ${pieces.join(', ')}.`;
        }
      }
      return 'Board report: Unable to determine current position.';
    }

    case 'selective': {
      // Only report pieces in certain regions
      const pieces: string[] = [];
      for (const row of board) {
        for (const sq of row) {
          if (sq.piece && (sq.rank >= 4)) { // Only report upper half
            pieces.push(`${sq.piece} on ${sq.name}`);
          }
        }
      }
      return `Partial board report (some areas unclear): ${pieces.join(', ')}.`;
    }

    case 'adversarial': {
      // Deliberately misreport key features
      const pieces: string[] = [];
      for (const row of board) {
        for (const sq of row) {
          if (sq.piece) {
            // Swap white/black pieces
            const swapped = sq.piece === sq.piece.toUpperCase()
              ? sq.piece.toLowerCase()
              : sq.piece.toUpperCase();
            pieces.push(`${swapped} on ${sq.name}`);
          }
        }
      }
      return `Board report: ${pieces.join(', ')}.`;
    }

    case 'conflicting': {
      const honest: string[] = [];
      const lies: string[] = [];
      for (const row of board) {
        for (const sq of row) {
          if (sq.piece) {
            honest.push(`${sq.piece} on ${sq.name}`);
            if (Math.random() < 0.3) {
              lies.push(`empty on ${sq.name}`);
            } else {
              lies.push(`${sq.piece} on ${sq.name}`);
            }
          }
        }
      }
      return `Advisor A reports: ${honest.join(', ')}.\nAdvisor B reports: ${lies.join(', ')}.`;
    }

    default:
      return 'No board information available.';
  }
}

function generateBiasedReport(board: SquareInfo[][]): string {
  // Systematically understates opponent threats
  const pieces: string[] = [];
  for (const row of board) {
    for (const sq of row) {
      if (sq.piece) {
        // Downgrade opponent piece descriptions
        if (sq.piece === sq.piece.toLowerCase()) {
          // Black pieces — report with minimizing language
          pieces.push(`${sq.piece} on ${sq.name} (passive)`);
        } else {
          pieces.push(`${sq.piece} on ${sq.name}`);
        }
      }
    }
  }
  return `Board report: ${pieces.join(', ')}. The opponent's position appears weak.`;
}
