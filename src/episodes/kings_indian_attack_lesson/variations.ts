import type { VariationShort } from '../types';

export const KIA_VARIATIONS: VariationShort[] = [
  {
    id: 'kia_vs_french',
    title: 'KIA: vs French Defense Setup',
    pgn: `[Event "KIA — vs French Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. Nf3 d5 2. g3 c5 3. Bg2 Nc6 4. O-O e6 5. d3 Nf6 6. Nbd2 Be7 7. e4 O-O 8. Re1 b6 9. e5 Nd7 10. Nf1 Bb7 11. h4 d4 *
`,
    lessonContext:
      "KIA vs French setup. Black plays the French-style ...e6/...d5 structure against the KIA. White responds with the standard KIA development and aims for the e4-e5 push closing the center. Plans: White attacks kingside; Black plays for ...d4 break (locking center) and queenside expansion. Teaching point: the KIA was Fischer's anti-French weapon — used to crush Petrosian in their candidates match.",
    summary: "The KIA against the French structure. Fischer's anti-French weapon.",
    hook: "Fischer's anti-French.",
    durationTargetSec: 70,
  },
  {
    id: 'kia_vs_sicilian',
    title: 'KIA: vs Sicilian Defense Setup',
    pgn: `[Event "KIA — vs Sicilian Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. Nf3 c5 2. g3 Nc6 3. Bg2 g6 4. O-O Bg7 5. d3 d6 6. e4 Nf6 7. Nbd2 O-O 8. Re1 e5 9. c3 b6 10. a3 a5 11. Nc4 Be6 *
`,
    lessonContext:
      "KIA vs Sicilian setup. Black plays the Dragon-style fianchetto against the KIA. White responds with the slow KIA buildup + Nc4 reroute. The line shown ends with both sides developed in a quiet positional game. Teaching point: the KIA can be played against any 1...c5 / 1...d5 / 1...e6 — it's a true system opening.",
    summary: "The KIA against the Sicilian Dragon structure. Slow positional play.",
    hook: "When Black plays Dragon-style vs the KIA.",
    durationTargetSec: 70,
  },
  {
    id: 'kia_vs_caro_kann',
    title: 'KIA: vs Caro-Kann Setup',
    pgn: `[Event "KIA — vs Caro-Kann Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. Nf3 c5 2. g3 d5 3. Bg2 Nc6 4. O-O e6 5. d3 Nf6 6. Nbd2 Be7 7. e4 d4 8. Nc4 O-O 9. a4 Qc7 10. h4 b6 11. h5 Bb7 *
`,
    lessonContext:
      "KIA vs Caro-Kann-style setup (...c5 + ...d5 mirror). After ...d4 closing the center, White routes the knight to c4 (attacking Black's queenside) and pushes h4-h5 for kingside space. Plans: White attacks kingside via h-pawn push; Black plays for ...b6 + ...Bb7 queenside development. Teaching point: when Black closes the center, the KIA's kingside attack becomes a SPACE GRAB rather than a mating attack — slower but harder to defend.",
    summary: "The KIA when Black closes the center. Kingside SPACE grab via h4-h5.",
    hook: "What if Black closes the center?",
    durationTargetSec: 70,
  },
  {
    id: 'kia_qgd_setup',
    title: "KIA: vs QGD-style Setup",
    pgn: `[Event "KIA — vs QGD Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. Nf3 d5 2. g3 Nf6 3. Bg2 e6 4. O-O Be7 5. d3 O-O 6. Nbd2 c6 7. e4 dxe4 8. dxe4 e5 9. Qe2 Re8 10. Nc4 Nbd7 11. Bg5 h6 *
`,
    lessonContext:
      "KIA vs QGD-style ...c6 setup. Black supports d5 with c6 (Slav-style) instead of c5. After ...dxe4 dxe4 the position opens and White's standard plans are interrupted. Plans: White plays for Nc4 + Bg5 pinning, Black equalizes with central piece activity. Teaching point: the QGD setup is the most theoretically respected anti-KIA — Black gets full equality if they know the moves.",
    summary: "The KIA against a QGD-style setup. The most theoretically respected anti-KIA.",
    hook: "When Black plays the QGD style.",
    durationTargetSec: 70,
  },
];
