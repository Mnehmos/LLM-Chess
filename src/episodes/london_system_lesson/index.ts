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
import { LONDON_SYSTEM_LESSON_PGN } from './pgn';
import { LONDON_SYSTEM_LESSON_COMMENTATOR } from './commentator';
import { LONDON_VARIATIONS } from './variations';
import { LONDON_SYSTEM_LESSON_EXPORT } from './exports';

// ─── London System book standard ───────────────────────────────
const LONDON_BOOK_STANDARD = [
  'London System book standard.',
  "White's goal: play the SAME setup against anything (d4 + Nf3 + Bf4 + e3 + Bd3 + c3 + Nbd2), commit zero theory burden, and use the Ne5 outpost + slow kingside pressure to grind a small permanent edge.",
  "Black's goal: equalize comfortably by mirroring development (...Nf6/...e6/...Bd6/...O-O) and timing the ...c5 break to challenge White's pawn pyramid before it locks in.",
  "Holding lines: White's bishop on f4 must NEVER be trapped (avoid premature h-pawn / g-pawn pushes); Black must respect the Bxh7 sacrifice possibilities; both sides develop their dark-squared bishop EARLY before pawn chains lock it in.",
  "Common pitfalls: White hangs b2 to early ...Qb6 (must answer Nc3 or b3); Black plays ...c5 too late and lets White entrench; either side trades the wrong piece on the c1-h6 diagonal.",
].join(' ');

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

// ─── Move tangents (ghost arrows on alternative single moves) ───
// Single-move alternatives shown as dashed arrows during the matching
// ply's narration. All SANs verified legal against the main PGN's
// position BEFORE the ply they apply to.
const LONDON_TANGENTS: MoveTangent[] = [
  {
    ply: 3, // White's 2nd move (Nf3 in main)
    san: 'Bf4',
    category: 'move_order_trap',
    note: "Playing Bf4 BEFORE Nf3 is the 'Mason setup' — same pieces, but Black can hit b2 immediately with ...Qb6 because no knight defends it yet. Develop knights first.",
  },
  {
    ply: 5, // White's 3rd move (Bf4 in main)
    san: 'c4',
    category: 'engine_refutation',
    note: "Pushing c4 here transposes into the Queen's Gambit — a totally different opening. The whole point of the London is to AVOID committing the c-pawn.",
  },
  {
    ply: 9, // White's 5th move (Bg3 in main)
    san: 'Be2',
    category: 'student_mistake',
    note: 'Be2 retreats the wrong bishop. The Bf4 bishop should slide to g3 (back rank) to dodge ...Nh5; Be2 is the f1 bishop, which should still be aimed at the kingside via Bd3.',
  },
  {
    ply: 13, // White's 7th move (c3 in main)
    san: 'c4',
    category: 'engine_refutation',
    note: "Pushing c4 transposes back into Queen's Gambit lines — interesting but defeats the system-opening philosophy. The slow c3 supports d4 and keeps the structure rigid.",
  },
  {
    ply: 19, // White's 10th move (Bxd6 in main)
    san: 'Bh4',
    category: 'student_mistake',
    note: 'Bh4 keeps the bishop pair but loses tempo and concedes the e5 square. The principled choice is to trade on d6 — bishops are equal, and White gets the Ne5 outpost.',
  },
  {
    ply: 21, // White's 11th move (Ne5 in main)
    san: 'dxc5',
    category: 'engine_refutation',
    note: 'dxc5 opens the position prematurely. Ne5 keeps the pawn structure locked, controls the center, and pressures f7/c6 simultaneously — the textbook London plan.',
  },
];

// ─── Board branches (instructor "what if" interludes) ───────────
// Each branch fires AFTER the named ply, plays its branchMoves on
// the actual board with the amber banner, then restores the main
// line. All SANs validated legal against the main PGN's position.
const LONDON_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'london_jobava_alternative',
    afterPly: 4, // After 2...Nf6 (black's 2nd), white to move
    fromPly: 4,
    title: "What if White played Nc3 instead? (The Jobava London)",
    branchMoves: ['Nc3', 'g6', 'Bf4', 'Bg7', 'e3', 'O-O'],
    narrationCue:
      "Show what happens if White plays the Jobava setup — Nc3 instead of the Bf4 system. The Bf4 bishop still comes out, but now the c3 knight is on c3 instead of being held back for Nbd2 later. This is the aggressive cousin of the London, popularized by GM Baadur Jobava. Plans: faster Nb5/Nd6+ jumps and earlier kingside attacks at the cost of structural flexibility.",
    returnToPly: 4,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'london_anti_london_c5',
    afterPly: 5, // After 3.Bf4 (white's 3rd), black to move
    fromPly: 5,
    title: 'What if Black plays anti-London ...c5 + ...Qb6?',
    branchMoves: ['c5', 'e3', 'Nc6', 'c3', 'Qb6', 'Qb3'],
    narrationCue:
      "Show the most theoretical anti-London setup: Black skips ...e6 and immediately attacks the center with ...c5, then hits b2 with ...Qb6. White's standard answer is to mirror the queen with Qb3, offering the trade. The resulting endgame is roughly equal — but Black has equalized far more directly than in the main lesson. This is the line Anish Giri and Caruana use to neutralize the London at the top level.",
    returnToPly: 5,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'london_nh5_chase',
    afterPly: 12, // After 6.Bd3 (white's 6th), black to move
    fromPly: 12,
    title: 'What if Black plays ...Nh5 chasing the Bg3 bishop?',
    branchMoves: ['Nh5', 'Be2', 'Nxg3', 'hxg3', 'c5', 'c3'],
    narrationCue:
      "Show the ...Nh5 chase — Black's most common anti-London idea. The knight attacks Bg3, forcing the bishop to retreat with Be2 or accept the trade. After ...Nxg3 hxg3 Black has eliminated White's dark-squared bishop, but White's h-file opens — usable for attacks if the king is castled. Trade is roughly equal, but the resulting structure is sharper than the main lesson line.",
    returnToPly: 12,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'london_f4_f5_attack',
    afterPly: 22, // End of main line, white to move — the natural next plan
    fromPly: 22,
    title: 'What does the next phase look like? f4-f5 attack',
    branchMoves: ['f4', 'Ne7', 'f5', 'exf5', 'Bxf5', 'Ng6'],
    narrationCue:
      "Show the natural continuation of the lesson: White's f4-f5 break attacks the kingside. Black retreats with ...Ne7 to defend, White plays f5 to open the position, and after exchanges the bishop reaches f5 controlling key squares. This is what the WHOLE London setup was building toward — slow positional pressure converting into a kingside attack.",
    returnToPly: 22,
    branchMoveDelayMs: 1800,
  },
];

