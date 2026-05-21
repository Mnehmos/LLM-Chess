import type { Episode } from '../types';
import { QGD_ORTHODOX_LESSON_PGN } from './pgn';
import { QGD_ORTHODOX_LESSON_COMMENTATOR } from './commentator';
import { QGD_ORTHODOX_VARIATIONS } from './variations';
import { QGD_ORTHODOX_LESSON_EXPORT } from './exports';

export const QGD_ORTHODOX_LESSON_EPISODE: Episode = {
  id: 'qgd_orthodox_lesson',
  track: 'lesson',
  title: "Queen's Gambit Declined Explained by an AI (Orthodox Defense, Move by Move)",
  summary:
    "An AI walks through the Queen's Gambit Declined (Orthodox Defense), playing both sides through Capablanca's freeing maneuver and explaining the QGD's structural tradeoffs — solid pawn chain, slightly cramped piece play, minority-attack endgames.",
  source: 'agent_generated',
  pgn: QGD_ORTHODOX_LESSON_PGN,
  commentator: QGD_ORTHODOX_LESSON_COMMENTATOR,
  exports: QGD_ORTHODOX_LESSON_EXPORT,
};

export {
  QGD_ORTHODOX_LESSON_PGN,
  QGD_ORTHODOX_LESSON_COMMENTATOR,
  QGD_ORTHODOX_VARIATIONS,
  QGD_ORTHODOX_LESSON_EXPORT,
};
