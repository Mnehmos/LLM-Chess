import type { Episode } from '../types';
import { ITALIAN_GAME_LESSON_PGN } from './pgn';
import { ITALIAN_GAME_LESSON_COMMENTATOR } from './commentator';
import { ITALIAN_GAME_VARIATIONS } from './variations';
import { ITALIAN_GAME_EXPORT } from './exports';

/**
 * The Italian Game — opening lesson.
 *
 * The PGN is a curated 12-move teaching line through the Giuoco Piano
 * main line. The commentator is in TEACHER mode (first-person voice,
 * lessonContext set), making this the first "AI teaches X opening"
 * style episode in the catalog.
 *
 * source = 'agent_generated' rather than 'public_domain' or
 * 'licensed' because this isn't a historical game — it's an AI demo.
 */
export const ITALIAN_GAME_LESSON_EPISODE: Episode = {
  id: 'italian_game_lesson',
  track: 'lesson',
  title: 'Italian Game Explained by an AI (Giuoco Piano, Move by Move)',
  summary:
    'An AI walks through the Italian Game (Giuoco Piano main line), playing both sides of a 12-move demonstration and explaining each idea in real time.',
  source: 'agent_generated',
  pgn: ITALIAN_GAME_LESSON_PGN,
  commentator: ITALIAN_GAME_LESSON_COMMENTATOR,
  exports: ITALIAN_GAME_EXPORT,
};

export {
  ITALIAN_GAME_LESSON_PGN,
  ITALIAN_GAME_LESSON_COMMENTATOR,
  ITALIAN_GAME_VARIATIONS,
  ITALIAN_GAME_EXPORT,
};
