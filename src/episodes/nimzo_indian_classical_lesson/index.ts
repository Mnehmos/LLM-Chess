import type { Episode } from '../types';
import { NIMZO_INDIAN_CLASSICAL_LESSON_PGN } from './pgn';
import { NIMZO_INDIAN_CLASSICAL_LESSON_COMMENTATOR } from './commentator';
import { NIMZO_INDIAN_VARIATIONS } from './variations';
import { NIMZO_INDIAN_CLASSICAL_LESSON_EXPORT } from './exports';

export const NIMZO_INDIAN_CLASSICAL_LESSON_EPISODE: Episode = {
  id: 'nimzo_indian_classical_lesson',
  track: 'lesson',
  title: 'Nimzo-Indian Defense Explained by an AI (Classical / Capablanca, Move by Move)',
  summary:
    "An AI walks through the Nimzo-Indian Defense (Classical / Capablanca Variation), playing both sides through the Bb4 pin, the bishop trade on c3, and Nimzowitsch's structural bargain — doubled pawns for dark-square control.",
  source: 'agent_generated',
  pgn: NIMZO_INDIAN_CLASSICAL_LESSON_PGN,
  commentator: NIMZO_INDIAN_CLASSICAL_LESSON_COMMENTATOR,
  exports: NIMZO_INDIAN_CLASSICAL_LESSON_EXPORT,
};

export {
  NIMZO_INDIAN_CLASSICAL_LESSON_PGN,
  NIMZO_INDIAN_CLASSICAL_LESSON_COMMENTATOR,
  NIMZO_INDIAN_VARIATIONS,
  NIMZO_INDIAN_CLASSICAL_LESSON_EXPORT,
};
