import type { EpisodeExportConfig } from '../types';

/**
 * Export configuration for the Opera Game episode.
 *
 * Two shorts: the buildup (development through castling-with-check,
 * moves 8-12) and the finishing combination (rook sacrifice through
 * mate, moves 13-17). Together they cover the full game; published
 * separately each is a standalone tactical lesson.
 */
export const OPERA_GAME_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:opera-game',
  outputRoot: 'exports',
  descriptionCandidates: [
    'A patient walkthrough of Paul Morphy\'s 1858 Opera Game — the most famous game in chess history, played in 17 moves at the Salle Le Peletier opera house in Paris during a performance of Bellini\'s Norma. Commentary by GPT 5.5.',
  ],
  shorts: [
    {
      id: 'opera_game_setup',
      startMoveNumber: 8,
      endMoveNumber: 12,
      durationTargetSec: 75,
      hook: 'Morphy sets the trap.',
      payoff: 'Five moves take the position from "normal opening" to "Black\'s king has nowhere to hide."',
      visualRequirements: [
        'show the Bg5 pin and the b5 weakening',
        'arrow the Nxb5 sacrifice and the recaptures',
        'highlight the d-file opening up after O-O-O',
      ],
    },
    {
      id: 'opera_game_combination',
      startMoveNumber: 13,
      endMoveNumber: 17,
      durationTargetSec: 75,
      hook: 'The five-move combination that ends in checkmate.',
      payoff: 'The queen sacrifice on move 16 (Qb8+!!) is what makes this game immortal.',
      cta: 'Subscribe for more historic-game reviews from the Mnemosyne Research Institute.',
      visualRequirements: [
        'show the Rxd7 exchange sacrifice clearly',
        'arrow Bxd7+ then Qb8+!! then Rd8#',
        'pause on the final position with mate annotated',
      ],
    },
  ],
};
