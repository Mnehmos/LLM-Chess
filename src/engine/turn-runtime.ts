import { applyEvalAwareness, getProbesForMove } from './eval-awareness';
import { applyFog, generateBoardReport } from './fog-of-war';
import { getToolkitPromptSection } from './response-toolkit';
import { Scratchpad } from './scratchpad';
import { applyAttacks } from './attacks';
import { TransitionManager } from './transitions';
import type {
  AdvisorConfig,
  AttackVector,
  BenchmarkFraming,
  FogVisibilityMode,
  InjectionEvent,
  PlayerConfig,
  ResponseToolInvocation,
  TurnContext,
} from './types';
import { buildSystemPrompt } from '../llm/prompts';

export interface PreparedTurn {
  player: PlayerConfig;
  context: TurnContext;
  advisorConfig?: AdvisorConfig;
  benchmarkFraming?: BenchmarkFraming;
  fogVisibilityMode?: FogVisibilityMode;
  activeAttacks: AttackVector[];
  firedInjectionEvents: InjectionEvent[];
}

export interface TurnRuntimeState {
  scratchpad?: Scratchpad;
  pendingSecondOpinion?: string;
  priorFens: string[];
  toolHistory: ResponseToolInvocation[];
}

export function prepareTurn(
  player: PlayerConfig,
  context: TurnContext,
  state: TurnRuntimeState,
): PreparedTurn {
  const preparedPlayer: PlayerConfig = {
    ...player,
    advisor: player.advisor ? { ...player.advisor } : undefined,
    constraints: player.constraints ? { ...player.constraints } : undefined,
    fogOfWar: player.fogOfWar ? { ...player.fogOfWar } : undefined,
    transition: player.transition ? { ...player.transition } : undefined,
    graduatedResponse: player.graduatedResponse ? { ...player.graduatedResponse } : undefined,
    linePrediction: player.linePrediction ? { ...player.linePrediction } : undefined,
    evalAwareness: player.evalAwareness ? { ...player.evalAwareness } : undefined,
    turnInfoToggles: player.turnInfoToggles ? { ...player.turnInfoToggles } : undefined,
  };

  const preparedContext: TurnContext = {
    ...context,
    moveHistory: [...context.moveHistory],
    moveRecords: [...context.moveRecords],
    legalMoves: [...context.legalMoves],
    promptInjections: [],
  };

  if (preparedPlayer.contextMode === 'stateless' || preparedPlayer.contextMode === 'stateless_scratchpad') {
    preparedContext.moveHistory = [];
    preparedContext.moveRecords = [];
    preparedContext.lastMove = undefined;
  }

  if (preparedPlayer.contextMode === 'stateless_scratchpad' && state.scratchpad) {
    preparedContext.promptInjections!.push(state.scratchpad.getPromptInstructions());
  }

  let systemPrompt = buildSystemPrompt(preparedPlayer);
  systemPrompt = applyEvalAwareness(systemPrompt, preparedPlayer.evalAwareness);

  if (preparedPlayer.evalAwareness?.enabled) {
    preparedContext.promptInjections!.push(...getProbesForMove(preparedPlayer.evalAwareness, context.turnNumber));
  }

  let fogVisibilityMode: FogVisibilityMode | undefined;
  if (preparedPlayer.fogOfWar?.enabled) {
    const fogState = applyFog(context.fen, context.color, preparedPlayer.fogOfWar, context.moveHistory);
    preparedContext.fen = fogState.visibleFen;
    preparedContext.boardDisplay = fogState.asciiBoard;
    fogVisibilityMode = fogState.mode;

    if (preparedPlayer.fogOfWar.visibilityMode === 'no_board') {
      preparedContext.promptInjections!.push(generateBoardReport(
        context.fen,
        preparedPlayer.fogOfWar.advisorReporterType ?? 'honest',
        preparedPlayer.fogOfWar,
        context.turnNumber,
        state.priorFens,
      ));
    }
  }

  const phase = inferPhase(context.turnNumber, context.moveRecords.length);
  const transitionManager = preparedPlayer.transition && preparedPlayer.attacks?.length
    ? new TransitionManager(preparedPlayer.transition, preparedPlayer.attacks)
    : null;

  let activeAttacks = transitionManager
    ? transitionManager.getActiveAttacks(context.turnNumber, phase)
    : (preparedPlayer.attacks ?? []);

  const firedInjectionEvents: InjectionEvent[] = transitionManager
    ? transitionManager.processScheduledEvents(context.turnNumber)
    : [];

  if (transitionManager) {
    for (const event of firedInjectionEvents) {
      switch (event.eventType) {
        case 'advisor_swap':
          preparedPlayer.advisor = {
            ...(preparedPlayer.advisor ?? { enabled: true }),
            stockfishElo: event.payload.newElo as number,
          };
          break;
        case 'label_change':
          if (preparedPlayer.advisor) {
            preparedPlayer.advisor = {
              ...preparedPlayer.advisor,
              visibility: event.payload.newVisibility as typeof preparedPlayer.advisor.visibility,
            };
          }
          break;
        case 'system_prompt_change':
          systemPrompt = event.payload.newPrompt as string;
          break;
        case 'eval_injection':
          preparedContext.promptInjections!.push(`Injected evaluation: ${String(event.payload.evalText ?? '')}`);
          break;
        case 'constraint_change':
          preparedPlayer.constraints = {
            ...(preparedPlayer.constraints ?? {}),
            ...(event.payload as Record<string, unknown>),
          } as PlayerConfig['constraints'];
          break;
        case 'framing_shift':
          if (preparedPlayer.evalAwareness?.enabled) {
            preparedPlayer.evalAwareness = {
              ...preparedPlayer.evalAwareness,
              framing: event.payload.newFraming as BenchmarkFraming,
            };
          }
          break;
        case 'attack_vector':
          activeAttacks = [
            ...activeAttacks,
            {
              channel: event.payload.channel as AttackVector['channel'],
              vectorId: event.payload.vectorId as string,
              description: String(event.payload.description ?? 'Scheduled attack'),
              params: (event.payload.params as Record<string, unknown>) ?? {},
            },
          ];
          break;
      }
    }
  }

  const attacked = activeAttacks.length > 0
    ? applyAttacks(
        activeAttacks,
        systemPrompt,
        preparedContext.fen,
        preparedContext.moveHistory,
        preparedPlayer.advisor?.enabled ? preparedPlayer.advisor : undefined,
      )
    : null;

  if (attacked) {
    systemPrompt = attacked.modifiedPrompt;
    preparedContext.fen = attacked.modifiedFen;
    preparedContext.moveHistory = attacked.modifiedHistory;
    preparedContext.promptInjections!.push(...attacked.injectedTexts);
    preparedPlayer.advisor = attacked.modifiedAdvisor;
  }

  if (state.pendingSecondOpinion) {
    preparedContext.promptInjections!.push(state.pendingSecondOpinion);
  }

  if (preparedPlayer.graduatedResponse?.enabled) {
    const toolkitPrompt = getToolkitPromptSection(preparedPlayer.graduatedResponse);
    if (toolkitPrompt) {
      systemPrompt = `${systemPrompt}\n\n${toolkitPrompt}`;
    }
  }

  preparedPlayer.systemPrompt = systemPrompt;
  if (preparedContext.promptInjections && preparedContext.promptInjections.length === 0) {
    delete preparedContext.promptInjections;
  }

  return {
    player: preparedPlayer,
    context: preparedContext,
    advisorConfig: preparedPlayer.advisor?.enabled ? preparedPlayer.advisor : undefined,
    benchmarkFraming: preparedPlayer.evalAwareness?.enabled
      ? (preparedPlayer.evalAwareness.framing ?? 'standard')
      : undefined,
    fogVisibilityMode,
    activeAttacks,
    firedInjectionEvents,
  };
}

function inferPhase(turnNumber: number, moveCount: number): string {
  if (turnNumber <= 10) return 'opening';
  if (moveCount >= 50) return 'endgame';
  return 'middlegame';
}
