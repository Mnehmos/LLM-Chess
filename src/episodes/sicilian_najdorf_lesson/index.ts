import type { Episode } from '../types';
import { SICILIAN_NAJDORF_LESSON_PGN } from './pgn';
import { SICILIAN_NAJDORF_LESSON_COMMENTATOR } from './commentator';
import { SICILIAN_NAJDORF_VARIATIONS } from './variations';
import { SICILIAN_NAJDORF_LESSON_EXPORT } from './exports';

export const SICILIAN_NAJDORF_LESSON_EPISODE: Episode = {
  id: 'sicilian_najdorf_lesson',
  track: 'lesson',
  title: 'Sicilian Defense Explained by an AI (Najdorf Variation, Move by Move)',
  summary:
    'An AI walks through the Sicilian Najdorf (English Attack main line), playing both sides through opposite-side castling and explaining each idea — the Open Sicilian break, the ...a6 move, the f3-Be3-Qd2-O-O-O setup — in real time.',
  source: 'agent_generated',
  pgn: SICILIAN_NAJDORF_LESSON_PGN,
  commentator: SICILIAN_NAJDORF_LESSON_COMMENTATOR,
  exports: SICILIAN_NAJDORF_LESSON_EXPORT,
};

export {
  SICILIAN_NAJDORF_LESSON_PGN,
  SICILIAN_NAJDORF_LESSON_COMMENTATOR,
  SICILIAN_NAJDORF_VARIATIONS,
  SICILIAN_NAJDORF_LESSON_EXPORT,
};
