import type {
  Episode,
  EpisodeChapter,
  KeyIdeasBlock,
  WhatToWatchBlock,
  FunFact,
  BoardBranch,
  WhiteboardScene,
} from '../types';
import { PRAGG_RAPPORT_UZCHESS_2025_PGN } from './pgn';
import { PRAGG_RAPPORT_UZCHESS_2025_COMMENTATOR } from './commentator';
import { PRAGG_RAPPORT_UZCHESS_2025_HISTORICAL_CONTEXT } from './research';
import { PRAGG_RAPPORT_UZCHESS_2025_EXPORT } from './exports';

// ─── Chapter map ────────────────────────────────────────────────
// 37 full moves = up to ply 74. Chapters segment the lesson into
// the recognized phases of the game: opening setup, the ...b5 pawn
// sacrifice premise, the opposite-side castling pawn race, the
// 15...Nxd5! piece sacrifice, the quiet maneuvering moves that
// follow, the 23.Bc4? / ...Bc2!! refutation, and the conversion.

const PRAGG_RAPPORT_CHAPTERS: EpisodeChapter[] = [
  {
    ply: 0,
    title: 'The Sämisch Setup',
    subtitle: 'f3 + e4 + Nge2 — White builds a big classical center',
  },
  {
    ply: 12, // after 6...a6
    title: 'Rapport Throws the First Punch',
    subtitle: '...a6 + ...b5 — sacrificing the pawn to open files',
  },
  {
    ply: 19, // after 10.O-O-O
    title: 'Opposite Castling, Pawn Race',
    subtitle: 'Kings on opposite sides — pawns become the attackers',
  },
  {
    ply: 29, // before 15...Nxd5
    title: 'Burning the Bridge — ...Nxd5!',
    subtitle: 'A full knight for activity, initiative, and time',
  },
  {
    ply: 36, // before 19.Bc4
    title: 'The Quiet Hammers',
    subtitle: '...Ra4 and ...Qd7 — voluntarily moving slowly while down a piece',
  },
  {
    ply: 45, // before 23...Bc2
    title: 'Kasparov\'s Tweet — ...Bc2!!',
    subtitle: '23.Bc4? walks into the bishop tour to a4',
  },
  {
    ply: 55, // after 28.Qxc4
    title: 'Every Piece Works',
    subtitle: 'Conversion — open files, two bishops, no counterplay',
  },
];

// ─── Key ideas per chapter ─────────────────────────────────────

const PRAGG_RAPPORT_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      'Sämisch = f3 + e4 + Nge2 + Be3, supporting a huge classical center.',
      'White\'s plan: castle long, push h4/h5 pawn storm against Black\'s kingside fianchetto.',
      'Black\'s problem: White owns the center; passive setups lose slowly.',
      'Rapport solves it by attacking on the queenside BEFORE the center can crush him.',
    ],
  },
  {
    chapterPly: 12,
    ideas: [
      '7...Nbd7 + 8.Qd2 b5! — a long-standing theoretical Sämisch pawn sacrifice.',
      'The point is NOT to recover the pawn — it\'s to crack open the a- and c-files.',
      'White\'s king will castle long; every open file points at it.',
      '8...c5 is the "classical" KID setup; ...b5 is the SHARP setup.',
    ],
  },
  {
    chapterPly: 19,
    ideas: [
      'Both sides castle on opposite wings — kings on c1/g8 (here b1/g8 after Kb1).',
      'When kings castle opposite, pawn storms decide the game. Whoever lands the first sacrifice wins.',
      '10...e5! locks the center — Black says "no central counter-strike for you, race the pawns."',
      '11.d5 closes the center fully; now it\'s pure pawn-storm vs pawn-storm.',
    ],
  },
  {
    chapterPly: 29,
    ideas: [
      '15...Nxd5! sacrifices a knight that is protected by three White pieces (pawns + Nc3).',
      'Both players knew this was a TOP ENGINE LINE — preparation, not improvisation.',
      'Black gets: bishop pair, open c- and a-files, the long diagonal, and TIME.',
      'White is structurally fine but cannot easily develop the f1-bishop or activate the queen.',
    ],
  },
  {
    chapterPly: 36,
    ideas: [
      '17...Ra4! — a quiet maneuvering move while down material. The rook lifts to attack b4 from a4.',
      '18...Qd7 — even quieter. The queen makes ROOM for the rooks to double up on open files.',
      'When you sacrifice a piece, you must avoid moves that "look forcing" — slow improvement is the engine\'s top choice.',
      'Praggnanandhaa cannot generate a counter-threat: every White piece has a defensive job.',
    ],
  },
  {
    chapterPly: 45,
    ideas: [
      'Pragg\'s post-game regret: he meant to play 23.Nd4 to consolidate; he chose 23.Bc4? instead.',
      '23...Bc2!! — Kasparov publicly praised this on social media. The bishop heads for a4, NOT d1.',
      'On a4, the bishop removes the defending Nb5, and the queenside collapses immediately.',
      'This is a "geometric" idea — most bishop-decoys go to d1 or e4; this one is unique to this position.',
    ],
  },
  {
    chapterPly: 55,
    ideas: [
      'Rapport finds the precise move every turn — Rxc4 even gives back the exchange to keep pieces working.',
      'Every Black piece has a job: queen attacks, bishop pins, rooks dominate open files.',
      'White is reduced to passive defense; no piece can create a threat.',
      'Praggnanandhaa\'s position is one of the most uncomfortable defensive positions you can have at this level.',
    ],
  },
];

