import type {
  Episode,
  EpisodeChapter,
  KeyIdeasBlock,
  WhatToWatchBlock,
  FunFact,
  MoveTangent,
  BoardBranch,
  WhiteboardScene,
} from '../types';
import { COLLE_SYSTEM_LESSON_PGN } from './pgn';
import { COLLE_SYSTEM_LESSON_COMMENTATOR } from './commentator';
import { COLLE_VARIATIONS } from './variations';
import { COLLE_SYSTEM_LESSON_EXPORT } from './exports';

const COLLE_BOOK_STANDARD = [
  'Colle System book standard.',
  "White's goal: play a SAME-setup system (d4/Nf3/e3/Bd3/c3/Nbd2/O-O), wait for Black to commit, then unleash the e3-e4 central break — opening lines for the bishop on d3 to attack h7.",
  "Black's goal: develop solidly (mirror with ...d5/...Nf6/...e6/...Bd6/...O-O), respect the Bxh7+ sacrifice, time ...c5 break to challenge White's center.",
  'Holding lines: White must NEVER overcommit before e4 — the bishop on d3 needs the f-file diagonal cleared; Black must avoid letting the white knight reach e5 with full support.',
  "The c1 bishop is the Colle's chronic problem — it can only develop via Bd2 after the Nbd2 knight moves; many White players ignore it and live with the cramp.",
  'Common pitfalls: White plays e4 too early (loses the d-pawn); Black plays ...c5 too late (lets White entrench); either side mistakes the Colle for the QGD and walks into c4 transpositions.',
].join(' ');

const COLLE_CHAPTERS: EpisodeChapter[] = [
  { ply: 0, title: 'The Colle Skeleton', subtitle: 'd4 + Nf3 + e3 — a system, not a memorized line' },
  { ply: 7, title: 'Building the Pyramid', subtitle: 'Bd3 + c3 + Nbd2 — slow, principled development' },
  { ply: 13, title: 'Both Sides Castle', subtitle: 'The dance before the central break' },
  { ply: 17, title: 'The e4 Break', subtitle: "Colle's signature move — the whole setup builds to this" },
  { ply: 21, title: 'Open Position, Find the Plan', subtitle: 'After the break — how the rest unfolds' },
];

const COLLE_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      'd4 + Nf3 + e3 = the Colle skeleton. Three moves White plays REGARDLESS of Black\'s setup.',
      'Edgar Colle (Belgian master, 1920s) popularized this — older than the London by 40 years.',
      "Goal: small but enduring positional edge with simple development.",
      "Modern usage: club players who want the London's safety with a stronger central break.",
    ],
  },
  {
    chapterPly: 7,
    ideas: [
      'Bd3 + c3 + Nbd2 = the supporting trio behind the e3-e4 push.',
      "The c1 dark-squared bishop stays trapped — that's the Colle's known weakness.",
      "Black mirrors with ...d5 + ...Nf6 + ...e6 + ...Bd6 + ...O-O.",
      "Both sides develop carefully — no early central commitments.",
    ],
  },
  {
    chapterPly: 13,
    ideas: [
      "Both kings safe on the kingside, both sides developed.",
      'White waits for Black to commit before unleashing e4.',
      'Black\'s typical commit: ...c5 forces White to choose dxc5 (open lines) or hold the center.',
      "The dxc5 trade gives White the e4 break with tempo — that's the Colle plan firing.",
    ],
  },
  {
    chapterPly: 17,
    ideas: [
      "The e3-e4 push is the Colle's whole strategic point.",
      "After e4, Black's d5 is attacked, the bishop on d3 has its diagonal cleared.",
      "If Black plays ...e5 in response, the position locks into a slow positional game.",
      "If Black plays ...dxe4, White recaptures and the bishop on d3 dominates h2-b8 diagonal.",
    ],
  },
  {
    chapterPly: 21,
    ideas: [
      'h3 prevents ...Bg4 pins — small prophylactic move before the middlegame.',
      "Plans diverge here: kingside attack (Nh4/Nf5), central pressure (Re1/Bg5), or queenside (Nb3).",
      'The Colle is one of the few openings where the OPENING ends cleanly and the middlegame begins fresh.',
      "Black plays ...Bd7 anticipating ...Bc6 with pressure on the long diagonal.",
    ],
  },
];

