import type { Episode } from '../types';
import { OPERA_GAME_PGN } from './pgn';
import { OPERA_GAME_COMMENTATOR } from './commentator';
import { OPERA_GAME_HISTORICAL_CONTEXT } from './research';
import { OPERA_GAME_EXPORT } from './exports';

export const OPERA_GAME_EPISODE: Episode = {
  id: 'opera_game_morphy_1858',
  track: 'historical',
  title: 'The Opera Game — Morphy vs Brunswick and Isouard, 1858',
  summary:
    'Paul Morphy beats two consulting aristocrats in 17 moves at the Paris Opera, finishing with the queen sacrifice and rook mate that has been taught to chess students for the next 168 years.',
  source: 'public_domain',
  pgn: OPERA_GAME_PGN,
  commentator: OPERA_GAME_COMMENTATOR,
  historicalContext: OPERA_GAME_HISTORICAL_CONTEXT,
  exports: OPERA_GAME_EXPORT,
};

export {
  OPERA_GAME_PGN,
  OPERA_GAME_COMMENTATOR,
  OPERA_GAME_HISTORICAL_CONTEXT,
  OPERA_GAME_EXPORT,
};
