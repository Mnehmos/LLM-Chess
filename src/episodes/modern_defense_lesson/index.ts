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
import { MODERN_DEFENSE_LESSON_PGN } from './pgn';
import { MODERN_DEFENSE_LESSON_COMMENTATOR } from './commentator';
import { MODERN_DEFENSE_VARIATIONS } from './variations';
import { MODERN_DEFENSE_LESSON_EXPORT } from './exports';

const MODERN_BOOK_STANDARD = [
  'Modern Defense book standard.',
  "Black's goal: play a SETUP, not specific moves. Fianchetto with ...g6/...Bg7, develop slowly with ...d6 + ...a6 + ...b5 + ...Bb7, then strike on the queenside or with ...c5/...e5 break.",
  "White's goal: build the classical big center (e4 + d4 + Nc3 + Nf3), then choose between Austrian Attack (sharp f4), Classical (Be2/O-O), or Averbakh-style (c4 + Bg5) anti-Modern setups.",
  "Holding lines: Black must time the queenside expansion CORRECTLY — too early walks into Bxh7 / e5 ideas; too late lets White entrench. ...b5 should come after ...a6 sets it up.",
  "The Modern's 'hippopotamus' philosophy: don't make weaknesses, don't engage, wait for White to overextend.",
  'Common pitfalls: Black plays ...e5 too early without preparation (loses central pawn); White plays Austrian Attack without f4 + e5 (gives Black free development); either side commits pieces to the wrong wing.',
].join(' ');

const MODERN_CHAPTERS: EpisodeChapter[] = [
  { ply: 0, title: "Black's Fianchetto Start", subtitle: 'g6 + Bg7 + d6 — committing nothing in the center' },
  { ply: 8, title: 'The Tiger Setup', subtitle: '...a6 + ...b5 — queenside expansion' },
  { ply: 14, title: "White Develops Classically", subtitle: 'Re1 + Bf4 + h3 — standard piece deployment' },
  { ply: 19, title: 'The Central Trade Question', subtitle: '...c5 challenges d4 — what does White do?' },
];

const MODERN_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      'g6 first, NOT d6 — that\'s what makes this Modern, not Pirc.',
      "Black commits to a SETUP (g6/Bg7/d6) without committing specific responses.",
      "Hypermodern strategy: let White build the center, attack it from the flanks.",
      "Universal — same setup against any White move order (1.e4, 1.d4, 1.c4, 1.Nf3).",
    ],
  },
  {
    chapterPly: 8,
    ideas: [
      "...a6 + ...b5 = the Tiger Modern (Tiger Hillarp Persson's contribution).",
      "Queenside pawnstorm — gain space, prepare ...Bb7 fianchetto and ...c5 break.",
      "...Nd7 (not ...Nc6!) keeps the c-file open for the ...c5 break later.",
      "Slow, principled, no early tactical concessions.",
    ],
  },
  {
    chapterPly: 14,
    ideas: [
      "Re1 prepares e5 push; Bf4 develops the dark-squared bishop ACTIVELY (not via Bd2).",
      "h3 prevents ...Bg4 pins — small prophylactic move.",
      "White's setup is fully classical at this point — Black is the one being unusual.",
      "Both sides developed, both castled, both ready for the central commitment.",
    ],
  },
  {
    chapterPly: 19,
    ideas: [
      '...c5 finally challenges d4 — Black has been preparing this for 10 moves.',
      "White's three choices: d5 (close), dxc5 (open), or hold (slow).",
      "After d5, the position becomes a Benoni-like locked structure — slow positional game.",
      "Black's ...e5 mirror closes the center and prepares queenside expansion.",
    ],
  },
];

const MODERN_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  { chapterPly: 0, text: "Watch Black's first three moves: g6 + Bg7 + d6. Three moves played REGARDLESS of what White does — that's the system-opening philosophy applied to Black." },
  { chapterPly: 8, text: 'Watch the ...a6 + ...b5 sequence. Black gains queenside space without committing pieces — pure pawn play preparing the ...c5 break.' },
  { chapterPly: 14, text: "Watch White's piece deployment. Re1 + Bf4 + h3 — every piece on a natural square, no committal central push yet. The opening is BALANCED before the central trade." },
  { chapterPly: 19, text: 'Watch the d5 push fire. Now the center locks, and the middlegame becomes a slow positional battle — Black on the queenside, White on the kingside.' },
];

const MODERN_FUN_FACTS: FunFact[] = [
  { label: 'History', text: 'The Modern Defense was developed by Anatoly Karpov and others in the 1960s as an alternative to the King\'s Indian — same hypermodern philosophy, more flexibility.' },
  { label: 'Modern usage', text: 'Tiger Hillarp Persson (Swedish GM) literally wrote the book on the Modern Defense — his "Tiger\'s Modern" remains the canonical reference.' },
  { label: 'Pattern', text: 'The Modern transposes to the Pirc (1.e4 d6 2.d4 Nf6) when Black plays ...Nf6 before ...g6 — same opening, different move order.' },
  { label: 'Quote', text: '"The Modern is the opening for chess players who want to play 60 moves and outwork their opponent." — GM Nigel Davies.' },
];

