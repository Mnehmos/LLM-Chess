import type { Episode } from '../types';
import { KINGS_INDIAN_CLASSICAL_LESSON_PGN } from './pgn';
import { KINGS_INDIAN_CLASSICAL_LESSON_COMMENTATOR } from './commentator';
import { KINGS_INDIAN_VARIATIONS } from './variations';
import { KINGS_INDIAN_CLASSICAL_LESSON_EXPORT } from './exports';

export const KINGS_INDIAN_CLASSICAL_LESSON_EPISODE: Episode = {
  id: 'kings_indian_classical_lesson',
  track: 'lesson',
  title: "King's Indian Defense for Black",
  summary:
    "A black-side King's Indian Defense walkthrough covering the core setup, the Classical / Mar del Plata main line, and the opposite-wing pawnstorm race that defines the system.",
  source: 'agent_generated',
  pgn: KINGS_INDIAN_CLASSICAL_LESSON_PGN,
  commentator: KINGS_INDIAN_CLASSICAL_LESSON_COMMENTATOR,
  exports: KINGS_INDIAN_CLASSICAL_LESSON_EXPORT,
};

export {
  KINGS_INDIAN_CLASSICAL_LESSON_PGN,
  KINGS_INDIAN_CLASSICAL_LESSON_COMMENTATOR,
  KINGS_INDIAN_VARIATIONS,
  KINGS_INDIAN_CLASSICAL_LESSON_EXPORT,
};
