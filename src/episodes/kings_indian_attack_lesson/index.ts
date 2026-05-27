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
import { KIA_LESSON_PGN } from './pgn';
import { KIA_LESSON_COMMENTATOR } from './commentator';
import { KIA_VARIATIONS } from './variations';
import { KIA_LESSON_EXPORT } from './exports';

const KIA_BOOK_STANDARD = [
  "King's Indian Attack book standard.",
  "White's goal: play the KID setup with a free tempo (Nf3 + g3 + Bg2 + d3 + Nbd2 + e4 + e5). The hypermodern philosophy: let Black build the center, then attack it from the flanks. Universal — same setup against any 1...d5/...c5/...e6.",
  "Black's goal: equalize via classical development (...Nf6/...e6/...Be7/...O-O), break in the center with ...d4 or ...exf3, and counterattack on the queenside.",
  "Holding lines: White MUST get the e5 push in (otherwise no attack); Black MUST keep the center fluid (...d4 closing helps Black; ...d5 fluid helps White attack faster).",
  'Common pitfalls: White pushes d4 instead of d3 (becomes Catalan/QGD); Black ignores the kingside (gets steamrolled by h4-h5 attack); either side commits too many pieces to one wing.',
].join(' ');

const KIA_CHAPTERS: EpisodeChapter[] = [
  { ply: 0, title: 'The Fianchetto Start', subtitle: 'Nf3 + g3 + Bg2 — KID setup with colors reversed' },
  { ply: 6, title: 'Hypermodern Restraint', subtitle: 'd3 (not d4!) — let Black build, then attack' },
  { ply: 13, title: 'The e4-e5 Lever', subtitle: "White's signature push closes the center" },
  { ply: 19, title: 'The Slow Kingside Attack', subtitle: 'Nf1 + Ng3 + h4 — the long route to the king' },
];

const KIA_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      "The KIA is the King's Indian Defense — played by WHITE with a free tempo.",
      'Bobby Fischer used this against world champion Petrosian in 1971 — and won the match.',
      "Same setup against any Black move order: Nf3 + g3 + Bg2 + O-O + d3.",
      "Hypermodern strategy: let Black claim the center, then attack from the flanks.",
    ],
  },
  {
    chapterPly: 6,
    ideas: [
      'd3 (NOT d4) is the KIA defining move — preserves flexibility, no central commitment.',
      "Black plays the classical center: ...d5 + ...e6 + ...Be7 + ...O-O.",
      'White waits — the next moves (Nbd2 + Re1 + e4) all support the e5 push.',
      "The Bg2 bishop is the KIA's most important piece — diagonal pressure all game.",
    ],
  },
  {
    chapterPly: 13,
    ideas: [
      "e4 is White's signal: the center is about to lock.",
      'The e5 push (often after Black plays ...Nc6 or ...b5) wins kingside space + attacks the f6 knight.',
      "Black responds ...Nd7 retreating; the knight will reroute via ...Nb6 or ...Nf8.",
      "Now the KIA attack is set up: White's kingside vs Black's queenside.",
    ],
  },
  {
    chapterPly: 19,
    ideas: [
      'Nf1 starts the knight tour: d2 → f1 → g3 → f5/h5 — typical KIA pattern.',
      "h4 begins the kingside pawnstorm. h4-h5 cracks open Black's castled king.",
      "Black responds with ...a5/...b4 — queenside pawnstorm racing White's kingside.",
      "Like the KID Mar del Plata, this is an OPPOSITE-WING RACE. First mating attack wins.",
    ],
  },
];

const KIA_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  { chapterPly: 0, text: "Watch how White's first three moves (Nf3 + g3 + Bg2) define a SHAPE, not specific moves. The KIA is a system — same start against any Black response." },
  { chapterPly: 6, text: "Watch the restraint of d3 (not d4!). This is the hypermodern key — White REFUSES to commit a central pawn early." },
  { chapterPly: 13, text: "Watch the e4-e5 sequence fire. Two pawn moves, and White's whole position transforms — kingside attack ready, center locked." },
  { chapterPly: 19, text: "Watch the knight tour begin: d2 → f1 → g3. The knight takes a long way to f5/h5 — but it gets there." },
];

const KIA_FUN_FACTS: FunFact[] = [
  { label: 'History', text: 'Bobby Fischer played the KIA against Petrosian in their 1971 Candidates Match, winning 5-1. The KIA became "Fischer\'s favorite weapon against 1...e6".' },
  { label: 'Modern usage', text: 'GM Lev Psakhis played the KIA exclusively for 10 years — one of the most pure system-opening careers in chess history.' },
  { label: 'Pattern', text: 'The Nbd2-f1-g3 knight tour is called the "Petrosian Maneuver" — same idea as the closed-side KID Mar del Plata.' },
  { label: 'Quote', text: '"The KIA is the opening for chess players who want to play 50 moves of preparation and then 30 moves of pure intuition." — anonymous IM.' },
];

