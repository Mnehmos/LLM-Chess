import type { EpisodeExportConfig } from '../types';

/**
 * Export configuration for the Praggnanandhaa-Rapport UzChess 2025
 * episode.
 *
 * Two shorts: the sacrifice setup (8.Qd2 through 16.exd5, the ...b5
 * pawn sac followed by ...Nxd5) and the refutation (22.gxf3 through
 * 27.Nb3, the 23.Bc4? Bc2!! sequence and the conversion start).
 * Together they cover the two famous decision points of the game.
 */
export const PRAGG_RAPPORT_UZCHESS_2025_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:pragg-rapport-uzchess-2025',
  outputRoot: 'exports',
  descriptionCandidates: [
    "Praggnanandhaa vs Rapport, Round 6 of the 2025 UzChess Cup Masters in Tashkent. King's Indian Sämisch with the deep ...Nxd5! piece sacrifice and the immortal 23...Bc2!! refutation that Kasparov called out as the move of the tournament. AI commentary by GPT 5.5.",
  ],
  shorts: [
    {
      id: 'pragg_rapport_pawn_sac_to_knight_sac',
      startMoveNumber: 8,
      endMoveNumber: 16,
      durationTargetSec: 75,
      hook: "Rapport sacrifices a pawn to crack White's king, then sacrifices a whole knight.",
      payoff: "...Nxd5! — the engine's top move and the entry to the rest of the game.",
      visualRequirements: [
        'arrow the ...b5 pawn sacrifice and the opening of the a- and c-files',
        'show the opposite-side castling pawn race (h4 vs ...h5, then ...e5)',
        'pause on the Nxd5 sacrifice with the engine evaluation overlaid',
      ],
    },
    {
      id: 'pragg_rapport_bc2_refutation',
      startMoveNumber: 22,
      endMoveNumber: 27,
      durationTargetSec: 75,
      hook: "Praggnanandhaa plays 23.Bc4 to defend, walking into the move Kasparov tweeted about.",
      payoff: "23...Bc2!! heading for a4 — not d1, not e4 — removes the defending knight and ends White's resistance.",
      cta: 'Subscribe for more game reviews from the Mnemosyne Research Institute.',
      visualRequirements: [
        'arrow Bc4 to show the apparent safety of the defense',
        'show the Bc2 + Ba4 route on the board with both moves arrowed',
        'highlight the Nb5 falling and the queenside files opening completely',
      ],
    },
  ],
};
