export const DEFAULT_ELO = 1200;
export const ELO_K = 32;

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

export function applyEloScore(playerElo: number, opponentElo: number, score: 0 | 0.5 | 1): number {
  const expected = expectedScore(playerElo, opponentElo);
  return Math.round(playerElo + ELO_K * (score - expected));
}

export function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  isDraw: boolean,
): { winnerNew: number; loserNew: number } {
  const expectedWinner = expectedScore(winnerElo, loserElo);
  const expectedLoser = 1 - expectedWinner;

  const scoreWinner = isDraw ? 0.5 : 1;
  const scoreLoser = isDraw ? 0.5 : 0;

  return {
    winnerNew: Math.round(winnerElo + ELO_K * (scoreWinner - expectedWinner)),
    loserNew: Math.round(loserElo + ELO_K * (scoreLoser - expectedLoser)),
  };
}
