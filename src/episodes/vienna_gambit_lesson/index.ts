import type { Episode } from '../types';
import { VIENNA_GAMBIT_LESSON_PGN } from './pgn';
import { VIENNA_GAMBIT_LESSON_COMMENTATOR } from './commentator';
import { VIENNA_VARIATIONS } from './variations';
import { VIENNA_GAMBIT_LESSON_EXPORT } from './exports';

export const VIENNA_GAMBIT_LESSON_EPISODE: Episode = {
  id: 'vienna_gambit_lesson',
  track: 'lesson',
  title: 'Vienna Game Explained by an AI (Vienna Gambit, Move by Move)',
  summary:
    'An AI walks through the Vienna Game (Vienna Gambit main line), playing both sides through the f4 thrust and the Falkbeer-style central counter-attack that defines this anti-theory 1.e4 weapon.',
  source: 'agent_generated',
  pgn: VIENNA_GAMBIT_LESSON_PGN,
  commentator: VIENNA_GAMBIT_LESSON_COMMENTATOR,
  exports: VIENNA_GAMBIT_LESSON_EXPORT,
};

export {
  VIENNA_GAMBIT_LESSON_PGN,
  VIENNA_GAMBIT_LESSON_COMMENTATOR,
  VIENNA_VARIATIONS,
  VIENNA_GAMBIT_LESSON_EXPORT,
};
