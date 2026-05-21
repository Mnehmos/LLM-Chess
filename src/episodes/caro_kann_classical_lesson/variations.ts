import type { VariationShort } from '../types';

export const CARO_KANN_VARIATIONS: VariationShort[] = [
  {
    id: 'caro_kann_advance',
    title: 'Caro-Kann: Advance Variation',
    pgn: `[Event "Caro-Kann — Advance Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 5. Be2 Nd7 6. O-O Ne7 7. Nbd2 Ng6 8. Nb3 Be7 9. Bd2 O-O 10. h3 Nh4 *
`,
    lessonContext:
      "Caro-Kann Advance (3.e5). White locks the center immediately and accepts a French-like pawn chain — but Black has already gotten the light-squared bishop OUT to f5, which is exactly the French's pain point that the Caro-Kann was designed to avoid. Plans: Black builds slowly with ...e6/...Nd7/...Ne7-g6 retargeting the f4 square; White looks for c3+Nbd2-b3 maneuvers and a kingside attack. Teaching point: the Advance is the move White plays when they want a closed positional game against the Caro-Kann; Black is structurally well-set for it.",
    summary:
      "White locks the center. Black gets the French structure but with the bishop OUT — exactly what the Caro-Kann was designed for.",
    hook: "The French Defense pain point, fixed.",
    durationTargetSec: 75,
  },
  {
    id: 'caro_kann_panov_botvinnik',
    title: 'Caro-Kann: Panov-Botvinnik Attack',
    pgn: `[Event "Caro-Kann — Panov-Botvinnik"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 Nf6 5. Nc3 e6 6. Nf3 Be7 7. cxd5 Nxd5 8. Bd3 O-O 9. O-O Nc6 10. Re1 Nf6 11. a3 b6 *
`,
    lessonContext:
      "Panov-Botvinnik Attack (3.exd5 cxd5 4.c4). White exchanges in the center and then pushes c4 to attack the d5 pawn — transposing the Caro-Kann into Queen's Gambit / IQP territory. Black accepts an isolated d-pawn position in exchange for active piece play and a solid structure. Plans: White attacks the d5 weakness with Nc3/Nf3/c4-c5 ideas; Black mobilizes pieces around the isolated pawn (...Be7/...O-O/...Nc6) and looks for ...Nf6-d5 outpost or ...b6 fianchetto. Teaching point: the Panov turns the Caro-Kann into a completely different opening — it's a transpositional weapon, not a separate system.",
    summary:
      'The Caro-Kann turned inside out — White trades into a Queen\'s Gambit-style IQP position.',
    hook: 'When White refuses to play "the Caro-Kann."',
    durationTargetSec: 75,
  },
  {
    id: 'caro_kann_exchange',
    title: 'Caro-Kann: Exchange Variation',
    pgn: `[Event "Caro-Kann — Exchange Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c6 2. d4 d5 3. exd5 cxd5 4. Bd3 Nc6 5. c3 Nf6 6. Bf4 Bg4 7. Qb3 Qd7 8. Nd2 e6 9. Ngf3 Bd6 10. Bxd6 Qxd6 11. O-O O-O *
`,
    lessonContext:
      "Caro-Kann Exchange (3.exd5 cxd5). The simplest anti-Caro-Kann — White trades pawns immediately and aims for a quiet positional game with no IQP. Both sides have symmetric structure; the only imbalance is Black's slightly cramped queenside and White's tiny lead in development. Plans: White plays for the Bd3/c3/Bf4 setup and looks for minority attack ideas (b4-b5); Black mirrors development and aims for ...Qb6 pressure on b2 or ...Bf5-e4 trades. Teaching point: the Exchange is the line White picks to AVOID memorizing Caro-Kann theory — equal positions, low theoretical burden.",
    summary:
      'The lazy anti-Caro-Kann. White trades into symmetric structure and plays slow positional chess.',
    hook: 'The Caro-Kann without the theory.',
    durationTargetSec: 65,
  },
  {
    id: 'caro_kann_two_knights',
    title: 'Caro-Kann: Two Knights Variation',
    pgn: `[Event "Caro-Kann — Two Knights Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c6 2. Nc3 d5 3. Nf3 Bg4 4. h3 Bxf3 5. Qxf3 e6 6. d4 Nf6 7. Bd3 Be7 8. O-O O-O 9. Bd2 Nbd7 10. Rae1 c5 11. e5 Ne8 *
`,
    lessonContext:
      "Two Knights Variation (2.Nc3 d5 3.Nf3). White develops both knights immediately and only THEN decides the central plan. The line shown ends in a typical Botvinnik-style structure: Black gives up the bishop pair (3...Bg4 4.h3 Bxf3 5.Qxf3) for solid development and central counterplay with ...c5. Plans: White uses the bishop pair and queen on f3 for kingside pressure; Black equalizes with ...c5 break against the center. Teaching point: the Two Knights is the line for White players who want to avoid heavy Caro-Kann theory by NOT committing the d-pawn early.",
    summary:
      "Both knights out first. White avoids Caro-Kann theory by leaving the d-pawn flexible.",
    hook: "Develop first, decide later.",
    durationTargetSec: 70,
  },
];