const COLLE_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  {
    chapterPly: 0,
    text: "Watch the Colle skeleton emerge — d4 + Nf3 + e3 — three moves White plays against ANY Black setup. The whole point is that you don't need theory; the system handles the position.",
  },
  {
    chapterPly: 7,
    text: "Watch how White develops EVERY piece before considering the e3-e4 push. The Colle is a patient opening — break too early and the d-pawn falls.",
  },
  {
    chapterPly: 13,
    text: "Watch the timing of dxc5. White trades the d-pawn for Black's c-pawn to clear the e-file for the upcoming e4 push. Without this trade, e4 hangs the d-pawn.",
  },
  {
    chapterPly: 17,
    text: "Watch the moment e4 is played. This is the Colle paying off — White has been building toward this break for 8 moves. The bishop on d3 finally has its diagonal cleared.",
  },
  {
    chapterPly: 21,
    text: "Watch how the position OPENS after the central trades. Pieces find their squares, both sides plan the middlegame, the opening phase is genuinely over.",
  },
];

const COLLE_FUN_FACTS: FunFact[] = [
  { label: 'History', text: "Edgar Colle (Belgian master, 1897-1932) used this system to win at Carlsbad 1929 — a tournament that established the Colle in tournament theory." },
  { label: 'Modern usage', text: "Akiba Rubinstein's classic 1907 wins with similar setups are sometimes called Colle games (anachronism — predates Colle by 15 years)." },
  { label: 'Theory', text: "The Colle is one of three 'system openings' that minimize theory: London, Colle, Stonewall. All use d4 + Nf3 + e3 backbones." },
  { label: 'Pattern', text: "The Bxh7+ sacrifice is the Colle's signature tactic — when Black castles early without ...h6, White can sacrifice the bishop for a kingside attack." },
  { label: 'Quote', text: "Aron Nimzowitsch on the Colle: 'A respectable opening for a player who wants positional chess without having to memorize main lines.'" },
];

const COLLE_TANGENTS: MoveTangent[] = [
  { ply: 5, san: 'Bg5', category: 'move_order_trap', note: "Bg5 here transposes into the Torre Attack — solves the bad-bishop problem but loses the Colle's e4 break flexibility. A judgment call, not a mistake." },
  { ply: 9, san: 'b3', category: 'engine_refutation', note: "b3 instead of c3 transposes into the Zukertort System — fianchetto the bishop on b2 for sharper play. Strong alternative; defeats the system-opening philosophy a bit." },
  { ply: 15, san: 'e4', category: 'student_mistake', note: "e4 BEFORE dxc5 hangs the d-pawn — Black plays ...cxd4 cxd4 dxe4 and White is just down a pawn. Always trade in the center first." },
  { ply: 17, san: 'Qb3', category: 'engine_refutation', note: "Qb3 pressures b7 + d5 — strong alternative to the immediate e4 push. The queen lift to b3 is a classic Colle motif." },
];

const COLLE_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'colle_bf5_anti_colle',
    afterPly: 5,
    fromPly: 5,
    title: 'What if Black plays ...Bf5 (the Capablanca anti-Colle)?',
    branchMoves: ['Bf5', 'Bd3', 'Bxd3', 'Qxd3', 'e6', 'O-O'],
    narrationCue:
      "Show the Capablanca-style anti-Colle: Black develops the light-squared bishop OUTSIDE the pawn chain to ...Bf5 BEFORE locking it in with ...e6. White trades on d3 (since blocking the bishop with anything else loses tempo). The resulting position is nearly equal — Black has solved their bad-bishop problem at the cost of a slight space disadvantage. This is the most respected anti-Colle at the top level.",
    returnToPly: 5,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'colle_immediate_e4',
    afterPly: 14,
    fromPly: 14,
    title: 'What if White plays e4 immediately, without dxc5?',
    branchMoves: ['e4', 'cxd4', 'cxd4', 'dxe4', 'Nxe4', 'Nxe4'],
    narrationCue:
      "Show what happens if White plays e4 too early. Black hits the center with ...cxd4 cxd4, and now after ...dxe4 White recovers the pawn but has SIMPLIFIED to an equal endgame-bound position. The lesson: dxc5 FIRST, e4 AFTER. The Colle's break only works when the c-pawn has been removed.",
    returnToPly: 14,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'colle_central_pressure_continuation',
    afterPly: 22,
    fromPly: 22,
    title: "What's the next phase? Central pressure with Re1 + Bd2",
    branchMoves: ['Re1', 'Rfe8', 'Nf1', 'b6', 'Bd2', 'Rad8'],
    narrationCue:
      "Show the natural continuation: White centralizes the rooks with Re1 + Rad1 ideas, redeploys the d-knight via Nf1 to free Nd2-bishop, finally develops the dark-squared bishop with Bd2. Black mirrors with ...Rfe8 + ...b6 + ...Rad8 — both sides finish their development before the real middlegame begins.",
    returnToPly: 22,
    branchMoveDelayMs: 1800,
  },
];