const KIA_TANGENTS: MoveTangent[] = [
  { ply: 3, san: 'd3', category: 'move_order_trap', note: "Playing d3 BEFORE g3 + Bg2 is the 'King's Indian Reversed' move order — equivalent but loses some flexibility. Fianchetto first." },
  { ply: 9, san: 'e4', category: 'engine_refutation', note: 'e4 BEFORE d3 commits the center too early — Black plays ...dxe4 and White recaptures into a Pirc-like structure with the bishop misplaced.' },
  { ply: 13, san: 'c4', category: 'engine_refutation', note: "c4 here transposes to a Catalan — the KIA's worst transposition because Black gets free play on the c-file. Stay flexible with d3 + e4." },
  { ply: 19, san: 'c4', category: 'student_mistake', note: 'c4 in the middlegame attacks d5 but leaves the d-pawn weak. The KIA attack is on the KINGSIDE — central breaks help Black.' },
];

const KIA_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'kia_vs_kid_anti_setup',
    afterPly: 4,
    fromPly: 4,
    title: "What if Black plays KID-style with ...g6?",
    branchMoves: ['Bg2', 'g6', 'O-O', 'Bg7', 'd3', 'O-O'],
    narrationCue:
      "Show what happens if Black mirrors the KIA with a KID setup. The position becomes nearly symmetric — both sides fianchettoed, both castled, both playing for slow positional pressure. Teaching point: the KIA is harder to play against a mirror fianchetto than against the classical Black setup — there's nothing to attack on the kingside when Black's bishop on g7 is there.",
    returnToPly: 4,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'kia_immediate_central_trade',
    afterPly: 12,
    fromPly: 12,
    title: 'What if White pushes e4 immediately instead of patient development?',
    branchMoves: ['e4', 'dxe4', 'dxe4', 'e5', 'h3', 'Nbd7'],
    narrationCue:
      "Show what happens if White pushes e4 too early. Black trades pawns in the center, and after ...e5 the position locks up but White hasn't yet developed the c1 bishop or rook. White's attacking ideas are delayed — Black equalizes more easily. The KIA needs SLOW development before the e4-e5 sequence fires.",
    returnToPly: 12,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'kia_kingside_continuation',
    afterPly: 22,
    fromPly: 22,
    title: "What's the next phase? Kingside push with h5",
    branchMoves: ['h5', 'h6', 'Bf4', 'Bb7', 'Qd2', 'Re8'],
    narrationCue:
      "Show the natural continuation: White pushes h5 to fix Black's kingside, develops the dark-squared bishop to f4 (the typical KIA late development), and prepares Bh6 trades with Bf4-h6 or kingside pressure. Black mirrors with queenside development (...Bb7) and central piece play.",
    returnToPly: 22,
    branchMoveDelayMs: 1800,
  },
];

const KIA_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 5,
    heading: "What is the King's Indian Attack?",
    narrationCue: 'Pause to introduce the KIA: the KID with colors reversed, who plays it, why.',
    durationMs: 13000,
    bullets: [
      'A system opening for WHITE — same setup against ANY Black response.',
      "The KID structure (Nf3+g3+Bg2+d3+Nbd2+e4) but played by White with a free tempo.",
      "Made famous by Bobby Fischer — beat Petrosian 5-1 in their 1971 Candidates Match.",
      "Goal: slow kingside attack via Nf1+Ng3+h4-h5. Universal weapon vs 1.e4 setups.",
    ],
  },
  {
    kind: 'move_tree',
    ply: 22,
    heading: 'KIA Plans by Black Setup',
    narrationCue: 'Pause to outline how the KIA adjusts against each Black setup.',
    durationMs: 14000,
    root: 'After 11...b4, White picks one of three plans:',
    branches: [
      { label: 'Slow kingside push — h5 + Bf4 + Qd2', moves: ['h5', 'h6', 'Bf4', 'Bb7', 'Qd2', 'Re8'] },
      { label: 'Knight tour — Ng3 + Nh5 + Bg5', moves: ['Ng3', 'Bb7', 'Nh5', 'Re8', 'Bg5', 'Bf8'] },
      { label: 'Central counter — Nxe5 + Nxc6', moves: ['Bf4', 'Bb7', 'a3', 'bxa3', 'Rxa3', 'Bxe5'] },
    ],
  },
];

export const KIA_LESSON_EPISODE: Episode = {
  id: 'kings_indian_attack_lesson',
  track: 'lesson',
  title: "King's Indian Attack Explained by an AI (Classical Main Line, Move by Move)",
  summary:
    "An AI walks through the King's Indian Attack — the KID with colors reversed. Bobby Fischer's signature anti-French weapon, played as a SYSTEM against any Black response.",
  source: 'agent_generated',
  pgn: KIA_LESSON_PGN,
  commentator: KIA_LESSON_COMMENTATOR,
  bookStandard: KIA_BOOK_STANDARD,
  chapters: KIA_CHAPTERS,
  keyIdeas: KIA_KEY_IDEAS,
  whatToWatch: KIA_WHAT_TO_WATCH,
  funFacts: KIA_FUN_FACTS,
  moveTangents: KIA_TANGENTS,
  boardBranches: KIA_BOARD_BRANCHES,
  whiteboardScenes: KIA_WHITEBOARD,
  exports: KIA_LESSON_EXPORT,
};

export {
  KIA_LESSON_PGN,
  KIA_LESSON_COMMENTATOR,
  KIA_VARIATIONS,
  KIA_LESSON_EXPORT,
};
