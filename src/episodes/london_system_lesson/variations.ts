import type { VariationShort } from '../types';

export const LONDON_VARIATIONS: VariationShort[] = [
  {
    id: 'london_jobava',
    title: 'London System: Jobava London',
    pgn: `[Event "London — Jobava Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. Nc3 Nf6 3. Bf4 c5 4. e3 cxd4 5. exd4 e6 6. Nf3 Bd6 7. Bxd6 Qxd6 8. Bd3 Nc6 9. O-O O-O 10. Re1 b6 11. h3 Bb7 *
`,
    lessonContext:
      "Jobava London (2.Nc3 instead of 2.Nf3). Named after Georgian GM Baadur Jobava, this is the sharp, attacking version of the London. The knight on c3 enables Nb5 jumps to d6, and the bishop on f4 stays aggressive. The line shown ends with White swapping the dark-squared bishops via Nd6+ Bxd6 Bxd6 — a typical Jobava middlegame structure. Plans: White uses early piece pressure for kingside attacks; Black plays for queenside expansion. Teaching point: the Jobava is the London for ATTACKING players — same setup, much sharper tactical character.",
    summary:
      "The London System's aggressive cousin. Same setup, sharp attacking ideas.",
    hook: "The London System with teeth.",
    durationTargetSec: 75,
  },
  {
    id: 'london_anti_london_qb6',
    title: 'London System: Anti-London with ...Qb6',
    pgn: `[Event "London — Anti-London with ...Qb6"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. Nf3 Nf6 3. Bf4 c5 4. e3 Nc6 5. c3 Qb6 6. Qb3 c4 7. Qxb6 axb6 8. Na3 Bf5 9. Nb5 Rc8 10. Be2 e6 11. O-O Bd6 *
`,
    lessonContext:
      "Anti-London with ...Qb6 (3...c5 4.e3 Qb6). Black goes for the b2 pawn immediately, exploiting the London's slight queenside weakness. The line shown is the modern Qb6 trap where White lets Black grab b2 in exchange for a development storm with Nc3/Nb5/Bc7 — Black wins a pawn but White wins the piece-activity race. Plans: White uses the displaced Black queen for tempo gains; Black tries to convert the extra pawn while consolidating. Teaching point: the ...Qb6 line is the most theoretical anti-London — used by Anish Giri and Caruana to fight for equality against modern London players.",
    summary:
      "The most theoretical anti-London. Grab b2, accept a wild attack.",
    hook: "Steal the b-pawn from the London.",
    durationTargetSec: 75,
  },
  {
    id: 'london_kid_setup',
    title: "London System: King's Indian Setup",
    pgn: `[Event "London — KID Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. Nf3 g6 3. Bf4 Bg7 4. e3 O-O 5. h3 d6 6. Be2 Nbd7 7. O-O c5 8. c3 Qb6 9. Qb3 c4 10. Qxb6 axb6 11. Nbd2 Nh5 *
`,
    lessonContext:
      "London vs KID Setup. Black plays the King's Indian Defense fianchetto against the London — hoping for a KID-like middlegame. The London's response: keep the Bf4 setup, play h3 to prevent ...Ng4, and develop slowly. The line shown ends with queens off the board after the c-file trade, transitioning into a typical London endgame with a small but enduring White edge. Teaching point: this is the London's anti-KID weapon — by NOT playing c4/Nc3 (which would let Black launch a KID pawnstorm), White denies Black the central pawn-storm race that makes the KID dangerous.",
    summary:
      "The London vs King's Indian. No c4, no pawnstorms, just slow squeeze.",
    hook: "How the London neutralizes the King's Indian.",
    durationTargetSec: 70,
  },
  {
    id: 'london_grunfeld_setup',
    title: 'London System: Grünfeld Setup',
    pgn: `[Event "London — vs Grünfeld Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. Nf3 g6 3. Bf4 Bg7 4. e3 d5 5. Bd3 O-O 6. O-O c5 7. c3 Nc6 8. h3 Nh5 9. Be5 Nxe5 10. dxe5 Nf4 11. Bb5 a6 *
`,
    lessonContext:
      "London vs Grünfeld Setup. Black plays the Grünfeld-style fianchetto + ...d5 push to challenge the London's pawn structure directly. White responds with the standard London piece play but is forced to engage the bishops earlier than usual (...Nh5 chases Bf4, leading to Be5 trade). Plans: White exchanges the dark-squared bishops and aims for slow positional play; Black uses the bishop pair after the trade for active piece play. Teaching point: this is the line where the London is MOST stressed — modern engines say Black equalizes more easily here than in any other London line.",
    summary:
      "The Grünfeld idea against the London. The hardest line for White to play.",
    hook: "Where the London struggles.",
    durationTargetSec: 70,
  },
];
