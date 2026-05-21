import type { VariationShort } from '../types';

export const VIENNA_VARIATIONS: VariationShort[] = [
  {
    id: 'vienna_falkbeer',
    title: 'Vienna: Falkbeer Variation',
    pgn: `[Event "Vienna — Falkbeer"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nc3 Nf6 3. Bc4 Nxe4 4. Qh5 Nd6 5. Bb3 Nc6 6. Nb5 g6 7. Qf3 f5 8. Qd5 Qe7 9. Nxc7+ Kd8 10. Nxa8 b6 11. d3 Bb7 *
`,
    lessonContext:
      "Falkbeer Variation (3.Bc4 Nxe4). The most spectacular Vienna line — Black grabs the e-pawn, White launches Qh5+ threatening mate on f7, and a chaos sequence ensues where White wins the a8 rook but gets the trapped knight stuck. The line shown is the modern Falkbeer where Black plays for compensation via active pieces and the bishop pair. Plans: White tries to extract the c7-trapped knight; Black uses the development lead to attack. Teaching point: this is the line Bobby Fischer used to win a famous game vs Reuben Fine — a textbook example of \"open lines and active pieces beat material in the romantic era.\"",
    summary:
      'The chaotic Vienna. White grabs a rook but gets a knight stuck. Bobby Fischer played this.',
    hook: 'Win the rook, lose the knight.',
    durationTargetSec: 80,
  },
  {
    id: 'vienna_quiet_3_bc4',
    title: 'Vienna: Quiet Variation with 3.Bc4',
    pgn: `[Event "Vienna — Quiet 3.Bc4"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nc3 Nf6 3. Bc4 Bc5 4. d3 d6 5. f4 Nc6 6. Nf3 Bg4 7. Na4 Bb6 8. Nxb6 axb6 9. h3 Bxf3 10. Qxf3 Nd4 11. Qd1 O-O *
`,
    lessonContext:
      "Quiet Variation (3.Bc4 Bc5). Both sides decline the immediate fight — White develops naturally with Bc4 + d3 + f4, Black mirrors with Bc5 + d6. The line shown is the modern Quiet Vienna with a slow Italian-style kingside attack setup. Plans: White uses the f-pawn lever (f4) for kingside space; Black plays for ...d5 break and bishop exchanges. Teaching point: this is the Vienna for players who want a slow positional game — the f4 push comes AFTER development, not before.",
    summary:
      "The Vienna without the gambit. Slow Italian-style buildup with f4 for later.",
    hook: "The Vienna's positional cousin.",
    durationTargetSec: 70,
  },
  {
    id: 'vienna_glek',
    title: 'Vienna: Glek Variation',
    pgn: `[Event "Vienna — Glek Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nc3 Nf6 3. g3 d5 4. exd5 Nxd5 5. Bg2 Nb6 6. Nf3 Nc6 7. O-O Be7 8. d3 O-O 9. Be3 Bf6 10. Qd2 Re8 11. Rae1 Be6 *
`,
    lessonContext:
      "Glek Variation (3.g3). White fianchettoes the king's bishop and plays for a slow positional game — Igor Glek's modern interpretation of the Vienna. The line shown is the open Glek with ...d5 break followed by symmetric piece play. Plans: White uses the long diagonal pressure of Bg2; Black mirrors the development and aims for ...Be6/...Re8 piling up on the central files. Teaching point: the Glek is the modern positional Vienna — used by Caruana to neutralize anti-Najdorf preparation in 2017.",
    summary:
      "The modern positional Vienna. Fianchetto + symmetric piece play.",
    hook: 'The Vienna for positional grinders.',
    durationTargetSec: 70,
  },
  {
    id: 'vienna_paulsen',
    title: 'Vienna: Paulsen Variation',
    pgn: `[Event "Vienna — Paulsen Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nc3 Nc6 3. g3 Bc5 4. Bg2 d6 5. Nge2 Nf6 6. d3 Bg4 7. f3 Be6 8. Nd5 Nd4 9. c3 Nxe2 10. Qxe2 c6 11. Nxf6+ Qxf6 *
`,
    lessonContext:
      "Paulsen Variation (3.g3). White fianchettoes the king's bishop and plays for a slow positional game — the Vienna's KIA-like setup. The line shown is the modern Paulsen with Nge2 + d3 + f3 setup, denying Black easy central breaks. Plans: White builds slowly and aims for c3-d4 in the long game; Black plays for ...d5 break and active piece play. Teaching point: the Paulsen is the line for White players who want a Vienna structure without the romantic tactics — pure positional chess from a 19th-century opening.",
    summary:
      "The Vienna fianchetto setup. Pure positional chess from a 19th-century opening.",
    hook: "The Vienna's KIA cousin.",
    durationTargetSec: 70,
  },
];
