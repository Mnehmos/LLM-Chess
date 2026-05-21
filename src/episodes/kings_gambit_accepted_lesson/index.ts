import type { Episode } from '../types';
import { KINGS_GAMBIT_ACCEPTED_LESSON_PGN } from './pgn';
import { KINGS_GAMBIT_ACCEPTED_LESSON_COMMENTATOR } from './commentator';
import { KINGS_GAMBIT_VARIATIONS } from './variations';
import { KINGS_GAMBIT_ACCEPTED_LESSON_EXPORT } from './exports';

export const KINGS_GAMBIT_ACCEPTED_LESSON_EPISODE: Episode = {
  id: 'kings_gambit_accepted_lesson',
  track: 'lesson',
  title: "King's Gambit Explained by an AI (Accepted — Modern Defense, Move by Move)",
  summary:
    "An AI walks through the King's Gambit Accepted (Modern Defense), playing both sides through the romantic-era f-pawn sacrifice — Morphy, Anderssen, and 19th-century chess at its most attacking.",
  source: 'agent_generated',
  pgn: KINGS_GAMBIT_ACCEPTED_LESSON_PGN,
  commentator: KINGS_GAMBIT_ACCEPTED_LESSON_COMMENTATOR,
  exports: KINGS_GAMBIT_ACCEPTED_LESSON_EXPORT,
};

export {
  KINGS_GAMBIT_ACCEPTED_LESSON_PGN,
  KINGS_GAMBIT_ACCEPTED_LESSON_COMMENTATOR,
  KINGS_GAMBIT_VARIATIONS,
  KINGS_GAMBIT_ACCEPTED_LESSON_EXPORT,
};
