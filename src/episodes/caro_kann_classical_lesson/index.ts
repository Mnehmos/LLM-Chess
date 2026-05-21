import type { Episode } from '../types';
import { CARO_KANN_CLASSICAL_LESSON_PGN } from './pgn';
import { CARO_KANN_CLASSICAL_LESSON_COMMENTATOR } from './commentator';
import { CARO_KANN_VARIATIONS } from './variations';
import { CARO_KANN_CLASSICAL_LESSON_EXPORT } from './exports';

export const CARO_KANN_CLASSICAL_LESSON_EPISODE: Episode = {
  id: 'caro_kann_classical_lesson',
  track: 'lesson',
  title: 'Caro-Kann Defense Explained by an AI (Classical Variation, Move by Move)',
  summary:
    'An AI walks through the Caro-Kann Defense (Classical Variation), playing both sides through the e4 trade, the h4-h5 chase, and the bishop swap on h7 — explaining the structural advantage over the French in real time.',
  source: 'agent_generated',
  pgn: CARO_KANN_CLASSICAL_LESSON_PGN,
  commentator: CARO_KANN_CLASSICAL_LESSON_COMMENTATOR,
  exports: CARO_KANN_CLASSICAL_LESSON_EXPORT,
};

export {
  CARO_KANN_CLASSICAL_LESSON_PGN,
  CARO_KANN_CLASSICAL_LESSON_COMMENTATOR,
  CARO_KANN_VARIATIONS,
  CARO_KANN_CLASSICAL_LESSON_EXPORT,
};
