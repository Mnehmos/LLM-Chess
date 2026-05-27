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
import { STONEWALL_ATTACK_LESSON_PGN } from './pgn';
import { STONEWALL_ATTACK_LESSON_COMMENTATOR } from './commentator';
import { STONEWALL_VARIATIONS } from './variations';
import { STONEWALL_ATTACK_LESSON_EXPORT } from './exports';

const STONEWALL_BOOK_STANDARD = [
  'Stonewall Attack book standard.',
  "White's goal: build the Stonewall pawn formation (d4 + e3 + f4) on dark squares, plant a knight on e5 with full support, then launch a kingside attack with Bd3 + Qh4 + maybe g4-h4 pawnstorm.",
  "Black's goal: trade the light-squared bishops (...Bf5/...Bxd3) to defuse the kingside attack, then exploit White's bad dark-squared bishop on c1 in the endgame.",
  "Holding lines: White MUST keep the Ne5 outpost protected (Nd2 supports it, fxe5 locks it in); Black MUST trade light bishops or accept a mating attack.",
  "Common pitfalls: White plays the attack too early (loses tempo, Black consolidates); Black ignores the kingside (gets mated by the classic Bxh7+ pattern); either side ignores the f-file (the half-open f-file after fxe5 is White's main attacking lever).",
].join(' ');

const STONEWALL_CHAPTERS: EpisodeChapter[] = [
  { ply: 0, title: 'The Stonewall Skeleton', subtitle: 'Three pawns on dark squares: d4 + e3 + f4' },
  { ply: 8, title: "Both Sides Develop", subtitle: 'Black mirrors the Italian-style setup' },
  { ply: 15, title: 'The Key Trade on e5', subtitle: 'Ne5 + Bxe5 + fxe5 — the f-file opens' },
  { ply: 19, title: 'The Attack Begins', subtitle: 'Light-squared bishop + queen lift = mating threats' },
];

const STONEWALL_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      'd4 + e3 + f4 = the Stonewall pawn skeleton. Three pawns locked on DARK squares.',
      'The c1 bishop is permanently locked — White gives it up for the attack.',
      'Made famous by Harry Nelson Pillsbury (American champion, 1890s).',
      "Goal: get the king attack of your life. Trade everything else for the mating threats.",
    ],
  },
  {
    chapterPly: 8,
    ideas: [
      "White's Nf3 + Nbd2 supports the Ne5 outpost coming next.",
      "Black plays ...Bd6 mirroring — the symmetric setup.",
      "Both kings castle kingside (Black at risk, White safe behind f4-e3-d4).",
      "The position is BALANCED — but White has all the attacking pieces aimed at h7.",
    ],
  },
  {
    chapterPly: 15,
    ideas: [
      "Ne5 puts the knight on the outpost — supported by f4 + d4 pawns.",
      'Black\'s ...Bxe5 trade is FORCED (otherwise Nxc6 + Nxf7 ideas).',
      'fxe5 recaptures with the f-pawn — the f-file OPENS for the rook.',
      "Now White has: half-open f-file + Bd3 aimed at h7 + queen can lift to h4. Attack ingredients ready.",
    ],
  },
  {
    chapterPly: 19,
    ideas: [
      'Nf3 returns the knight — preparing Qh5 or Ng5 attacks.',
      '...b6 develops the queenside bishop (the Bb7 defender for ...Nxe5 attacks).',
      "Now White's plan: Qe1 → Qh4 → Bxh7+ or Ng5 → mate.",
      "The classical Pillsbury sacrifice: Bxh7+ Kxh7 Ng5+ Kg8 Qh5 → unstoppable mate ideas.",
    ],
  },
];

const STONEWALL_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  { chapterPly: 0, text: 'Watch how f4 + e3 + d4 lock on DARK squares — the c1 bishop has nowhere to go. White accepts this permanently.' },
  { chapterPly: 8, text: 'Watch the symmetric development. Both sides look identical, but White has aimed pieces at the kingside while Black is just developing.' },
  { chapterPly: 15, text: 'Watch the e5 trade fire. The Ne5 + fxe5 sequence is the Stonewall paying off — locked center + half-open f-file.' },
  { chapterPly: 19, text: "Watch White's pieces converge: Nf3 + Bd3 + queen on e1 ready for Qh4. Every piece pointed at the Black king." },
];

const STONEWALL_FUN_FACTS: FunFact[] = [
  { label: 'History', text: 'Harry Nelson Pillsbury used the Stonewall to win Hastings 1895 — one of the most dominant tournament performances of the 19th century.' },
  { label: 'Pattern', text: 'The Bxh7+ Kxh7 Ng5+ Kg8 Qh5 sacrifice is called the "Pillsbury Mate" — taught to every chess student in their first year.' },
  { label: 'Modern usage', text: "The Stonewall is rare at top level today (engines find Black's ...Bf5 trade easily) but still scores ~55% for White at club level." },
  { label: 'Quote', text: '"The Stonewall is the opening for chess players who hate chess." — anonymous (referring to the locked structure).' },
];