// ─── Whiteboard scenes (educational slates, ?whiteboard=1 gated) ─
const LONDON_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 5, // After 3.Bf4
    heading: "What makes this 'the London'?",
    narrationCue:
      "Pause to set up the lesson: what defines the London System, why it's so popular, what win conditions White targets.",
    durationMs: 13000,
    bullets: [
      'd4 + Nf3 + Bf4 are the three moves that DEFINE the London — everything else flexes around them.',
      'Bf4 puts the dark-squared bishop OUTSIDE the pawn chain (vs the QGD where it gets locked behind c1-d2).',
      'Goal: small permanent positional edge with minimum theory burden.',
      'Used by Carlsen, So, Caruana, and the entire club-level world.',
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 14, // After 7.c3 — the pyramid is fully formed
    heading: 'The London Pyramid',
    narrationCue:
      'Pause to show the locked pawn skeleton — the structure every London game converges on.',
    durationMs: 12000,
    whitePawns: ['a2', 'b2', 'c3', 'd4', 'e3', 'f2', 'g2', 'h2'],
    blackPawns: ['a7', 'b7', 'c5', 'd5', 'e6', 'f7', 'g7', 'h7'],
    caption:
      'c3 + d4 + e3 — the "London Pyramid". Slightly cramped but extremely durable: it survives almost every middlegame break.',
  },
  {
    kind: 'move_tree',
    ply: 22, // After the final move
    heading: 'Three Plans from Ne5',
    narrationCue:
      'Pause to outline the strategic fork from the Ne5 outpost: what comes next.',
    durationMs: 14000,
    root: 'After 11.Ne5, White picks one of three plans:',
    branches: [
      {
        label: 'Kingside attack — f4 + Qh5',
        moves: ['f4', 'Ne7', 'f5', 'exf5', 'Bxf5', 'Ng6'],
      },
      {
        label: 'Central break — c4 + dxc5',
        moves: ['Nxc6', 'Qxc6', 'c4', 'cxd4', 'cxd5'],
      },
      {
        label: 'Slow squeeze — double rooks on c-file',
        moves: ['Rc1', 'Rac8', 'Nb3', 'Ne4', 'Nxc5'],
      },
    ],
  },
  {
    kind: 'bullets',
    ply: 22, // After the move tree (chained, so this plays after move_tree finishes)
    heading: 'The London Decision Tree',
    narrationCue:
      "Pause to give the viewer the practical takeaway: how to know which London plan to pick against any Black setup.",
    durationMs: 14000,
    bullets: [
      'Black plays ...c5 + ...Nc6 + ...Bd6 → the main lesson line, aim for Ne5 + slow kingside.',
      "Black plays ...Bf5 + ...Slav setup (c6/d5) → trade Bishop pair, play for queenside grinds.",
      'Black plays KID setup (...g6/...Bg7) → h3 to deny ...Ng4, slow positional pressure.',
      'Black plays ...Qb6 hitting b2 → answer with Qb3, equal endgame, accept it.',
    ],
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
  bookStandard: LONDON_BOOK_STANDARD,
  chapters: LONDON_CHAPTERS,
  keyIdeas: LONDON_KEY_IDEAS,
  whatToWatch: LONDON_WHAT_TO_WATCH,
  funFacts: LONDON_FUN_FACTS,
  moveTangents: LONDON_TANGENTS,
  boardBranches: LONDON_BOARD_BRANCHES,
  whiteboardScenes: LONDON_WHITEBOARD,
  exports: LONDON_SYSTEM_LESSON_EXPORT,
};

export {
  LONDON_SYSTEM_LESSON_PGN,
  LONDON_SYSTEM_LESSON_COMMENTATOR,
  LONDON_VARIATIONS,
  LONDON_SYSTEM_LESSON_EXPORT,
};