const PRAGG_RAPPORT_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  {
    chapterPly: 0,
    text:
      'Watch how White commits to a setup that demands one specific plan — castle long, push h-pawn. The Sämisch is committal: once White plays f3 and Nge2, the kingside attack has to happen. Rapport reads that and prepares his own counter-attack on the OTHER side of the board.',
  },
  {
    chapterPly: 12,
    text:
      'Watch the calculation behind 8...b5. Rapport is sacrificing a pawn before the position even has a structure. He has to see, in advance, that the open files will give him enough activity to compensate. Most grandmasters wouldn\'t — they\'d play 8...c5. Rapport plays for the dynamic, not the safe.',
  },
  {
    chapterPly: 19,
    text:
      'Watch the pawn race. White\'s h4 vs Black\'s ...h5 — Praggnanandhaa pushes; Rapport refuses to let the h-file open. Then ...e5 to lock the center. With the center fixed and the kings opposite, the question becomes WHOSE pawns get there first.',
  },
  {
    chapterPly: 29,
    text:
      'Watch Praggnanandhaa\'s body language frozen on the engine\'s top move. Both sides expected this. The interesting question is HOW Rapport plays the resulting position — whether he can convert engine-evaluation into win-rate against a 2767.',
  },
  {
    chapterPly: 36,
    text:
      'Watch what Black does NOT do. No forcing moves. No checks. No captures. Slow rook lifts and queen redeployments. When you have sacrificed material, the worst thing you can do is force the issue — you have to let the opponent\'s discomfort grow.',
  },
  {
    chapterPly: 45,
    text:
      'Watch this whole sequence twice. 23.Bc4? walks into a refutation that is invisible at human depth. The bishop tour Bc2-Ba4 removes the defender and ends the game. Kasparov tweeted about this move — he doesn\'t tweet about chess games often.',
  },
  {
    chapterPly: 55,
    text:
      'Watch how clinical the finish is. No tactical fireworks — just every Black piece scoring small gains every move. The b-pawn marches, the queen finds f2, the rook finds e3. White is paralyzed and Pragg resigns when there is nothing left to defend.',
  },
];

const PRAGG_RAPPORT_FUN_FACTS: FunFact[] = [
  {
    label: 'Tournament',
    text: '2nd UzChess Cup Masters, Tashkent — a 10-player round robin in June 2025. Praggnanandhaa WON the tournament outright; this is the game he lost.',
  },
  {
    label: 'Quote',
    text: 'Garry Kasparov tweeted about 23...Bc2!! after the game. Kasparov rarely tweets about individual chess moves.',
    minPly: 45,
  },
  {
    label: 'Engine',
    text: '15...Nxd5! is the engine\'s top choice. Both players were prepared for it; the question was who could navigate the resulting position better.',
    minPly: 29,
    maxPly: 50,
  },
  {
    label: 'Players',
    text: 'Praggnanandhaa was world #5 at the start of the event (FIDE 2767). Rapport (2714) is known for creative, attacking chess — this game is signature Rapport.',
  },
  {
    label: 'Sämisch',
    text: 'The Sämisch Variation (5.f3) is named after Friedrich Sämisch, who pioneered the f3 + e4 setup against the King\'s Indian in the 1920s.',
    maxPly: 20,
  },
  {
    label: 'Pragg\'s regret',
    text: 'Praggnanandhaa later said he had intended 23.Nd4 (consolidate the structure) and only switched to 23.Bc4 at the board. He has called it his biggest practical regret of the tournament.',
    minPly: 40,
    maxPly: 60,
  },
];