const COLLE_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 5,
    heading: 'What is the Colle System?',
    narrationCue: 'Pause to introduce the Colle: who plays it, why, what makes it different from the London.',
    durationMs: 13000,
    bullets: [
      'A system opening for WHITE — d4 + Nf3 + e3 every time.',
      "Older than the London (1920s vs 2020s) — Belgian master Edgar Colle.",
      'Goal: same simple development, but with a STRONGER central break (e3-e4) than the London.',
      'Tradeoff: the c1 dark-squared bishop stays locked in — that\'s the Colle\'s chronic weakness.',
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 17,
    heading: 'The Moment of Truth: e3-e4',
    narrationCue: 'Pause to show the central pawn structure as e3 becomes e4 — the Colle paying off.',
    durationMs: 12000,
    whitePawns: ['a2', 'b2', 'c3', 'd4', 'e4', 'f2', 'g2', 'h2'],
    blackPawns: ['a7', 'b7', 'd5', 'e5', 'f7', 'g7', 'h7'],
    caption:
      'After e4, both sides have a "big center". Black\'s d5/e5 vs White\'s d4/e4. Whoever wins the central pawn fight wins the game.',
  },
  {
    kind: 'move_tree',
    ply: 22,
    heading: 'Three Plans After the Opening',
    narrationCue: 'Pause to outline what comes next: the Colle just finished, the middlegame begins.',
    durationMs: 14000,
    root: 'After 11...Bd7, White picks one of three plans:',
    branches: [
      { label: 'Kingside attack — Nh4 + Nf5 + Qh5', moves: ['Nh4', 'Rfe8', 'Nf5', 'Bf8', 'Qg4'] },
      { label: 'Central pressure — Re1 + Bd2 + Rad1', moves: ['Re1', 'Rfe8', 'Nf1', 'b6', 'Bd2'] },
      { label: 'Queenside grind — b4 + Bb2 + Rb1', moves: ['b4', 'Bd6', 'Bb2', 'Rad8', 'Rab1'] },
    ],
  },
];

export const COLLE_SYSTEM_LESSON_EPISODE: Episode = {
  id: 'colle_system_lesson',
  track: 'lesson',
  title: 'Colle System Explained by an AI (Colle-Koltanowski, Move by Move)',
  summary:
    "An AI walks through the Colle System (Colle-Koltanowski main line), playing both sides through the e3-e4 break that defines this classic positional system. Same system-opening philosophy as the London, but with a stronger central break on offer.",
  source: 'agent_generated',
  pgn: COLLE_SYSTEM_LESSON_PGN,
  commentator: COLLE_SYSTEM_LESSON_COMMENTATOR,
  bookStandard: COLLE_BOOK_STANDARD,
  chapters: COLLE_CHAPTERS,
  keyIdeas: COLLE_KEY_IDEAS,
  whatToWatch: COLLE_WHAT_TO_WATCH,
  funFacts: COLLE_FUN_FACTS,
  moveTangents: COLLE_TANGENTS,
  boardBranches: COLLE_BOARD_BRANCHES,
  whiteboardScenes: COLLE_WHITEBOARD,
  exports: COLLE_SYSTEM_LESSON_EXPORT,
};

export {
  COLLE_SYSTEM_LESSON_PGN,
  COLLE_SYSTEM_LESSON_COMMENTATOR,
  COLLE_VARIATIONS,
  COLLE_SYSTEM_LESSON_EXPORT,
};
