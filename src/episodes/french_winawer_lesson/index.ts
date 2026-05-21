import type { Episode } from '../types';
import { FRENCH_WINAWER_LESSON_PGN } from './pgn';
import { FRENCH_WINAWER_LESSON_COMMENTATOR } from './commentator';
import { FRENCH_WINAWER_VARIATIONS } from './variations';
import { FRENCH_WINAWER_LESSON_EXPORT } from './exports';

export const FRENCH_WINAWER_LESSON_EPISODE: Episode = {
  id: 'french_winawer_lesson',
  track: 'lesson',
  title: 'French Defense Explained by an AI (Winawer Variation, Move by Move)',
  summary:
    "An AI walks through the French Defense (Winawer Variation), playing both sides through the Bb4 pin, the bxc3 doubled-pawn structure, and the race between White's bishop pair and Black's queenside expansion.",
  source: 'agent_generated',
  pgn: FRENCH_WINAWER_LESSON_PGN,
  commentator: FRENCH_WINAWER_LESSON_COMMENTATOR,
  exports: FRENCH_WINAWER_LESSON_EXPORT,
};

export {
  FRENCH_WINAWER_LESSON_PGN,
  FRENCH_WINAWER_LESSON_COMMENTATOR,
  FRENCH_WINAWER_VARIATIONS,
  FRENCH_WINAWER_LESSON_EXPORT,
};