const STONEWALL_TANGENTS: MoveTangent[] = [
  { ply: 3, san: 'Nf3', category: 'move_order_trap', note: "Playing Nf3 BEFORE e3 + f4 locks the f-pawn behind the knight — White can never reach f4. Stonewall move order matters: e3 first, knight LATER." },
  { ply: 7, san: 'g3', category: 'engine_refutation', note: 'g3 + Bg2 transposes to the Modern Stonewall — same attacking ideas with the bishop fianchettoed. Strong alternative; sacrifices the Bd3 attack for the long diagonal.' },
  { ply: 9, san: 'Nh3', category: 'engine_refutation', note: 'Nh3 instead of Nf3 — the "Bird-style" Stonewall. Knight goes to f4 via h3 + Nf4. Sharper but commits the knight to the rim early.' },
];

// One board branch — the iconic Pillsbury sacrifice, validated legal
// against the final position of the main lesson.
const STONEWALL_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'stonewall_pillsbury_sacrifice',
    afterPly: 22,
    fromPly: 22,
    title: 'The Pillsbury Sacrifice — Bxh7+!?',
    branchMoves: ['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5', 'f5'],
    narrationCue:
      "Show the iconic Pillsbury mating attack — the entire reason the Stonewall exists. After Bxh7+ Kxh7 (forced), Ng5+ Kg8 (king must hide), Qh5 threatens unstoppable mate on h7. Black's only practical try is ...f5 to cut off the bishop on d3 (no longer relevant) and create luft. The attack doesn't always WIN here, but it demonstrates the Stonewall's whole strategic point: trade away material in exchange for a mating attack on the kingside.",
    returnToPly: 22,
    branchMoveDelayMs: 1800,
  },
];

const STONEWALL_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 7,
    heading: 'What is the Stonewall Attack?',
    narrationCue: 'Pause to introduce the Stonewall: what makes it different from the London/Colle, who plays it, what the win condition is.',
    durationMs: 13000,
    bullets: [
      "A 1.d4 system opening for WHITE with f4 baked in.",
      "Three pawns on DARK squares (d4/e3/f4) — locks the structure permanently.",
      "Goal: KING ATTACK, not positional grind. Bd3 + Qh4 + Ng5 = mating threats.",
      'Made famous by Harry Pillsbury, 1890s. Rare at top level but lethal at club level.',
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 19,
    heading: 'The Locked Stonewall',
    narrationCue: 'Pause to show the pawn structure after fxe5 — the locked dark-square chain that names the opening.',
    durationMs: 12000,
    whitePawns: ['a2', 'b2', 'c3', 'd4', 'e3', 'e5', 'g2', 'h2'],
    blackPawns: ['a7', 'c5', 'd5', 'e6', 'f7', 'g7', 'h7'],
    caption:
      "Locked dark squares (d4/e3/e5 + Black's d5/c5/e6). White attacks the kingside; Black tries to break with ...f6 or ...c4.",
  },
];

export const STONEWALL_ATTACK_LESSON_EPISODE: Episode = {
  id: 'stonewall_attack_lesson',
  track: 'lesson',
  title: 'Stonewall Attack Explained by an AI (Classical Main Line, Move by Move)',
  summary:
    "An AI walks through the Stonewall Attack — White's most committed kingside-attack system. The f4 + e3 + d4 pawn formation builds toward the iconic Pillsbury sacrifice on h7.",
  source: 'agent_generated',
  pgn: STONEWALL_ATTACK_LESSON_PGN,
  commentator: STONEWALL_ATTACK_LESSON_COMMENTATOR,
  bookStandard: STONEWALL_BOOK_STANDARD,
  chapters: STONEWALL_CHAPTERS,
  keyIdeas: STONEWALL_KEY_IDEAS,
  whatToWatch: STONEWALL_WHAT_TO_WATCH,
  funFacts: STONEWALL_FUN_FACTS,
  moveTangents: STONEWALL_TANGENTS,
  boardBranches: STONEWALL_BOARD_BRANCHES,
  whiteboardScenes: STONEWALL_WHITEBOARD,
  exports: STONEWALL_ATTACK_LESSON_EXPORT,
};

export {
  STONEWALL_ATTACK_LESSON_PGN,
  STONEWALL_ATTACK_LESSON_COMMENTATOR,
  STONEWALL_VARIATIONS,
  STONEWALL_ATTACK_LESSON_EXPORT,
};
