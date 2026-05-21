import type { VariationShort } from '../types';

export const QGD_ORTHODOX_VARIATIONS: VariationShort[] = [
  {
    id: 'qgd_slav_defense',
    title: "Queen's Gambit: Slav Defense",
    pgn: `[Event "QGD — Slav Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 Bg6 10. e4 O-O 11. Bd3 Bxc3 *
`,
    lessonContext:
      "Slav Defense (2...c6). Instead of locking in the light-squared bishop with ...e6, Black supports d5 with the c-pawn. This keeps Black's bishop free to develop to f5 or g4. The line shown is the Main Line Slav with 4...dxc4 5.a4 Bf5 — Black grabs the pawn but White recovers it with a4 stopping ...b5. Plans: Black develops actively (Bf5, Nbd7, e6 only later); White builds with e3/Bxc4 and looks for e4 break. Teaching point: the Slav is the only line where Black can develop the c8-bishop OUTSIDE the pawn chain — which is why it's so popular.",
    summary:
      "Support d5 with c6 instead of e6. Solves the French / QGD bad-bishop problem.",
    hook: "Why support d5 with c6 instead of e6?",
    durationTargetSec: 80,
  },
  {
    id: 'qgd_semi_slav',
    title: "Queen's Gambit: Semi-Slav Defense",
    pgn: `[Event "QGD — Semi-Slav Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. c4 c6 3. Nc3 Nf6 4. Nf3 e6 5. Bg5 h6 6. Bh4 dxc4 7. e4 g5 8. Bg3 b5 9. Be2 Bb7 10. h4 g4 11. Ne5 h5 *
`,
    lessonContext:
      "Semi-Slav (2...c6 then ...e6). Black plays BOTH c6 and e6, locking in the bishop AND supporting d5 from two squares. The line shown is the sharp Botvinnik System (or Anti-Meran) where Black grabs the c-pawn AND pushes ...g5 to harass the bishop. Plans: Black creates a strong queenside pawn chain with ...b5-b4 and counterattacks with ...c5; White breaks open the center with e4 and attacks the wandering king. Teaching point: the Semi-Slav is the most theoretical 1.d4 defense — the Botvinnik Variation is the equal of any Najdorf line in complexity.",
    summary:
      "The most theoretical 1.d4 defense. Both sides commit, both sides attack — pawn grabs and counter-attacks.",
    hook: "Both c6 AND e6 — and a Najdorf-level theory dump.",
    durationTargetSec: 85,
  },
  {
    id: 'qgd_cambridge_springs',
    title: "Queen's Gambit Declined: Cambridge Springs",
    pgn: `[Event "QGD — Cambridge Springs"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. e3 c6 6. Nf3 Qa5 7. Nd2 Bb4 8. Qc2 O-O 9. Be2 e5 10. O-O exd4 11. exd4 dxc4 *
`,
    lessonContext:
      "Cambridge Springs Defense (5...c6 6.Nf3 Qa5). An ingenious tactical idea — Black brings the queen out to a5 to hit BOTH the c3 knight AND the g5 bishop simultaneously, exploiting the pinned-piece geometry. The threat is ...Ne4 winning material if White is careless. Plans: White typically responds with Nd2 (unpinning) or cxd5 (releasing the central tension); Black plays for ...Bb4 and ...Ne4 with active piece play. Teaching point: the Cambridge Springs is the line for players who want the QGD structure but with a built-in tactical idea — and it's strong, scoring well at the top level.",
    summary:
      "The QGD with a built-in tactic. Black's queen-out-to-a5 hits two pieces and threatens immediate problems.",
    hook: "The QGD with a tactic baked into move 6.",
    durationTargetSec: 80,
  },
  {
    id: 'qgd_tartakower',
    title: "Queen's Gambit Declined: Tartakower Defense",
    pgn: `[Event "QGD — Tartakower Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 h6 6. Bh4 O-O 7. Nf3 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 *
`,
    lessonContext:
      "Tartakower Defense (5...h6 6.Bh4 b6). Black breaks the pin with ...h6, gets a tempo by chasing the bishop, then fianchettoes the c8-bishop with ...b6. This solves the QGD's perpetual problem (the locked-in c8-bishop) at the cost of a slightly cramped position. The line shown ends in a typical Carlsbad-like structure after exchanges on d5. Plans: White looks for the minority attack with b4-b5; Black uses the bishop pair and aims for ...c5 or ...e5 breaks. Teaching point: the Tartakower was Karpov's favorite — it's the QGD for players who want active piece play, not the cramped Orthodox.",
    summary:
      "Karpov's favorite QGD. Solves the bad-bishop problem with ...b6 and a fianchetto.",
    hook: "How Karpov solved the QGD's worst piece.",
    durationTargetSec: 75,
  },
];
