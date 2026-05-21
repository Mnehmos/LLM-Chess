import type { VariationShort } from '../types';

export const ENGLISH_VARIATIONS: VariationShort[] = [
  {
    id: 'english_reversed_sicilian',
    title: 'English: Reversed Sicilian',
    pgn: `[Event "English — Reversed Sicilian"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 Bb4 5. Bg2 O-O 6. O-O Re8 7. d3 Bxc3 8. bxc3 d6 9. Rb1 h6 10. e3 Bf5 11. Nd2 Qd7 *
`,
    lessonContext:
      "Reversed Sicilian (1.c4 e5). Black plays a literal Sicilian with colors swapped — pushes e5 like White's e4 in the real Sicilian, putting White in the position of the Black side of a Najdorf. The line shown is the modern main with Nimzo-like ...Bb4 pinning the c3 knight. Plans: same as the Sicilian — White (playing 'Black's side') tries to break with d4; Black (playing 'White's side') tries to consolidate the center. Teaching point: this is the most popular response to the English at amateur level because Black just plays familiar 1.e4 e5 ideas — but with the tempo deficit, those ideas are actually harder to execute.",
    summary:
      "Black plays a literal Sicilian with colors swapped. The English's most popular response.",
    hook: "The Sicilian, but White is Black.",
    durationTargetSec: 75,
  },
  {
    id: 'english_kings_indian',
    title: "English: King's Indian Defense Setup",
    pgn: `[Event "English — KID Setup"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. c4 Nf6 2. Nc3 g6 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6 6. O-O e5 7. d3 Nc6 8. Rb1 a5 9. a3 h6 10. b4 axb4 11. axb4 Be6 *
`,
    lessonContext:
      "KID Setup vs the English. Black plays the King's Indian Defense structure (Nf6/g6/Bg7/d6/O-O) against the English, hoping White will commit to c4-d4 and transpose into a real KID. White's clever idea: KEEP the center pawn on d3 and play for queenside expansion with Rb1/a3/b4 instead — denying Black the central pawn-storm race that defines the real KID. Teaching point: this is how the English NEUTRALIZES the King's Indian — by refusing to play d4, White takes away Black's most dangerous middlegame plan.",
    summary:
      "The KID setup against 1.c4. White refuses to play d4 and locks down the queenside instead.",
    hook: "The King's Indian without the central pawnstorm.",
    durationTargetSec: 70,
  },
  {
    id: 'english_anti_kid_with_d4',
    title: 'English: Anti-Grünfeld with d4',
    pgn: `[Event "English — Anti-Grünfeld d4"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. c4 Nf6 2. Nc3 d5 3. cxd5 Nxd5 4. Nf3 g6 5. e4 Nxc3 6. bxc3 Bg7 7. d4 c5 8. Rb1 O-O 9. Be2 Nc6 10. d5 Ne5 11. Nxe5 Bxe5 *
`,
    lessonContext:
      "Anti-Grünfeld with d4 (1.c4 Nf6 2.Nc3 d5). Black plays a Grünfeld-style early ...d5 to challenge c4 immediately. After 3.cxd5 Nxd5, White doesn't play 4.g3 (allowing Grünfeld transposition) but instead 4.Nf3/e4 with the dxc3 doubled-pawn structure that DEFINES the modern English Anti-Grünfeld. Plans: White uses the central pawn pair and bishop pair to crush kingside; Black plays for queenside counterplay and active piece exchanges. Teaching point: this is the most theoretical English line — used by Carlsen vs Caruana 2018, considered the most dangerous anti-Grünfeld at the top level.",
    summary:
      "Stop the Grünfeld at move 3. The most theoretical line in the modern English.",
    hook: "The Carlsen vs Caruana 2018 weapon.",
    durationTargetSec: 80,
  },
  {
    id: 'english_botvinnik_system',
    title: 'English: Botvinnik System',
    pgn: `[Event "English — Botvinnik System"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. c4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. e4 e6 6. Nge2 Nge7 7. O-O O-O 8. d3 d6 9. Be3 Nd4 10. f4 Rb8 11. Rb1 b5 *
`,
    lessonContext:
      "Botvinnik System (4.Bg2 Bg7 5.e4!). White builds the famous 'Botvinnik pawn triangle' with c4/d3/e4, denying Black the standard ...d5 break and creating maximum central control with minimum commitment. The line shown is the modern Botvinnik with both knights on e2/c3 and a slow Be3+f4 expansion. Plans: White locks the center then breaks with f4-f5 kingside attack; Black plays for queenside expansion with ...b5/...Rb8. Teaching point: the Botvinnik System is the English at its most positional — the c4/d3/e4 triangle is one of the strongest pawn formations in chess (Botvinnik used it for decades).",
    summary:
      "Botvinnik's pawn triangle (c4/d3/e4). One of the strongest pawn formations in chess.",
    hook: "Botvinnik's positional masterpiece.",
    durationTargetSec: 80,
  },
];
