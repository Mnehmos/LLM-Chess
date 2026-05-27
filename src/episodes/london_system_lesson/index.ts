import type { Episode, EpisodeChapter, KeyIdeasBlock, WhatToWatchBlock, FunFact } from '../types';
import { LONDON_SYSTEM_LESSON_PGN } from './pgn';
import { LONDON_SYSTEM_LESSON_COMMENTATOR } from './commentator';
import { LONDON_VARIATIONS } from './variations';
import { LONDON_SYSTEM_LESSON_EXPORT } from './exports';

// Multi-modal authoring for the London System.
// Main PGN: 1.d4 d5 2.Nf3 Nf6 3.Bf4 e6 4.e3 Bd6 5.Bg3 O-O 6.Bd3 c5
//           7.c3 Nc6 8.Nbd2 b6 9.O-O Bb7 10.Bxd6 Qxd6 11.Ne5 Rfd8
// 22 plies total. Chapters segment the lesson into 5 narrative beats.

const LONDON_CHAPTERS: EpisodeChapter[] = [
  {
    ply: 0,
    title: 'The London Skeleton',
    subtitle: 'd4 + Nf3 + Bf4 — the system that needs no theory',
  },
  {
    ply: 5, // White plays 3.Bf4
    title: 'Bishop Out First',
    subtitle: "Solving the QGD bad-bishop problem before it can exist",
  },
  {
    ply: 11, // White plays 6.Bd3 (after both develop)
    title: 'The Pyramid Comes Together',
    subtitle: 'c3 + d4 + e3 — slightly cramped, very solid',
  },
  {
    ply: 17, // White's Nbd2 + O-O coming
    title: 'Trade or Pressure?',
    subtitle: "The Bxd6 trade question — keep the bishop or simplify?",
  },
  {
    ply: 21, // Move 11 — Ne5 reaches the outpost
    title: 'Ne5 — The London Outpost',
    subtitle: 'Where every London plan converges',
  },
];

const LONDON_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      "White plays the same setup regardless of Black's reply — minimum theory.",
      "Bf4 puts the dark-squared bishop OUTSIDE the pawn chain (solves the QGD's bad-bishop problem).",
      "The London is the most popular club opening of the 2020s.",
      "Used by Carlsen, So, Caruana, and most online grinders.",
    ],
  },
  {
    chapterPly: 5,
    ideas: [
      "3.Bf4 commits the dark-squared bishop BEFORE the pawn chain locks in.",
      "Black's mirror response: ...Bd6 contests the long diagonal.",
      "Trading dark-squared bishops simplifies for both sides — neither is materially behind.",
      "If Black plays ...Qb6 attacking b2 instead, see the Anti-London variation.",
    ],
  },
  {
    chapterPly: 11,
    ideas: [
      "c3 + d4 + e3 = the 'London Pyramid'. Slightly cramped, but very durable.",
      "The d4 pawn is the foundation — losing it means losing the whole structure.",
      "Bd3 aims at h7, often supporting Ne5 + Qh5 attacks later.",
      "Black breaks with ...c5 to challenge d4 (or ...e5 in some variations).",
    ],
  },
  {
    chapterPly: 17,
    ideas: [
      "Bxd6 trades a strong bishop for a strong piece — usually equal.",
      "Keeping bishops means risking ...Nh5 chasing Bf4 to a worse square.",
      "After Bxd6 Qxd6, Black's queen sits beautifully — but White gets Ne5 plans.",
      "The trade simplifies White's plan: Ne5 outpost + slow kingside.",
    ],
  },
  {
    chapterPly: 21,
    ideas: [
      "Ne5 is the London's signature middlegame outpost — controlled by f4 + d4 pawns.",
      "From e5, the knight pressures f7, c6, d7 — and supports f4-f5 attack.",
      "Black often answers with ...Nd7 to challenge or ...Nxe5 to trade.",
      "If Black trades, White's central pawn structure dominates the endgame.",
    ],
  },
];

const LONDON_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  {
    chapterPly: 0,
    text: "Watch how White's first three moves never change. The Bf4 commitment is what makes this 'the London' — the f4 square pins the system together.",
  },
  {
    chapterPly: 5,
    text: "Watch whether Black mirrors with ...Bd6 (most common) or sidesteps the bishop trade. Bishop swaps here are EQUAL — neither side gets a material edge.",
  },
  {
    chapterPly: 11,
    text: "Watch the d4 square. If Black can force ...cxd4 cxd4 ...e5, the pyramid collapses. If White holds d4, the slow squeeze begins.",
  },
  {
    chapterPly: 17,
    text: "Watch the bishop-pair count. After Bxd6 Qxd6, both sides have one bishop and the structure is symmetric — the position becomes purely strategic.",
  },
  {
    chapterPly: 21,
    text: "Watch the Ne5 square's defenders and attackers. Whoever wins the e5 fight wins the middlegame; the rest of the position rotates around it.",
  },
];

const LONDON_FUN_FACTS: FunFact[] = [
  {
    label: 'History',
    text: "The London System gets its name from the 1922 London tournament where it was played by several top masters.",
  },
  {
    label: 'Modern usage',
    text: "Magnus Carlsen plays the London regularly in online blitz — his game vs Nakamura at the 2022 Norway Chess featured this exact 11-move setup.",
  },
  {
    label: 'Theory',
    text: "Unlike the Queen's Gambit, the London avoids the entire QGD/Slav theory complex — it's the same setup against any Black response.",
  },
  {
    label: 'Quote',
    text: "Eric Rosen on the London: 'It's not the best opening, but it's the most STABLE — you'll always know what to do.'",
  },
  {
    label: 'Patterns',
    text: "The 'London Pyramid' (c3+d4+e3) is one of the most durable pawn formations in chess — it can survive most middlegame breaks.",
  },
];

export const LONDON_SYSTEM_LESSON_EPISODE: Episode = {
  id: 'london_system_lesson',
  track: 'lesson',
  title: 'London System Explained by an AI (Classical Bf4 Setup, Move by Move)',
  summary:
    "An AI walks through the London System (Classical Bf4 setup), playing both sides through the system-opening philosophy — no theory burden, rock-solid structure — that made it the most popular club opening of the 2020s.",
  source: 'agent_generated',
  pgn: LONDON_SYSTEM_LESSON_PGN,
  commentator: LONDON_SYSTEM_LESSON_COMMENTATOR,
  chapters: LONDON_CHAPTERS,
  keyIdeas: LONDON_KEY_IDEAS,
  whatToWatch: LONDON_WHAT_TO_WATCH,
  funFacts: LONDON_FUN_FACTS,
  exports: LONDON_SYSTEM_LESSON_EXPORT,
};

export {
  LONDON_SYSTEM_LESSON_PGN,
  LONDON_SYSTEM_LESSON_COMMENTATOR,
  LONDON_VARIATIONS,
  LONDON_SYSTEM_LESSON_EXPORT,
};
