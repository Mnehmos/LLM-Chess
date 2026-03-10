import type {
  PlayerConfig, SimulPlayConfig, SimulPresentationFormat,
  TurnContext, MoveRecord, PieceColor,
} from './types';
import type { LLMClient } from '../llm/client';
import type { ChatMessage } from '../llm/prompts';
import { ChessBoard } from '../chess/board';

export interface SimulBoardState {
  boardId: string;
  chess: ChessBoard;
  opponent: Omit<PlayerConfig, 'id' | 'color'>;
  moveHistory: MoveRecord[];
  status: 'active' | 'completed' | 'aborted';
  priority: number;
}

export interface SimulMoveResult {
  boardId: string;
  move: string;
  reasoning: string;
}

export interface SimulTurnResult {
  moves: SimulMoveResult[];
  responseTimeMs: number;
  tokensUsed?: number;
}

/**
 * SimulRuntime — manages one model playing multiple concurrent games.
 *
 * The model receives all active boards in a single prompt and returns
 * moves for each board simultaneously.
 */
export class SimulRuntime {
  private boards: Map<string, SimulBoardState> = new Map();
  private config: SimulPlayConfig;
  private llm: LLMClient;
  private playerConfig: PlayerConfig;

  constructor(
    playerConfig: PlayerConfig,
    simulConfig: SimulPlayConfig,
    llm: LLMClient,
  ) {
    this.config = simulConfig;
    this.llm = llm;
    this.playerConfig = playerConfig;

    // Initialize boards
    for (const boardConfig of simulConfig.boards) {
      this.boards.set(boardConfig.boardId, {
        boardId: boardConfig.boardId,
        chess: new ChessBoard(boardConfig.opening?.fen),
        opponent: boardConfig.opponent,
        moveHistory: [],
        status: 'active',
        priority: boardConfig.priority ?? 0,
      });
    }
  }

  getActiveBoards(): SimulBoardState[] {
    return [...this.boards.values()].filter(b => b.status === 'active');
  }

  /**
   * Build a combined prompt presenting all active boards to the model.
   */
  buildSimulPrompt(
    playerColor: PieceColor,
  ): ChatMessage[] {
    const activeBoards = this.getActiveBoards();
    const format = this.config.presentationFormat ?? 'sequential';

    const systemPrompt = `You are playing ${activeBoards.length} simultaneous chess games. For each board, analyze the position and provide your move.

Respond with JSON: { "boards": [{ "board_id": "1", "move": "<SAN>", "reasoning": "..." }, ...] }

${format === 'prioritized' ? 'Boards are listed in priority order. Allocate more thought to higher-priority boards.' : ''}
${format === 'unlabeled' ? 'Note: Board identifiers have been removed. Use position context to distinguish games.' : ''}`;

    const boardSections = this.formatBoards(activeBoards, playerColor, format);

    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: boardSections },
    ];
  }

  private formatBoards(
    boards: SimulBoardState[],
    playerColor: PieceColor,
    format: SimulPresentationFormat,
  ): string {
    // Sort by priority for prioritized format
    const sorted = format === 'prioritized'
      ? [...boards].sort((a, b) => b.priority - a.priority)
      : boards;

    const sections: string[] = [];

    for (const board of sorted) {
      const fen = board.chess.fen();
      const legalMoves = board.chess.getLegalMoves();
      const moveCount = board.moveHistory.length;

      let header: string;
      switch (format) {
        case 'sequential':
          header = `=== Board ${board.boardId} ===`;
          break;
        case 'interleaved':
          header = `[${board.boardId}]`;
          break;
        case 'prioritized':
          header = `=== Board ${board.boardId} (Priority: ${board.priority}) ===`;
          break;
        case 'unlabeled':
          header = `--- Game ---`;
          break;
        default:
          header = `=== Board ${board.boardId} ===`;
      }

      sections.push(`${header}
FEN: ${fen}
You are: ${playerColor === 'w' ? 'White' : 'Black'}
Move ${moveCount + 1}
Legal moves: ${legalMoves.join(', ')}`);
    }

    if (format === 'interleaved') {
      // Interleave board information
      return sections.join('\n\n');
    }

    return sections.join('\n\n');
  }

  /**
   * Parse the model's multi-board response.
   */
  static parseSimulResponse(content: string): SimulMoveResult[] {
    try {
      const parsed = JSON.parse(content);
      if (parsed.boards && Array.isArray(parsed.boards)) {
        return parsed.boards.map((b: { board_id?: string; move?: string; reasoning?: string }) => ({
          boardId: String(b.board_id || ''),
          move: String(b.move || ''),
          reasoning: String(b.reasoning || ''),
        }));
      }
    } catch {
      // Try to extract individual board moves from text
    }

    // Fallback: try to find board-tagged moves in text
    const moves: SimulMoveResult[] = [];
    const boardPattern = /(?:Board|board|Game)\s*(\w+)[:\s]+(?:move[:\s]+)?([A-Za-z0-9+#=]+)/g;
    let match;
    while ((match = boardPattern.exec(content)) !== null) {
      moves.push({ boardId: match[1], move: match[2], reasoning: '' });
    }

    return moves;
  }

  /**
   * Run a synchronized turn: all opponent moves first, then model responds for all boards.
   */
  async runSynchronizedTurn(
    playerColor: PieceColor,
    onToken?: (text: string) => void,
  ): Promise<SimulTurnResult> {
    const start = Date.now();
    const messages = this.buildSimulPrompt(playerColor);

    const response = await this.llm.requestMoveRaw(
      this.playerConfig.model,
      messages,
      this.playerConfig.temperature,
      {
        reasoningOrder: this.playerConfig.reasoningOrder,
        outputFormat: this.playerConfig.outputFormat,
        promptLevel: this.playerConfig.promptLevel,
        linePrediction: this.playerConfig.linePrediction,
      },
      onToken,
    );

    const moves = SimulRuntime.parseSimulResponse(response.content);

    return {
      moves,
      responseTimeMs: Date.now() - start,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Apply a move to a specific board.
   */
  applyMove(boardId: string, san: string): boolean {
    const board = this.boards.get(boardId);
    if (!board || board.status !== 'active') return false;

    const validation = board.chess.validateMove(san);
    if (!validation.legal) return false;

    board.chess.applyMove(validation.san!);
    return true;
  }

  /**
   * Check if a specific board's game is over.
   */
  checkBoardGameOver(boardId: string): ReturnType<ChessBoard['checkGameOver']> {
    const board = this.boards.get(boardId);
    if (!board) return null;
    return board.chess.checkGameOver();
  }

  getBoardContext(boardId: string, playerColor: PieceColor): TurnContext | null {
    const board = this.boards.get(boardId);
    if (!board || board.status !== 'active') return null;

    return {
      turnNumber: board.chess.moveNumber(),
      color: playerColor,
      fen: board.chess.fen(),
      legalMoves: board.chess.getLegalMoves(),
      moveHistory: board.chess.history(),
      moveRecords: board.moveHistory,
    };
  }
}
