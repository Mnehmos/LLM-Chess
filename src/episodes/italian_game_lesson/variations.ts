import type { VariationShort } from '../types';

/**
 * Line-variation Shorts that accompany the long-form Italian Game lesson.
 *
 * Each variation:
 *   - Has its own self-contained PGN demonstrating ONE idea
 *   - Carries its own teacher-voice lessonContext so the commentator
 *     knows WHICH variation it's explaining (not just "the Italian Game")
 *   - Targets 60–90s of portrait-format video
 *
 * The long-form lesson's "futures" segment names these four lines and
 * teases the Shorts; viewers who want a specific variation tap through
 * to the corresponding Short.
 */
export const ITALIAN_GAME_VARIATIONS: VariationShort[] = [
  {
    id: 'italian_two_knights_defense',
    title: 'Italian Game: Two Knights Defense',
    pgn: `[Event "Italian Game — Two Knights Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Be2 h6 9. Nf3 e4 10. Ne5 Bd6 *
`,
    lessonContext:
      "Two Knights Defense (3...Nf6). Black skips the symmetric 3...Bc5 and offers White the sharp 4.Ng5 attack on f7. The line shown is the main Berlin/Polerio defense (5...Na5) where Black gives up a pawn for active piece play and a powerful pawn duo on e-file. The point is to demonstrate that 3...Nf6 commits Black to tactical, not positional, chess. Highlight: 4.Ng5 is the only critical try; if White avoids it, Black equalizes with normal development.",
    summary:
      'The sharp alternative to the Giuoco Piano. Black plays 3...Nf6 and dares White to launch the 4.Ng5 attack — a 168-year-old theoretical battlefield.',
    hook: 'What if Black skips 3...Bc5?',
    durationTargetSec: 80,
  },
  {
    id: 'italian_evans_gambit',
    title: 'Italian Game: Evans Gambit',
    pgn: `[Event "Italian Game — Evans Gambit"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d6 8. cxd4 Bb6 9. Nc3 Na5 10. Bg5 f6 11. Bf4 Ne7 *
`,
    lessonContext:
      "Evans Gambit (4.b4!?). White sacrifices a wing pawn to seize the center with c3 + d4 and develop pieces faster than the Giuoco Pianissimo allows. Show how Black's accepted bishop is harried (5.c3 Ba5 6.d4) until White has built a classical pawn center and active queenside development. The teaching point: in pre-engine chess this was the main line of the Italian for 200 years because the initiative is worth a pawn — modern engines say Black is fine, but only with precise defense.",
    summary:
      "White sacrifices a pawn for fast development. Champion of the romantic era — 200 years of main-line Italian.",
    hook: "Why give up a pawn on move 4?",
    durationTargetSec: 75,
  },
  {
    id: 'italian_moller_attack',
    title: 'Italian Game: Möller Attack',
    pgn: `[Event "Italian Game — Möller Attack"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 *
`,
    lessonContext:
      "Möller Attack — the d4 break instead of the modern quiet d3. After 5.d4 exd4 6.cxd4 Bb4+, White accepts an isolated d-pawn and sacrifices a pawn (8.O-O Bxc3 9.d5!) for a long-lasting attack on the kingside. Contrast directly with the quiet 5.d3 d6 system from the long-form lesson — same opening, completely different character. Teaching point: when to play d3 vs. d4 is the single most important choice in the Italian Game.",
    summary:
      'The aggressive d4 break — same opening as the long-form lesson, totally different character. White trades a pawn for attack.',
    hook: 'What if White plays d4 instead of d3?',
    durationTargetSec: 80,
  },
  {
    id: 'italian_hungarian_defense',
    title: 'Italian Game: Hungarian Defense',
    pgn: `[Event "Italian Game — Hungarian Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Be7 4. d4 exd4 5. Nxd4 d6 6. Nc3 Nf6 7. O-O O-O 8. h3 a6 9. Re1 Re8 10. Bf4 Bd7 *
`,
    lessonContext:
      "Hungarian Defense (3...Be7). Black sidesteps the Italian entirely — no challenge to White's bishop on c4, no fight for the center. The point is to demonstrate the most solid (and most passive) reply to 3.Bc4: Black settles for a slightly worse but very hard-to-crack position. Compare to 3...Bc5 (Giuoco) and 3...Nf6 (Two Knights). Teaching point: this is the line you reach for when you want to neutralize without theory — Black accepts a small disadvantage in exchange for a position with no traps.",
    summary:
      'The boring-but-solid reply. Black declines to fight for the center and aims for a position with no traps and no theory.',
    hook: 'How to neutralize the Italian without memorizing theory.',
    durationTargetSec: 70,
  },
];