// ─── Branches: the "what if" interludes ────────────────────────
// Three branches anchor the most-asked questions about this game:
//   1. The "standard" KID Sämisch setup Rapport REJECTED (8...c5).
//   2. The alternate recapture 16.Nxd5 (instead of 16.exd5).
//   3. Pragg's intended 23.Nd4 instead of 23.Bc4? — the move he regretted.
//
// Branch moves are short (2-4 plies); the educational point is in the
// narration cue, not in deep speculative analysis. The closing
// narration in each branch delivers the engine-style verdict.

const PRAGG_RAPPORT_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'pragg_rapport_classical_c5',
    afterPly: 14, // after 7...Nbd7, before 8.Qd2
    fromPly: 14,
    branchMoves: ['Qd2', 'c5', 'd5', 'a6'],
    title: 'What if Black had played the "classical" 8...c5 instead of 8...b5?',
    narrationCue:
      'Show what the standard KID Sämisch setup looks like — Black plays for ...c5 to challenge White\'s center in front of the king. Solid, well-known, and what most grandmasters would play. Then explain why Rapport CHOSE the sharper ...b5 line instead — the queenside file-opening is what beats opposite-side castling. The closing verdict should compare the two approaches: ...c5 is "+0.0 equal, slow positional middlegame"; ...b5 is "objectively also equal but with the chance to fight for game-deciding initiative against a committed White king."',
    branchMoveDelayMs: 1800,
    returnToPly: 14,
  },
  {
    id: 'pragg_rapport_alternate_recapture',
    afterPly: 30, // after 15...Nxd5, before 16.exd5
    fromPly: 30,
    branchMoves: ['Nxd5', 'Bxc3', 'bxc3', 'b3'],
    title: 'What if White had recaptured with 16.Nxd5 instead?',
    narrationCue:
      'Show the alternative recapture: 16.Nxd5 keeps the knight on a strong central square but allows ...Bxc3 hitting the queen and forcing bxc3. Now Black\'s ...b3 hammer cracks open the queenside immediately and the White king has no shelter. Explain why Praggnanandhaa preferred 16.exd5 — the pawn recapture keeps the c-file half-closed and tries to consolidate. The closing verdict: 16.Nxd5 is objectively also fine for White but practically harder because every Black move becomes a forcing move.',
    branchMoveDelayMs: 1800,
    returnToPly: 30,
  },
  {
    id: 'pragg_rapport_intended_nd4',
    afterPly: 44, // after 22...Ra5, before 23.Bc4
    fromPly: 44,
    branchMoves: ['Nd4', 'Rxc1+', 'Rxc1', 'Bxd4'],
    title: 'What if Praggnanandhaa had played his intended 23.Nd4?',
    narrationCue:
      'Show the move Praggnanandhaa himself said he intended: 23.Nd4, centralizing the knight and trying to consolidate. Black\'s natural response is ...Rxc1+ removing the back-rank defender, and after Rxc1 ...Bxd4 Black still has the bishop pair, but White\'s structure holds together. Explain that this is the position Praggnanandhaa was AIMING for — the engine reads it as still uncomfortable for White but defensible. The closing verdict: 23.Nd4 was the practical choice; 23.Bc4? walked into the ...Bc2 refutation that the engine sees but a human at the board does not.',
    branchMoveDelayMs: 1800,
    returnToPly: 44,
  },
];

// ─── Whiteboard scenes ─────────────────────────────────────────

