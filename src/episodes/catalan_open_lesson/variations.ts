import type { VariationShort } from '../types';

export const CATALAN_VARIATIONS: VariationShort[] = [
  {
    id: 'catalan_closed',
    title: 'Catalan: Closed Defense',
    pgn: `[Event "Catalan — Closed Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O 6. O-O c6 7. Qc2 Nbd7 8. Nbd2 b6 9. e4 Bb7 10. e5 Ne8 11. cxd5 cxd5 *
`,
    lessonContext:
      "Closed Catalan (4...Be7). Black DECLINES the c4 pawn and goes for a solid, cramped structure with ...c6 supporting d5. The line shown is the classical Closed Catalan with ...b6/...Bb7 fianchetto. Plans: White uses the bishop pair and space; Black plays for the ...c5 break (which usually doesn't fire in time) and slow piece play. Teaching point: the Closed Catalan is the safest anti-Catalan choice but cedes a small permanent edge — Karpov and Kramnik both grind these positions until move 60.",
    summary:
      "Decline the pawn. Get a cramped but solid structure. Karpov-style grind.",
    hook: "The Catalan WITHOUT taking the pawn.",
    durationTargetSec: 70,
  },
  {
    id: 'catalan_anti_bb4_check',
    title: 'Catalan: Anti-Catalan with ...Bb4+',
    pgn: `[Event "Catalan — Anti-Catalan ...Bb4+"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. g3 Bb4+ 4. Bd2 Be7 5. Bg2 d5 6. Nf3 O-O 7. O-O c6 8. Qc2 Nbd7 9. Rd1 b6 10. Bf4 Ba6 11. Nbd2 Rc8 *
`,
    lessonContext:
      "Anti-Catalan with ...Bb4+ (3...Bb4+). Black checks immediately on move 3 to force White to block with Bd2 (the only safe block — Nbd2 walks into pin tricks). After 4.Bd2 Be7 Black has effectively forced White to spend a tempo on Bd2 that doesn't go to Bf4 or Bg5. Plans: same general Catalan ideas (Bg2 pressure, queen-pawn play) but with Black having gained tempo on the dark-squared bishop. Teaching point: the ...Bb4+ trick is the modern \"play against the Catalan without learning the Catalan\" weapon — popularized in the 2010s by Carlsen and Caruana.",
    summary:
      "Check on move 3. Force White's bishop to d2 and steal a tempo.",
    hook: "Force White's bishop to a bad square.",
    durationTargetSec: 70,
  },
  {
    id: 'catalan_alekhine_5_qa4',
    title: 'Catalan: Alekhine 5.Qa4+',
    pgn: `[Event "Catalan — Alekhine 5.Qa4+"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4 5. Qa4+ Nbd7 6. Qxc4 a6 7. Qd3 c5 8. dxc5 Bxc5 9. Nf3 O-O 10. O-O b6 11. Nc3 Bb7 *
`,
    lessonContext:
      "Alekhine 5.Qa4+ (recovering the pawn immediately). White's most direct way to recover the c4 pawn — check on move 5 hits Black's knight or king, forcing ...Nbd7 to block. Plans: White recovers the pawn cleanly and gets a quiet positional game; Black plays for the ...c5 break and active piece play. Teaching point: 5.Qa4+ is the line for White players who want the Catalan structure WITHOUT the long pawn-recovery dance — direct, principled, slightly more equal than the main line.",
    summary:
      'Recover the pawn immediately with check. No long pawn-recovery dance.',
    hook: 'The fast pawn recovery.',
    durationTargetSec: 65,
  },
  {
    id: 'catalan_main_5_nf3',
    title: 'Catalan: Main Line with ...Be7',
    pgn: `[Event "Catalan — Main Line"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4 5. Nf3 Be7 6. O-O O-O 7. Qc2 a6 8. Qxc4 b5 9. Qc2 Bb7 10. Bd2 Be4 11. Qc1 Nbd7 *
`,
    lessonContext:
      "Catalan Main Line (5...Be7 ...a6 ...b5). The classical Open Catalan where Black grabs the pawn and tries to hold it with ...a6/...b5/...Bb7. White's plan is the famous \"queen dance\" Qc2-Qxc4-Qc2 to keep the queen flexible while building piece pressure on the long diagonal. The line shown ends in a typical Catalan structure where Black has the pawn but is slightly worse positionally. Teaching point: this IS the main line of the Open Catalan — the variation in the long-form lesson uses 5...a6 (no ...Be7), but this Be7-first move order is the most theoretical at the top level.",
    summary:
      "The classical Open Catalan main line — pawn grab, queen dance, slow squeeze.",
    hook: "Take the pawn and try to keep it.",
    durationTargetSec: 75,
  },
];