const MODERN_TANGENTS: MoveTangent[] = [
  { ply: 3, san: 'c4', category: 'engine_refutation', note: "Pushing c4 transposes to a King's Indian-style position with extra central space. Strong alternative; loses some flexibility." },
  { ply: 7, san: 'f4', category: 'student_mistake', note: "f4 after Nf3 blocks the pawn — the Austrian Attack needs f4 BEFORE Nf3. Move order matters." },
  { ply: 9, san: 'Bf4', category: 'engine_refutation', note: "Bf4 develops the bishop ACTIVELY rather than the safe Be2. Stronger move at the cost of more concrete play." },
  { ply: 11, san: 'Bh6', category: 'student_mistake', note: 'Bh6 tries to trade off Black\'s fianchetto bishop — but after ...Bxh6 the dark-squared exchange happens and Black still has the better pawn structure.' },
  { ply: 13, san: 'd5', category: 'engine_refutation', note: "Pushing d5 here closes the center early — kills the Modern's queenside expansion plan. Strong, but loses the initiative." },
];

const MODERN_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'modern_pirc_transposition',
    afterPly: 6,
    fromPly: 6,
    title: 'What if Black plays Pirc move order (...Nf6 first)?',
    branchMoves: ['Nf3', 'Nf6', 'Be2', 'O-O', 'O-O', 'a6'],
    narrationCue:
      "Show the Pirc transposition: when Black plays ...Nf6 BEFORE the queenside expansion, the position becomes a classical Pirc. Same setup, more committal — Black has committed to ...Nf6 which means no flexibility on that piece's deployment. Teaching point: Modern Defense KEEPS the knight on g8 to keep options open; Pirc COMMITS it for faster development.",
    returnToPly: 6,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'modern_continuation',
    afterPly: 22,
    fromPly: 22,
    title: "What's the middlegame plan? Queenside expansion",
    branchMoves: ['Nd2', 'Nc6', 'Bg3', 'O-O', 'b4', 'cxb4'],
    narrationCue:
      "Show the natural continuation after d5 e5 locks the center. White redeploys the knight via Nd2 and pushes b4 to challenge ...c5. Black develops with ...Nc6 + ...O-O. The b4 break opens lines for White on the queenside, but Black gets active piece play in return. This is what the Modern was preparing for all along — slow positional middlegame after the center locks.",
    returnToPly: 22,
    branchMoveDelayMs: 1800,
  },
];

const MODERN_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 6,
    heading: 'What is the Modern Defense?',
    narrationCue: 'Pause to introduce the Modern: who plays it, why, what makes it different from the KID or Pirc.',
    durationMs: 13000,
    bullets: [
      "A SYSTEM defense for BLACK — g6 first, defer ...Nf6 and ...d6.",
      "Maximum FLEXIBILITY: same setup against 1.e4, 1.d4, 1.c4, 1.Nf3.",
      "Hypermodern strategy: let White build the center, attack from the flanks.",
      "Tiger Hillarp Persson's modern interpretation: queenside expansion with ...a6/...b5.",
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 22,
    heading: 'The Modern Pawn Skeleton',
    narrationCue: 'Pause to show the locked pawn structure after ...c5/d5/...e5 — the classic Modern middlegame setup.',
    durationMs: 12000,
    whitePawns: ['a3', 'b2', 'c2', 'd5', 'e4', 'f2', 'g2', 'h3'],
    blackPawns: ['a6', 'b5', 'c5', 'd6', 'e5', 'f7', 'g6', 'h7'],
    caption:
      "Locked center (d5/e5). Black expanded queenside (a6/b5/c5); White holds the center with e4/d5. Slow positional middlegame ahead.",
  },
];

export const MODERN_DEFENSE_LESSON_EPISODE: Episode = {
  id: 'modern_defense_lesson',
  track: 'lesson',
  title: "Modern Defense Explained by an AI (Tiger's Modern, Move by Move)",
  summary:
    "An AI walks through the Modern Defense — Black's most FLEXIBLE system opening. Slow queenside expansion, no theory burden, lots of hypermodern flexibility.",
  source: 'agent_generated',
  pgn: MODERN_DEFENSE_LESSON_PGN,
  commentator: MODERN_DEFENSE_LESSON_COMMENTATOR,
  bookStandard: MODERN_BOOK_STANDARD,
  chapters: MODERN_CHAPTERS,
  keyIdeas: MODERN_KEY_IDEAS,
  whatToWatch: MODERN_WHAT_TO_WATCH,
  funFacts: MODERN_FUN_FACTS,
  moveTangents: MODERN_TANGENTS,
  boardBranches: MODERN_BOARD_BRANCHES,
  whiteboardScenes: MODERN_WHITEBOARD,
  exports: MODERN_DEFENSE_LESSON_EXPORT,
};

export {
  MODERN_DEFENSE_LESSON_PGN,
  MODERN_DEFENSE_LESSON_COMMENTATOR,
  MODERN_DEFENSE_VARIATIONS,
  MODERN_DEFENSE_LESSON_EXPORT,
};
