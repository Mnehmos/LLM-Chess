import type { VariationShort } from '../types';

export const STONEWALL_VARIATIONS: VariationShort[] = [
  {
    id: 'stonewall_modern',
    title: 'Stonewall: Modern with g4 push',
    pgn: `[Event "Stonewall — Modern with g4"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. e3 Nf6 3. Bd3 c5 4. c3 Nc6 5. f4 e6 6. Nd2 Be7 7. Ngf3 O-O 8. O-O Bd7 9. Ne5 Rc8 10. g4 Ne8 11. g5 f6 *
`,
    lessonContext:
      "Modern Stonewall with g4 push. After the standard Ne5 setup, White launches g4-g5 instead of the traditional Bd3 + Qh4 plan. The pawnstorm cracks open the kingside and threatens g6/Nxh7 ideas. Teaching point: this is the Stonewall played AGGRESSIVELY — same skeleton, much sharper attack.",
    summary: "The Stonewall with a pawnstorm. White pushes g4-g5 instead of the slow attack.",
    hook: "Stonewall with the brakes off.",
    durationTargetSec: 75,
  },
  {
    id: 'stonewall_bird_transposition',
    title: "Stonewall: Bird's Opening Transposition",
    pgn: `[Event "Stonewall — Bird's Opening"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. f4 d5 2. Nf3 Nf6 3. e3 g6 4. b3 Bg7 5. Bb2 O-O 6. Be2 c5 7. O-O Nc6 8. Ne5 Bd7 9. Qe1 Rc8 10. Bf3 e6 11. Qh4 Nxe5 *
`,
    lessonContext:
      "Bird's Opening (1.f4) transposing into Stonewall ideas. White plays the From's Gambit-style 1.f4 first, then builds a Stonewall structure with the fianchetto on b2 instead of the standard Bd3 setup. Teaching point: same attacking ideas, different bishop placement. The Bb2/Bf3 bishops aim at the long diagonal AND the kingside.",
    summary: "The Stonewall via Bird's Opening — start with 1.f4 instead of 1.d4.",
    hook: "1.f4 — Bird's Opening into Stonewall structure.",
    durationTargetSec: 70,
  },
  {
    id: 'stonewall_anti_with_bf5',
    title: 'Stonewall: vs ...Bf5 anti-Stonewall',
    pgn: `[Event "Stonewall — vs ...Bf5"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. e3 Nf6 3. Bd3 c5 4. c3 Nc6 5. f4 g6 6. Nf3 Bg7 7. Nbd2 O-O 8. O-O Bf5 9. Bxf5 gxf5 10. Ne5 Nxe5 11. fxe5 Nd7 *
`,
    lessonContext:
      "Anti-Stonewall with ...Bf5 (Capablanca's recipe). Black develops the light-squared bishop OUTSIDE the pawn chain to neutralize White's Bd3 attack. After 9.Bxf5 gxf5, Black accepts wrecked kingside pawns but kills White's kingside attacking ideas. Teaching point: trading the attacking bishop is the principled anti-Stonewall plan — give up your light-squared bishop to take White's.",
    summary: "Trade off White's attacking bishop. The principled anti-Stonewall.",
    hook: "Kill the attack by trading bishops.",
    durationTargetSec: 70,
  },
  {
    id: 'stonewall_tartakower',
    title: 'Stonewall: Tartakower Defense',
    pgn: `[Event "Stonewall — Tartakower Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. e3 Nf6 3. Bd3 c5 4. c3 Nc6 5. f4 cxd4 6. exd4 Bg4 7. Nf3 e6 8. O-O Be7 9. Nbd2 O-O 10. h3 Bxf3 11. Qxf3 Rc8 *
`,
    lessonContext:
      "Tartakower's anti-Stonewall (5...cxd4 6.exd4 Bg4). Black trades on d4 to release central tension early, then develops the bishop to g4 to pin the f3 knight (preventing the Ne5 attack idea). After ...Bxf3 White recovers the pawn but the kingside attack is mostly neutralized. Teaching point: trade early in the center to break the Stonewall's typical pawn structure.",
    summary: "Trade in the center early. Breaks the Stonewall before White can build the attack.",
    hook: "Trade in the center, neutralize the attack.",
    durationTargetSec: 70,
  },
];
