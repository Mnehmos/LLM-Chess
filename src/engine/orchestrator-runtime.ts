import type {
  AdvisoryCommunicationMode, ChainOfCommand, OrchestratorConfig,
  OrchestratorPlayerConfig, PieceColor, TurnContext,
} from './types';
import type { LLMClient } from '../llm/client';
import type { ChatMessage } from '../llm/prompts';
import { parseMoveResponse } from '../llm/parser';
import { getStockfishAnalysis } from '../chess/stockfish';

export interface OrchestratorAdvice {
  playerId: string;
  advice: string;
  recommendedMove?: string;
}

export interface OrchestratorTurnResult {
  advice: OrchestratorAdvice[];
  responseTimeMs: number;
  tokensUsed?: number;
}

export interface PlayerMoveResult {
  playerId: string;
  move: string;
  reasoning: string;
  followedAdvice: boolean;
  responseTimeMs: number;
}

/**
 * OrchestratorRuntime — one model advises multiple weaker models playing independent games.
 *
 * Flow per round:
 * 1. Orchestrator sees all boards and produces advice per player
 * 2. Each player receives their board + orchestrator advice
 * 3. Each player makes their move
 * 4. Metrics track advice absorption, Elo boost, etc.
 */
export class OrchestratorRuntime {
  private config: OrchestratorConfig;
  private llm: LLMClient;

  constructor(config: OrchestratorConfig, llm: LLMClient) {
    this.config = config;
    this.llm = llm;
  }

  /**
   * Generate orchestrator advice for all players.
   */
  async generateAdvice(
    playerContexts: Map<string, TurnContext>,
    playerColor: PieceColor,
    onToken?: (text: string) => void,
  ): Promise<OrchestratorTurnResult> {
    const start = Date.now();
    const mode = this.config.communicationMode ?? 'move_rationale';

    // Stockfish-as-orchestrator baseline
    if (this.config.useStockfishAsOrchestrator) {
      return this.generateStockfishAdvice(playerContexts, playerColor);
    }

    const messages = this.buildOrchestratorPrompt(playerContexts, playerColor, mode);

    const orchestratorModel = this.config.orchestratorModel;
    const response = await this.llm.requestMoveRaw(
      orchestratorModel.model,
      messages,
      orchestratorModel.temperature,
      {
        reasoningOrder: orchestratorModel.reasoningOrder,
        outputFormat: orchestratorModel.outputFormat,
        promptLevel: orchestratorModel.promptLevel,
        linePrediction: orchestratorModel.linePrediction,
      },
      onToken,
    );

    const advice = this.parseOrchestratorResponse(response.content, playerContexts);

    // If LLM translates Stockfish, enhance advice with engine analysis
    if (this.config.llmTranslatesStockfish) {
      await this.enhanceWithStockfish(advice, playerContexts);
    }

    return {
      advice,
      responseTimeMs: Date.now() - start,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Build prompt for the orchestrator model showing all boards.
   */
  private buildOrchestratorPrompt(
    playerContexts: Map<string, TurnContext>,
    playerColor: PieceColor,
    mode: AdvisoryCommunicationMode,
  ): ChatMessage[] {
    const modeInstructions = this.getModeInstructions(mode);

    const boardSections: string[] = [];
    for (const playerConfig of this.config.players) {
      const ctx = playerContexts.get(playerConfig.playerId);
      if (!ctx) continue;

      const eloNote = playerConfig.approximateElo
        ? ` (approximate ELO: ${playerConfig.approximateElo})`
        : '';

      boardSections.push(`--- Player ${playerConfig.playerId}${eloNote} ---
FEN: ${ctx.fen}
Playing as: ${playerColor === 'w' ? 'White' : 'Black'}
Move: ${ctx.turnNumber}
Legal moves: ${ctx.legalMoves.join(', ')}
Recent moves: ${ctx.moveHistory.slice(-6).join(' ')}`);
    }

    const systemPrompt = `You are an expert chess advisor overseeing ${this.config.players.length} players in simultaneous games. Your role is to provide strategic guidance to each player.

${modeInstructions}

Respond with JSON: { "advice": [{ "player_id": "<id>", "advice": "<text>", "recommended_move": "<SAN or null>" }, ...] }`;

    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: boardSections.join('\n\n') },
    ];
  }

  private getModeInstructions(mode: AdvisoryCommunicationMode): string {
    switch (mode) {
      case 'move_only':
        return 'For each player, recommend a specific move. Keep advice minimal.';
      case 'move_rationale':
        return 'For each player, recommend a move with a brief explanation of why.';
      case 'strategic_guidance':
        return 'For each player, provide strategic direction without specifying exact moves.';
      case 'socratic':
        return 'For each player, ask guiding questions to help them find the best move.';
      case 'full_analysis':
        return 'For each player, provide a deep positional analysis with move recommendations.';
      case 'calibrated':
        return 'Adjust your advice complexity based on each player\'s approximate ELO. Simpler for weaker players, more nuanced for stronger ones.';
      default:
        return 'Provide helpful chess advice for each player.';
    }
  }

