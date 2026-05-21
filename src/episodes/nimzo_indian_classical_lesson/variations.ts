import type { VariationShort } from '../types';

export const NIMZO_INDIAN_VARIATIONS: VariationShort[] = [
  {
    id: 'nimzo_rubinstein',
    title: 'Nimzo-Indian: Rubinstein Variation',
    pgn: `[Event "Nimzo-Indian — Rubinstein"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O Nc6 8. a3 Bxc3 9. bxc3 dxc4 10. Bxc4 Qc7 11. Re1 e5 *
`,
    lessonContext:
      "Rubinstein Variation (4.e3). White's most popular and modern response — simple development, fight for the center, accept the doubled pawns later. The line shown is the classical Capablanca-like setup with ...d5/...c5 central play. Plans: White uses the bishop pair after Bxc3 and aims for an IQP attack or queenside pressure on the doubled c-pawns; Black exchanges and equalizes with active piece play. Teaching point: the Rubinstein is the most flexible anti-Nimzo — Black has many setups and White has many plans, making it the most theoretically interesting Nimzo line in modern chess.",
    summary:
      'The Nimzo without theatrics. Simple development, modern positional play.',
    hook: 'The most flexible Nimzo line.',
    durationTargetSec: 75,
  },
  {
    id: 'nimzo_kasparov',
    title: 'Nimzo-Indian: Kasparov Variation',
    pgn: `[Event "Nimzo-Indian — Kasparov Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Nf3 c5 5. g3 cxd4 6. Nxd4 O-O 7. Bg2 d5 8. cxd5 Nxd5 9. Qb3 Nxc3 10. bxc3 Be7 11. O-O Nc6 *
`,
    lessonContext:
      "Kasparov Variation (4.Nf3). White ignores the pin and develops naturally — the philosophy being that the bishop on b4 doesn't really threaten anything immediate. The line shown is the classical 4.Nf3 c5 5.g3 (the Kasparov system with kingside fianchetto). Plans: White uses the long diagonal pressure of Bg2; Black plays for ...d5 break and central exchanges. Teaching point: Kasparov used this exact line as his anti-Nimzo weapon during his championship reign — the philosophy is that the bishop pair isn't worth panicking about; just develop.",
    summary:
      "Kasparov's anti-Nimzo. Just develop — the bishop pair isn't worth the panic.",
    hook: "Kasparov's answer to the Nimzo.",
    durationTargetSec: 75,
  },
  {
    id: 'nimzo_samisch',
    title: 'Nimzo-Indian: Sämisch Variation',
    pgn: `[Event "Nimzo-Indian — Sämisch Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. a3 Bxc3+ 5. bxc3 O-O 6. e3 c5 7. Bd3 Nc6 8. Ne2 b6 9. e4 Ne8 10. O-O Ba6 11. f4 Bxc4 *
`,
    lessonContext:
      "Sämisch Variation (4.a3). White IMMEDIATELY forces the bishop trade, accepting the doubled c-pawns to get the bishop pair and the half-open b-file. The line shown is the modern Sämisch with the typical Black setup of ...c5/...b6/...Ba6 fighting for the c4 pawn. Plans: White uses the bishop pair and aims for e4/f4 kingside attack; Black plays for the ...c5/...d5 break and exploits the doubled c-pawns. Teaching point: the Sämisch is the most aggressive anti-Nimzo — White says \"yes, doubled pawns, but I get TWO bishops and the center, and I'm coming for your king.\"",
    summary:
      "Take the bishop, get the pair, attack the king. The most aggressive anti-Nimzo.",
    hook: "Doubled pawns are fine — bishop pair pays for them.",
    durationTargetSec: 80,
  },
  {
    id: 'nimzo_leningrad',
    title: 'Nimzo-Indian: Leningrad Variation',
    pgn: `[Event "Nimzo-Indian — Leningrad Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Bg5 h6 5. Bh4 c5 6. d5 d6 7. e3 Bxc3+ 8. bxc3 e5 9. f3 Qe7 10. Bd3 Nbd7 11. Ne2 Nf8 *
`,
    lessonContext:
      "Leningrad Variation (4.Bg5). White pins the f6 knight with the bishop, the kingside equivalent of the QGD Bg5. The line shown ends in a typical Leningrad structure: White has the bishop pair and central space; Black has a Benoni-like pawn chain and active piece play. Plans: White attacks on the kingside with f3-e4 break; Black plays for the ...e5 (then closed center) and queenside expansion with ...b5. Teaching point: the Leningrad is the most theoretical anti-Nimzo at the top level — Spassky and Tal both used it for crucial wins.",
    summary:
      'Pin the f6 knight from g5. The most theoretical Nimzo line at world-championship level.',
    hook: 'When White brings the bishop out aggressively.',
    durationTargetSec: 75,
  },
];
