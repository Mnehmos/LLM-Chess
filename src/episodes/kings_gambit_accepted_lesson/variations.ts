import type { VariationShort } from '../types';

export const KINGS_GAMBIT_VARIATIONS: VariationShort[] = [
  {
    id: 'kg_kieseritzky',
    title: "King's Gambit: Kieseritzky Variation",
    pgn: `[Event "King's Gambit — Kieseritzky"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4 g4 5. Ne5 Nf6 6. Bc4 d5 7. exd5 Bd6 8. d4 Nh5 9. Bxf4 Nxf4 10. O-O Qxh4 11. Qxg4 Qxg4 *
`,
    lessonContext:
      "Kieseritzky Variation (3...g5 4.h4 g4 5.Ne5). Black holds the f4 pawn with ...g5, White pushes h4 to chase the g-pawn, and a chaotic tactical sequence ensues. The line shown is Anderssen's actual line from the \"Immortal Game\" — the most famous game in chess history was won from this exact position. Plans: White sacrifices everything for kingside development and attack; Black holds material and tries to consolidate. Teaching point: this is the opening of Anderssen's \"Immortal Game\" — Anderssen sacrificed a bishop, both rooks, and the queen in 18 moves to deliver mate.",
    summary:
      "Anderssen's Immortal Game line. Sacrifice everything for a mating attack.",
    hook: 'The opening of the Immortal Game.',
    durationTargetSec: 85,
  },
  {
    id: 'kg_falkbeer_countergambit',
    title: "King's Gambit: Falkbeer Countergambit",
    pgn: `[Event "King's Gambit — Falkbeer Countergambit"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. f4 d5 3. exd5 e4 4. d3 Nf6 5. dxe4 Nxe4 6. Nf3 Bc5 7. Qe2 Bf5 8. Nc3 Qe7 9. Be3 Bxe3 10. Qxe3 Nxc3 11. Qxe7+ Kxe7 *
`,
    lessonContext:
      "Falkbeer Countergambit (2...d5). Black REFUSES to accept the gambit and instead counters with their own central pawn sacrifice. The line shown is the modern Falkbeer with Nimzowitsch-style ...e4 push followed by piece play. Plans: White uses the development lead from the pawn grab; Black has the more active position and aims for queenside expansion. Teaching point: the Falkbeer is the line for Black players who refuse to play the King's Gambit on White's terms — counter-sacrifice immediately, fight for initiative.",
    summary:
      "Refuse the gambit. Counter-sacrifice and fight for initiative.",
    hook: "Don't accept the gambit — sacrifice your own pawn instead.",
    durationTargetSec: 75,
  },
  {
    id: 'kg_classical_3_bishops',
    title: "King's Gambit: Bishop's Gambit",
    pgn: `[Event "King's Gambit — Bishop's Gambit"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. f4 exf4 3. Bc4 Nf6 4. Nc3 Bb4 5. e5 d5 6. exd6 Bxc3 7. bxc3 Qxd6 8. Qe2+ Be6 9. d4 Nbd7 10. Bxe6 Qxe6 11. Bxf4 O-O *
`,
    lessonContext:
      "Bishop's Gambit (3.Bc4). Instead of 3.Nf3, White develops the bishop to c4 first — same aggressive intent (attack f7) but with different move order. The line shown is the classical Bishop's Gambit with ...Bb4 pinning the c3 knight. Plans: White's bishop on c4 aims at f7 and the king; Black develops actively and aims for ...Nf6 + ...d5 break. Teaching point: the Bishop's Gambit is the King's Gambit for players who want to delay Nf3 — useful for transpositional flexibility and avoiding 3.Nf3 g5 lines.",
    summary:
      "The King's Gambit without 3.Nf3. Bishop attacks f7 immediately.",
    hook: 'Develop the bishop before the knight.',
    durationTargetSec: 70,
  },
  {
    id: 'kg_declined',
    title: "King's Gambit Declined",
    pgn: `[Event "King's Gambit Declined"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. f4 Bc5 3. Nf3 d6 4. Nc3 Nf6 5. Bc4 Nc6 6. d3 a6 7. fxe5 dxe5 8. Bg5 Be7 9. O-O h6 10. Bxf6 Bxf6 11. Nd5 Be7 *
`,
    lessonContext:
      "King's Gambit Declined (2...Bc5). Black sidesteps the gambit entirely by developing the king's bishop — and CRUCIALLY, the bishop on c5 means White can NO LONGER castle kingside without losing the f-pawn (the bishop attacks f2). The line shown ends in an equal middlegame with both sides developed. Plans: Black declines material and equalizes via the c5-bishop's positional threat; White plays for the e-file pressure after the e5 trade. Teaching point: 2...Bc5 is the most positional anti-King's-Gambit — Black says \"I don't want your pawn, I want your castling.\"",
    summary:
      "Decline the gambit, lock down White's castling. Pure positional response.",
    hook: 'Decline the pawn, prevent castling.',
    durationTargetSec: 65,
  },
];