  private parseOrchestratorResponse(
    content: string,
    playerContexts: Map<string, TurnContext>,
  ): OrchestratorAdvice[] {
    try {
      const parsed = JSON.parse(content);
      if (parsed.advice && Array.isArray(parsed.advice)) {
        return parsed.advice.map((a: { player_id?: string; advice?: string; recommended_move?: string }) => ({
          playerId: String(a.player_id || ''),
          advice: String(a.advice || ''),
          recommendedMove: a.recommended_move || undefined,
        }));
      }
    } catch {
      // Fallback: generate generic advice for each player
    }

    return [...playerContexts.keys()].map(id => ({
      playerId: id,
      advice: content,
    }));
  }

  /**
   * Generate advice using raw Stockfish (baseline comparison).
   */
  private async generateStockfishAdvice(
    playerContexts: Map<string, TurnContext>,
    _playerColor: PieceColor,
  ): Promise<OrchestratorTurnResult> {
    const start = Date.now();
    const sf = getStockfishAnalysis();
    if (!sf.isReady()) await sf.init();

    const advice: OrchestratorAdvice[] = [];

    for (const [playerId, ctx] of playerContexts) {
      sf.resetStrength();
      const evalResult = await sf.evaluate(ctx.fen, 18);
      advice.push({
        playerId,
        advice: `Best move: ${evalResult.bestMove}. Eval: ${(evalResult.scoreCp / 100).toFixed(2)}. Line: ${evalResult.pv}`,
        recommendedMove: evalResult.bestMove,
      });
    }

    return {
      advice,
      responseTimeMs: Date.now() - start,
    };
  }

  /**
   * Enhance LLM-generated advice with Stockfish analysis.
   */
  private async enhanceWithStockfish(
    advice: OrchestratorAdvice[],
    playerContexts: Map<string, TurnContext>,
  ): Promise<void> {
    const sf = getStockfishAnalysis();
    if (!sf.isReady()) await sf.init();

    for (const a of advice) {
      const ctx = playerContexts.get(a.playerId);
      if (!ctx) continue;

      sf.resetStrength();
      const evalResult = await sf.evaluate(ctx.fen, 12);
      if (!a.recommendedMove) {
        a.recommendedMove = evalResult.bestMove;
      }
      a.advice += ` [Engine confirms: ${evalResult.bestMove}, eval ${(evalResult.scoreCp / 100).toFixed(2)}]`;
    }
  }

  /**
   * Build a prompt for an individual player that includes orchestrator advice.
   */
  buildAdvisedPlayerPrompt(
    context: TurnContext,
    advice: OrchestratorAdvice,
  ): ChatMessage[] {
    const colorName = context.color === 'w' ? 'White' : 'Black';

    const systemPrompt = `You are playing chess as ${colorName}. You have received advice from your team's strategist. Consider their input, but make your own decision.

Respond with JSON: { "reasoning": "<your_analysis>", "move": "<move_in_SAN>" }`;

    const userPrompt = `Position (FEN): ${context.fen}
Turn: ${context.turnNumber}
Legal moves: ${context.legalMoves.join(', ')}

--- Strategist's Advice ---
${advice.advice}
${advice.recommendedMove ? `Recommended move: ${advice.recommendedMove}` : ''}

Make your move.`;

    return [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
  }

  /**
   * Have a player make a move given orchestrator advice.
   */
  async requestAdvisedMove(
    playerConfig: OrchestratorPlayerConfig,
    context: TurnContext,
    advice: OrchestratorAdvice,
    onToken?: (text: string) => void,
  ): Promise<PlayerMoveResult> {
    const start = Date.now();
    const messages = this.buildAdvisedPlayerPrompt(context, advice);

    const response = await this.llm.requestMoveRaw(
      playerConfig.model.model,
      messages,
      playerConfig.model.temperature,
      {
        reasoningOrder: playerConfig.model.reasoningOrder,
        outputFormat: playerConfig.model.outputFormat,
        promptLevel: playerConfig.model.promptLevel,
        linePrediction: playerConfig.model.linePrediction,
      },
      onToken,
    );

    const parsed = parseMoveResponse(response);
    const move = parsed?.move || '';
    const followedAdvice = advice.recommendedMove
      ? move.toLowerCase() === advice.recommendedMove.toLowerCase()
      : false;

    return {
      playerId: playerConfig.playerId,
      move,
      reasoning: parsed?.reasoning || '',
      followedAdvice,
      responseTimeMs: Date.now() - start,
    };
  }

  /**
   * Get the chain of command configuration.
   */
  getChainOfCommand(): ChainOfCommand {
    return this.config.chainOfCommand ?? 'single';
  }
}
