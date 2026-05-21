import type { Episode } from '../types';
import { ENGLISH_SYMMETRICAL_LESSON_PGN } from './pgn';
import { ENGLISH_SYMMETRICAL_LESSON_COMMENTATOR } from './commentator';
import { ENGLISH_VARIATIONS } from './variations';
import { ENGLISH_SYMMETRICAL_LESSON_EXPORT } from './exports';

export const ENGLISH_SYMMETRICAL_LESSON_EPISODE: Episode = {
  id: 'english_symmetrical_lesson',
  track: 'lesson',
  title: 'English Opening Explained by an AI (Symmetrical Variation, Move by Move)',
  summary:
    "An AI walks through the English Opening (Symmetrical Variation), playing both sides through the double fianchetto and queenside expansion race that defines the most transpositional opening in chess.",
  source: 'agent_generated',
  pgn: ENGLISH_SYMMETRICAL_LESSON_PGN,
  commentator: ENGLISH_SYMMETRICAL_LESSON_COMMENTATOR,
  exports: ENGLISH_SYMMETRICAL_LESSON_EXPORT,
};

export {
  ENGLISH_SYMMETRICAL_LESSON_PGN,
  ENGLISH_SYMMETRICAL_LESSON_COMMENTATOR,
  ENGLISH_VARIATIONS,
  ENGLISH_SYMMETRICAL_LESSON_EXPORT,
};
