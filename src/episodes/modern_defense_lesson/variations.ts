import type { VariationShort } from '../types';

export const MODERN_DEFENSE_VARIATIONS: VariationShort[] = [
  {
    id: 'modern_hippopotamus',
    title: 'Modern: Hippopotamus Setup',
    pgn: `[Event "Modern — Hippopotamus"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 g6 2. d4 Bg7 3. Nc3 b6 4. Nf3 Bb7 5. Bd3 e6 6. O-O Ne7 7. Re1 d6 8. Bg5 h6 9. Bf4 Nd7 10. h3 a6 11. Qd2 c5 *
`,
    lessonContext:
      "Hippopotamus Setup. Black plays a 'crouch' setup — fianchettoes BOTH bishops (...Bg7 + ...Bb7), develops knights to slow squares (...Ne7 + ...Nd7), and lets White build whatever center they want. Plans: Black waits like a hippo at a watering hole, then strikes with ...c5 or ...e5 break when White overcommits. Teaching point: the Hippo is unbeatable at amateur level — Black makes no weaknesses, gives White nothing to attack.",
    summary: "The crouch. Both bishops fianchettoed, both knights slow. Wait for White to overcommit.",
    hook: "The opening for players who refuse to engage.",
    durationTargetSec: 75,
  },
  {
    id: 'modern_classical_pirc',
    title: 'Modern: Classical Pirc Transposition',
    pgn: `[Event "Modern — Classical Pirc"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7 5. Be2 O-O 6. O-O c6 7. h3 Nbd7 8. a4 e5 9. dxe5 dxe5 10. Be3 Qc7 11. Qd2 b6 *
`,
    lessonContext:
      "Classical Pirc transposition. Black plays the Pirc move order (...d6 + ...Nf6 + ...g6 + ...Bg7) — same setup as the Modern but committing the d-pawn earlier. The line shown ends in a classical Pirc structure with central pawn trades. Plans: Black plays for ...e5 break and slow positional pressure. Teaching point: the Pirc is the Modern with d-pawn played before g6 — it's the SAME OPENING with a tighter move order.",
    summary: "The Modern's cousin — Pirc move order (Nf6 first). Same setup, tighter sequence.",
    hook: "When you play d6+Nf6 before g6.",
    durationTargetSec: 70,
  },
  {
    id: 'modern_austrian_attack',
    title: 'Modern: vs Austrian Attack (4.f4)',
    pgn: `[Event "Modern — vs Austrian Attack"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. f4 Nf6 5. Nf3 O-O 6. Bd3 Nc6 7. O-O e5 8. dxe5 dxe5 9. f5 Nd4 10. Nxd4 exd4 11. Ne2 c5 *
`,
    lessonContext:
      "Austrian Attack (4.f4) — White's most aggressive anti-Modern. White builds the strongest possible kingside pawn shield with f4 + e4 + d4 + Bd3, then attacks. Black counters with ...Nc6 + ...e5 (the Tartakower break) opening the position before the attack lands. Plans: White attacks kingside; Black breaks center early and aims for queen exchanges. Teaching point: the Austrian Attack is the line White picks when they want to PUNISH the Modern's slow play — Black must respond actively or get crushed.",
    summary: "White's most aggressive anti-Modern. f4 + e4 + d4 + Bd3 = mating attack.",
    hook: "When White comes out swinging.",
    durationTargetSec: 75,
  },
  {
    id: 'modern_averbakh_vs_modern',
    title: 'Modern: vs Averbakh System',
    pgn: `[Event "Modern — vs Averbakh"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 g6 2. d4 Bg7 3. c4 d6 4. Nc3 Nf6 5. Be2 O-O 6. Bg5 c5 7. d5 e6 8. Qd2 exd5 9. exd5 Re8 10. Nf3 Bg4 11. O-O Nbd7 *
`,
    lessonContext:
      "Averbakh-style System (3.c4 + 6.Bg5). White claims maximum central space with c4 + d4 + e4 and pins the f6 knight with Bg5. Black plays the typical Benoni-like ...c5 + ...e6 break to challenge the center. Plans: White uses the bishop pair and central space; Black plays for ...Bg4 pinning the knight + active piece play. Teaching point: the Averbakh-style is the most positionally ambitious anti-Modern — denies Black the queenside expansion and forces Black into Benoni territory.",
    summary: "When White plays c4 + Bg5. Pure positional anti-Modern.",
    hook: "Maximum central space.",
    durationTargetSec: 70,
  },
];
