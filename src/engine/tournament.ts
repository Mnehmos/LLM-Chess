import { v4 as uuid } from 'uuid';
import { getRandomOpening } from './openings';
import type {
  GauntletTournamentConfig,
  GauntletTournamentState,
  GauntletMatchState,
  GauntletMatchConfig,
  PairRecord,
  PairResult,
  MatchResult,
  PieceColor,
  PlayerConfig,
  UHOOpening,
} from './types';

// --- Scoring ---

export function computePairResult(pair: PairRecord): PairResult | null {
  const [gameA, gameB] = pair.games;
  if (!gameA || !gameB) return null;

  const resultA = gameA.gameState.result;
  const resultB = gameB.gameState.result;
  if (!resultA || !resultB) return null;
  if (resultA.outcome === 'aborted' || resultB.outcome === 'aborted') return null;

  let cScore = 0;
  let dScore = 0;

  for (const game of [gameA, gameB]) {
    const r = game.gameState.result!;
    if (r.outcome === 'decisive') {
      const winnerIsChallenger = r.winner === game.challengerColor;
      if (winnerIsChallenger) cScore += 1;
      else dScore += 1;
    } else if (r.outcome === 'draw') {
      cScore += 0.5;
      dScore += 0.5;
    }
  }

  if (cScore > dScore) return 'challenger';
  if (dScore > cScore) return 'defender';
  return 'drawn';
}

export function computeMatchResult(match: GauntletMatchState): {
  result: MatchResult | null;
  challengerPairWins: number;
  defenderPairWins: number;
  canSkipPair3: boolean;
} {
  let cWins = 0;
  let dWins = 0;

  for (const pair of match.pairs) {
    if (pair.result === 'challenger') cWins++;
    if (pair.result === 'defender') dWins++;
  }

  const canSkipPair3 = cWins >= 2 || dWins >= 2;
  // A pair with both games present but no scored result (for example aborted games)
  // is treated as resolved for match progression.
  const allPairsResolved = match.pairs.every(
    p => p.result !== null || (p.games[0] !== null && p.games[1] !== null),
  );

  let result: MatchResult | null = null;
  if (cWins >= 2) result = 'challenger_wins';
  else if (dWins >= 2) result = 'defender_wins';
  else if (allPairsResolved) {
    if (cWins > dWins) result = 'challenger_wins';
    else if (dWins > cWins) result = 'defender_wins';
    else result = 'drawn';
  }

  return { result, challengerPairWins: cWins, defenderPairWins: dWins, canSkipPair3 };
}

// --- Initialization ---

function createPairRecord(index: number, opening: UHOOpening | null): PairRecord {
  return {
    pairIndex: index,
    opening,
    games: [null, null],
    challengerScore: 0,
    defenderScore: 0,
    result: null,
  };
}

export function createTournamentState(
  config: GauntletTournamentConfig,
): GauntletTournamentState {
  const matches: GauntletMatchState[] = config.defenders.map(defender => {
    const matchConfig: GauntletMatchConfig = {
      matchId: uuid(),
      challenger: config.challenger,
      defender,
      temperature: config.temperature,
      maxRetries: config.maxRetries,
    };

    const opening1 = getRandomOpening();
    const opening2 = getRandomOpening([opening1.id]);

    return {
      config: matchConfig,
      pairs: [
        createPairRecord(0, opening1), // Random UHO
        createPairRecord(1, opening2), // Random UHO (different)
        createPairRecord(2, null), // Assigned later if needed (different from both)
      ],
      currentPairIndex: 0,
      currentSlot: null,
      status: 'pending' as const,
      result: null,
      challengerPairWins: 0,
      defenderPairWins: 0,
    };
  });

  return {
    config,
    matches,
    currentMatchIndex: 0,
    status: 'setup',
    startedAt: null,
    completedAt: null,
  };
}

// --- Game Setup ---

export function getChallengerColor(_pairIndex: number, slot: 'a' | 'b'): PieceColor {
  return slot === 'a' ? 'w' : 'b';
}

export function buildGamePlayers(
  matchConfig: GauntletMatchConfig,
  challengerColor: PieceColor,
): { white: PlayerConfig; black: PlayerConfig } {
  const buildPlayer = (
    source: Omit<PlayerConfig, 'id' | 'color'>,
    color: PieceColor,
  ): PlayerConfig => ({
    ...source,
    id: uuid(),
    color,
    temperature: matchConfig.temperature,
    maxRetries: matchConfig.maxRetries,
  });

  const defenderColor: PieceColor = challengerColor === 'w' ? 'b' : 'w';
  const challenger = buildPlayer(matchConfig.challenger, challengerColor);
  const defender = buildPlayer(matchConfig.defender, defenderColor);

  return challengerColor === 'w'
    ? { white: challenger, black: defender }
    : { white: defender, black: challenger };
}

export function getPairFen(pair: PairRecord): string | undefined {
  return pair.opening?.fen;
}

export function assignPair3Opening(match: GauntletMatchState): UHOOpening {
  const excludeIds: string[] = [];
  if (match.pairs[0].opening?.id) excludeIds.push(match.pairs[0].opening.id);
  if (match.pairs[1].opening?.id) excludeIds.push(match.pairs[1].opening.id);
  return getRandomOpening(excludeIds.length > 0 ? excludeIds : undefined);
}
