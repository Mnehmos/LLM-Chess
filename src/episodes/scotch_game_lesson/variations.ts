import type { VariationShort } from '../types';

export const SCOTCH_VARIATIONS: VariationShort[] = [
  {
    id: 'scotch_mieses',
    title: 'Scotch: Mieses Variation',
    pgn: `[Event "Scotch — Mieses Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nxc6 bxc6 6. e5 Qe7 7. Qe2 Nd5 8. c4 Ba6 9. b3 g6 10. Nd2 Bg7 11. Bb2 O-O *
`,
    lessonContext:
      "Mieses Variation (4...Nf6 5.Nxc6). White trades the knights and pushes e5 to chase Black's knight, creating an early imbalance. The line shown is the modern Mieses with ...Ba6 hitting the c4 pawn diagonally. Plans: White uses the e5 wedge for kingside space; Black plays for the long diagonal with ...g6/...Bg7 and aims for ...c5 break. Teaching point: this is Kasparov's signature Scotch line — used in his 1990 PCA matches to dodge anti-Ruy preparation.",
    summary:
      "Kasparov's signature Scotch. Trade knights, push e5, fight for the long diagonal.",
    hook: "Kasparov's anti-Ruy weapon.",
    durationTargetSec: 75,
  },
  {
    id: 'scotch_steinitz',
    title: 'Scotch: Steinitz Variation',
    pgn: `[Event "Scotch — Steinitz Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Be2 Qxe4 7. Nb5 Bxc3+ 8. bxc3 Kd8 9. O-O Nf6 10. Bd3 Qg4 11. Bf4 d6 *
`,
    lessonContext:
      "Steinitz Variation (4...Qh4). Black brings the queen out early to harass White's center directly — the line that gave Steinitz fits in the 1880s. After 5.Nc3 Bb4 6.Be2 Qxe4 Black has grabbed the e-pawn but lost castling rights (Kd8). Plans: White uses the development lead to attack Black's exposed king; Black tries to consolidate and convert the pawn advantage into a long endgame. Teaching point: this is a textbook trade-off opening — \"open theory: \"sound\" but uncomfortable for Black, very hard to play correctly.\"",
    summary:
      'Grab the e-pawn, lose castling rights. Sound but uncomfortable.',
    hook: 'Take the pawn, walk the king.',
    durationTargetSec: 70,
  },
  {
    id: 'scotch_schmidt',
    title: 'Scotch: Schmidt Variation',
    pgn: `[Event "Scotch — Schmidt Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. Nxc6 bxc6 7. Bd3 d5 8. exd5 cxd5 9. O-O O-O 10. Bg5 c6 11. Qf3 Be7 *
`,
    lessonContext:
      "Schmidt Variation (4...Nf6 5.Nc3 Bb4). Black develops the knight and pins the c3 knight to discourage e5. The line shown is the classical Schmidt with the central pawn trade on d5/e5. Plans: White uses the bishop pair (Bd3 + Bg5) and queen pressure on f3; Black plays for solid development and equality. Teaching point: this is the most positional Scotch line — Black accepts an isolated d-pawn in exchange for active piece play and a Nimzo-like dark-square strategy.",
    summary:
      "The positional Scotch. Trade in the center, accept an isolated d-pawn for piece play.",
    hook: 'The Scotch without the tactics.',
    durationTargetSec: 70,
  },
  {
    id: 'scotch_gambit',
    title: 'Scotch Gambit',
    pgn: `[Event "Scotch Gambit"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Nf6 5. e5 d5 6. Bb5 Ne4 7. Nxd4 Bd7 8. Bxc6 bxc6 9. O-O Bc5 10. f3 Ng5 11. Be3 Bxd4 *
`,
    lessonContext:
      "Scotch Gambit (4.Bc4 instead of 4.Nxd4). White sacrifices the central pawn to develop with tempo and open lines for attack. The line shown is the modern main with 4...Nf6 5.e5 forcing Black's knight to retreat. Plans: White uses the bishop pair and development lead to attack f7 and the king; Black gives back the pawn and aims for a slightly worse but defensible position. Teaching point: the Scotch Gambit is the line for players who want INTENSE pressure on move 5 — used by Morphy, Anderssen, and other romantic-era attackers.",
    summary:
      "Sacrifice the pawn for development. The romantic-era Scotch attacking weapon.",
    hook: 'Morphy-style Scotch.',
    durationTargetSec: 75,
  },
];
