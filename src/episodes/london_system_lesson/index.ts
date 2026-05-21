import type { Episode } from '../types';
import { LONDON_SYSTEM_LESSON_PGN } from './pgn';
import { LONDON_SYSTEM_LESSON_COMMENTATOR } from './commentator';
import { LONDON_VARIATIONS } from './variations';
import { LONDON_SYSTEM_LESSON_EXPORT } from './exports';

export const LONDON_SYSTEM_LESSON_EPISODE: Episode = {
  id: 'london_system_lesson',
  track: 'lesson',
  title: 'London System Explained by an AI (Classical Bf4 Setup, Move by Move)',
  summary:
    "An AI walks through the London System (Classical Bf4 setup), playing both sides through the system-opening philosophy — no theory burden, rock-solid structure — that made it the most popular club opening of the 2020s.",
  source: 'agent_generated',
  pgn: LONDON_SYSTEM_LESSON_PGN,
  commentator: LONDON_SYSTEM_LESSON_COMMENTATOR,
  exports: LONDON_SYSTEM_LESSON_EXPORT,
};

export {
  LONDON_SYSTEM_LESSON_PGN,
  LONDON_SYSTEM_LESSON_COMMENTATOR,
  LONDON_VARIATIONS,
  LONDON_SYSTEM_LESSON_EXPORT,
};