const PRAGG_RAPPORT_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 12, // after the opening setup
    heading: 'The Sämisch Idea',
    narrationCue:
      'Pause to set the stage: what the Sämisch Variation is, why White plays it, and the commitment it makes to opposite-side castling.',
    durationMs: 13000,
    bullets: [
      'Sämisch = 5.f3 supporting a huge e4 + d4 + c4 + f3 center.',
      'White intends Nge2 + Be3 + Qd2 + O-O-O + h4/h5 pawn storm.',
      'This is the most COMMITTAL anti-KID line — once White castles long, the plan is fixed.',
      'Black must counter-attack on the queenside FAST or be overwhelmed on the kingside.',
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 21, // after 11.d5 — the center is fully locked
    heading: 'Center Locked — Now the Pawns Race',
    narrationCue:
      'Pause to show the locked center. When the center is fully closed and the kings are on opposite wings, the game becomes a foot race: whose pawns can open the enemy king\'s shelter first wins.',
    durationMs: 12000,
    whitePawns: ['a2', 'b2', 'c4', 'd5', 'e4', 'f3', 'g2', 'h4'],
    blackPawns: ['a6', 'b5', 'd6', 'e5', 'f7', 'g6', 'h5'],
    caption: 'd4-d5 locks the center. With kings castled opposite, pawn storms decide the game.',
  },
  {
    kind: 'arrow_diagram',
    ply: 30, // after 15...Nxd5
    heading: 'The Three Things Black Buys',
    narrationCue:
      'Pause to outline what Black gets for the sacrificed knight: bishop pair, open files, and time. Each one is a structural advantage that compounds over the next ten moves.',
    durationMs: 13000,
    pieces: [],
    arrows: [
      { from: 'c8', to: 'f5', label: 'Light-squared bishop is the attacker' },
      { from: 'a8', to: 'a4', label: 'a-file rook lift coming' },
      { from: 'd8', to: 'd7', label: 'queen vacates back rank for rooks' },
    ],
    caption: 'Three structural gains: the bishop pair, two open files, and the time to use them.',
  },
  {
    kind: 'move_tree',
    ply: 45, // before 23...Bc2
    heading: 'Where Does the Bishop Go?',
    narrationCue:
      'Pause to ask the question on Praggnanandhaa\'s mind: from f5, where does Black\'s bishop go? Most candidates retreat to d1 or e4. The winning move heads to a4.',
    durationMs: 14000,
    root: 'Black\'s light-squared bishop on f5 has three candidate routes:',
    branches: [
      { label: 'Obvious: ...Bd1 to win the exchange', moves: ['Bd1', 'Rxd1', 'Rxc4'] },
      { label: 'Forcing: ...Be4 attacking the queen', moves: ['Be4', 'fxe4', 'Rxc4'] },
      { label: 'Winning: ...Bc2 heading for a4', moves: ['Bc2', 'Rd2', 'Ba4'] },
    ],
  },
  {
    kind: 'bullets',
    ply: 74, // at the end
    heading: 'The Three Sacrifices',
    narrationCue:
      'Pause to recap the lesson: Rapport sacrificed three times in one game, each time buying something concrete.',
    durationMs: 14000,
    bullets: [
      'Move 8: ...b5 — a PAWN for open files.',
      'Move 15: ...Nxd5 — a KNIGHT for the bishop pair, open lines, and time.',
      'Move 27: ...Rxc4 — an EXCHANGE for the bishop pair surviving and the b-pawn to march.',
      'Three sacrifices, zero recovered material, total domination. That\'s how you play with initiative.',
    ],
  },
];

export const PRAGG_RAPPORT_UZCHESS_2025_EPISODE: Episode = {
  id: 'pragg_rapport_uzchess_2025',
  track: 'historical',
  title: 'Rapport\'s Brilliancy vs Praggnanandhaa — UzChess Cup 2025 Round 6',
  summary:
    "Richard Rapport sacrifices a pawn, a knight, and an exchange against the world's #5 — and Praggnanandhaa cannot find a defense. The Sämisch ...Nxd5! and the immortal 23...Bc2!! that Garry Kasparov tweeted about. AI commentary by GPT 5.5.",
  source: 'public_domain',
  pgn: PRAGG_RAPPORT_UZCHESS_2025_PGN,
  commentator: PRAGG_RAPPORT_UZCHESS_2025_COMMENTATOR,
  historicalContext: PRAGG_RAPPORT_UZCHESS_2025_HISTORICAL_CONTEXT,
  chapters: PRAGG_RAPPORT_CHAPTERS,
  keyIdeas: PRAGG_RAPPORT_KEY_IDEAS,
  whatToWatch: PRAGG_RAPPORT_WHAT_TO_WATCH,
  funFacts: PRAGG_RAPPORT_FUN_FACTS,
  boardBranches: PRAGG_RAPPORT_BOARD_BRANCHES,
  whiteboardScenes: PRAGG_RAPPORT_WHITEBOARD,
  exports: PRAGG_RAPPORT_UZCHESS_2025_EXPORT,
};

export {
  PRAGG_RAPPORT_UZCHESS_2025_PGN,
  PRAGG_RAPPORT_UZCHESS_2025_COMMENTATOR,
  PRAGG_RAPPORT_UZCHESS_2025_HISTORICAL_CONTEXT,
  PRAGG_RAPPORT_UZCHESS_2025_EXPORT,
};
