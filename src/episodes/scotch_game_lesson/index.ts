import type { Episode } from '../types';
import { SCOTCH_GAME_LESSON_PGN } from './pgn';
import { SCOTCH_GAME_LESSON_COMMENTATOR } from './commentator';
import { SCOTCH_VARIATIONS } from './variations';
import { SCOTCH_GAME_LESSON_EXPORT } from './exports';

export const SCOTCH_GAME_LESSON_EPISODE: Episode = {
  id: 'scotch_game_lesson',
  track: 'lesson',
  title: 'Scotch Game Explained by an AI (Classical Variation, Move by Move)',
  summary:
    "An AI walks through the Scotch Game (Classical Variation), playing both sides through the d4 central break that defines Kasparov's preferred anti-Ruy weapon.",
  source: 'agent_generated',
  pgn: SCOTCH_GAME_LESSON_PGN,
  commentator: SCOTCH_GAME_LESSON_COMMENTATOR,
  exports: SCOTCH_GAME_LESSON_EXPORT,
};

export {
  SCOTCH_GAME_LESSON_PGN,
  SCOTCH_GAME_LESSON_COMMENTATOR,
  SCOTCH_VARIATIONS,
  SCOTCH_GAME_LESSON_EXPORT,
};
