import type { Episode } from '../types';
import { CATALAN_OPEN_LESSON_PGN } from './pgn';
import { CATALAN_OPEN_LESSON_COMMENTATOR } from './commentator';
import { CATALAN_VARIATIONS } from './variations';
import { CATALAN_OPEN_LESSON_EXPORT } from './exports';

export const CATALAN_OPEN_LESSON_EPISODE: Episode = {
  id: 'catalan_open_lesson',
  track: 'lesson',
  title: 'Catalan Opening Explained by an AI (Open Defense, Move by Move)',
  summary:
    "An AI walks through the Catalan Opening (Open Defense main line), playing both sides through the c4 pawn grab, the Bg2 long-diagonal pressure, and the patient queen-recovery dance that made it Kramnik's main weapon.",
  source: 'agent_generated',
  pgn: CATALAN_OPEN_LESSON_PGN,
  commentator: CATALAN_OPEN_LESSON_COMMENTATOR,
  exports: CATALAN_OPEN_LESSON_EXPORT,
};

export {
  CATALAN_OPEN_LESSON_PGN,
  CATALAN_OPEN_LESSON_COMMENTATOR,
  CATALAN_VARIATIONS,
  CATALAN_OPEN_LESSON_EXPORT,
};
