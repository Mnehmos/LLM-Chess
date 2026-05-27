import type { VariationShort } from '../types';

export const COLLE_VARIATIONS: VariationShort[] = [
  {
    id: 'colle_zukertort',
    title: 'Colle: Zukertort System',
    pgn: `[Event "Colle — Zukertort System"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 c5 5. b3 Nc6 6. Bb2 Bd6 7. O-O O-O 8. Nbd2 b6 9. Ne5 Bb7 10. f4 Ne7 11. Qf3 Ng6 *
`,
    lessonContext:
      "Zukertort System (5.b3 instead of 5.c3). White fianchettoes the dark-squared bishop on b2 instead of locking it in with c3. Plans: White uses the long diagonal pressure of Bb2 + the Ne5/f4 kingside attack; Black plays for ...Ng6 reroute and queenside expansion. Teaching point: the Zukertort is the Colle for ATTACKING players — same skeleton, much sharper kingside intentions.",
    summary: "The Colle's aggressive cousin — fianchetto the dark bishop and attack on the kingside.",
    hook: "The Colle for attacking players.",
    durationTargetSec: 75,
  },
  {
    id: 'colle_rubinstein_setup',
    title: 'Colle: Rubinstein Setup (...Nbd7)',
    pgn: `[Event "Colle — Rubinstein Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 Nbd7 5. c3 c5 6. Nbd2 Bd6 7. O-O O-O 8. Re1 Qc7 9. e4 cxd4 10. cxd4 dxe4 11. Nxe4 Nxe4 *
`,
    lessonContext:
      "Rubinstein Setup with ...Nbd7. Black develops the queen's knight to d7 first (instead of c6) — supporting c5 + freeing the c-file. The line shown ends with the standard Colle e4 break + central exchanges. Plans: White still aims for the e4 push and kingside attack; Black gets piece exchanges and a slightly cramped but solid position.",
    summary: "Develop the knight to d7 first — solid, principled, easier to play than the main line.",
    hook: "The simplest anti-Colle setup.",
    durationTargetSec: 70,
  },
  {
    id: 'colle_meran_like',
    title: 'Colle: vs Meran-like ...c6',
    pgn: `[Event "Colle — vs Meran-like ...c6"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. Nf3 Nf6 3. e3 c6 4. Bd3 e6 5. c3 Nbd7 6. Nbd2 Bd6 7. O-O O-O 8. e4 dxe4 9. Nxe4 Nxe4 10. Bxe4 e5 11. dxe5 Nxe5 *
`,
    lessonContext:
      "Anti-Colle with ...c6 (Slav setup). Black supports d5 with c6 instead of c5, copying the Slav Defense's idea — keep the light-squared bishop free for ...Bf5 or ...Bg4 later. The line shown leads to the standard Colle e4 break + central trades. Teaching point: ...c6 trades the c-file aggression of ...c5 for STRUCTURAL solidity — Black accepts a slightly slower game in exchange for less risk.",
    summary: "Slav-style ...c6 — trade aggression for solidity. Easier for Black to play safely.",
    hook: "When Black plays the Slav defense against the Colle.",
    durationTargetSec: 70,
  },
  {
    id: 'colle_torre_attack',
    title: 'Colle: Transposition to Torre Attack',
    pgn: `[Event "Colle — Torre Transposition"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. Nf3 Nf6 3. Bg5 e6 4. e3 Bd6 5. Nbd2 O-O 6. Bd3 c5 7. c3 Nc6 8. Qe2 b6 9. O-O Bb7 10. dxc5 bxc5 11. e4 dxe4 *
`,
    lessonContext:
      "Torre Attack — 3.Bg5 transposition out of the Colle. By playing Bg5 BEFORE e3, White develops the dark-squared bishop OUTSIDE the pawn chain (solving the Colle's classic c1-bishop problem). The position transposes into a setup very similar to the Trompowsky / Torre. Plans: pin the f6 knight, play for Nbd2 + Bd3 + queenside pressure, then crack open with e4. Teaching point: the Torre is the Colle for players who refuse to leave their dark-squared bishop locked in.",
    summary: "The Colle that fixes its own bishop problem — Bg5 before e3.",
    hook: "Develop the bishop before it gets trapped.",
    durationTargetSec: 75,
  },
];
