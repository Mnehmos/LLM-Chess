import type { Episode } from '../types';
import { RUY_LOPEZ_LESSON_PGN } from './pgn';
import { RUY_LOPEZ_LESSON_COMMENTATOR } from './commentator';
import { RUY_LOPEZ_VARIATIONS } from './variations';
import { RUY_LOPEZ_LESSON_EXPORT } from './exports';

export const RUY_LOPEZ_LESSON_EPISODE: Episode = {
  id: 'ruy_lopez_lesson',
  track: 'lesson',
  title: 'Ruy Lopez Explained by an AI (Closed Defense, Move by Move)',
  summary:
    "An AI walks through the Ruy Lopez (Closed Defense main line), playing both sides of a 12-move demonstration and explaining each idea — the pin on c6, the Spanish bishop's long retreat, and the c3-d4 break — in real time.",
  source: 'agent_generated',
  pgn: RUY_LOPEZ_LESSON_PGN,
  commentator: RUY_LOPEZ_LESSON_COMMENTATOR,
  exports: RUY_LOPEZ_LESSON_EXPORT,
};

export {
  RUY_LOPEZ_LESSON_PGN,
  RUY_LOPEZ_LESSON_COMMENTATOR,
  RUY_LOPEZ_VARIATIONS,
  RUY_LOPEZ_LESSON_EXPORT,
};
