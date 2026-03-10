export const MIN_STOCKFISH_ELO = 600;
export const MIN_LIMIT_STRENGTH_ELO = 1320;
export const MAX_STOCKFISH_ELO = 3190;
export const DEFAULT_STOCKFISH_ELO = 2000;
export const STOCKFISH_ELO_STEP = 10;
const MAX_SKILL_LEVEL = 20;

export interface StockfishStrengthProfile {
  requestedElo: number;
  effectiveElo: number;
  mode: 'full_strength' | 'uci_elo' | 'skill_level';
  skillLevel?: number;
  preCommands: string[];
  postCommands: string[];
  description: string;
}

export function clampStockfishElo(elo: number | undefined): number {
  const requested = typeof elo === 'number' && Number.isFinite(elo) ? elo : DEFAULT_STOCKFISH_ELO;
  const rounded = Math.round(requested / STOCKFISH_ELO_STEP) * STOCKFISH_ELO_STEP;
  return Math.min(MAX_STOCKFISH_ELO, Math.max(MIN_STOCKFISH_ELO, rounded));
}

export function eloToSkillLevel(elo: number): number {
  const effectiveElo = clampStockfishElo(elo);
  if (effectiveElo >= MIN_LIMIT_STRENGTH_ELO) return MAX_SKILL_LEVEL;
  const ratio = (effectiveElo - MIN_STOCKFISH_ELO) / (MIN_LIMIT_STRENGTH_ELO - MIN_STOCKFISH_ELO);
  return Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.round(ratio * MAX_SKILL_LEVEL)));
}

export function buildStockfishStrengthProfile(elo: number | undefined): StockfishStrengthProfile {
  const effectiveElo = clampStockfishElo(elo);
  const postCommands = [
    'setoption name UCI_LimitStrength value false',
    `setoption name Skill Level value ${MAX_SKILL_LEVEL}`,
  ];

  if (effectiveElo === MAX_STOCKFISH_ELO) {
    return {
      requestedElo: elo ?? DEFAULT_STOCKFISH_ELO,
      effectiveElo,
      mode: 'full_strength',
      preCommands: postCommands,
      postCommands,
      description: 'maximum strength',
    };
  }

  if (effectiveElo >= MIN_LIMIT_STRENGTH_ELO) {
    return {
      requestedElo: elo ?? DEFAULT_STOCKFISH_ELO,
      effectiveElo,
      mode: 'uci_elo',
      preCommands: [
        `setoption name Skill Level value ${MAX_SKILL_LEVEL}`,
        'setoption name UCI_LimitStrength value true',
        `setoption name UCI_Elo value ${effectiveElo}`,
      ],
      postCommands,
      description: `ELO ${effectiveElo}`,
    };
  }

  const skillLevel = eloToSkillLevel(effectiveElo);
  return {
    requestedElo: elo ?? DEFAULT_STOCKFISH_ELO,
    effectiveElo,
    mode: 'skill_level',
    skillLevel,
    preCommands: [
      'setoption name UCI_LimitStrength value false',
      `setoption name Skill Level value ${skillLevel}`,
    ],
    postCommands,
    description: `approx. ${effectiveElo} ELO (Skill ${skillLevel})`,
  };
}
