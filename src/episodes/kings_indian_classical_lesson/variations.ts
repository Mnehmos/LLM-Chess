import type { VariationShort } from '../types';

export const KINGS_INDIAN_VARIATIONS: VariationShort[] = [
  {
    id: 'kid_samisch',
    title: "King's Indian: Sämisch Variation",
    pgn: `[Event "King's Indian — Sämisch Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3 O-O 6. Be3 Nc6 7. Nge2 a6 8. Qd2 Rb8 9. Bh6 b5 10. Bxg7 Kxg7 11. h4 e5 *
`,
    lessonContext:
      "Sämisch Variation (5.f3). White plays f3 instead of Nf3 to build the strongest possible pawn center and prepare a kingside pawnstorm with g4-h4. The line shown is the modern Sämisch with Be3/Nge2/Qd2/Bh6 setup — White trades the dark-squared bishops to weaken Black's king. Plans: White pawnstorms with h4-h5; Black breaks with ...b5 on the queenside and counterattacks with ...e5. Teaching point: the Sämisch is the most violent anti-KID line — both sides pawnstorm, the slower attacker loses. Sometimes mate by move 25.",
    summary:
      'The pawnstorm war. White builds f3+g4+h4, Black breaks with ...b5+...e5. First mate wins.',
    hook: 'The most violent anti-KID line.',
    durationTargetSec: 80,
  },
  {
    id: 'kid_four_pawns',
    title: "King's Indian: Four Pawns Attack",
    pgn: `[Event "King's Indian — Four Pawns Attack"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4 O-O 6. Nf3 c5 7. d5 e6 8. Be2 exd5 9. cxd5 b5 10. Bxb5 Re8 11. e5 dxe5 *
`,
    lessonContext:
      "Four Pawns Attack (5.f4). White creates a massive pawn center with c4-d4-e4-f4 — four pawns abreast. The line shown is the modern Benoni-like response with 6...c5 7.d5 e6 8.Be2 exd5 — Black sacrifices a pawn to open the position before White's giant center mobilizes. Teaching point: the Four Pawns is the king attack White CAN'T quite execute — the four-pawn structure looks crushing but has too many holes for Black tactics. This is the line that REWARDS preparation more than any other KID line.",
    summary:
      'Four pawns abreast. Looks crushing — but has too many holes for Black tactics.',
    hook: 'When White brings every pawn forward.',
    durationTargetSec: 75,
  },
  {
    id: 'kid_fianchetto',
    title: "King's Indian: Fianchetto System",
    pgn: `[Event "King's Indian — Fianchetto System"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 g6 3. g3 Bg7 4. Bg2 O-O 5. Nf3 d6 6. O-O Nc6 7. Nc3 a6 8. d5 Na5 9. Nd2 c5 10. Qc2 Rb8 11. b3 b5 *
`,
    lessonContext:
      "Fianchetto System (3.g3). White mirrors Black's fianchetto and aims for a slow, positional game. No kingside pawnstorms; both bishops sit on g2/g7 covering the long diagonals. The line shown is the symmetric setup with d5 + queenside expansion. Plans: White uses the b-pawn and queenside pieces for slow positional pressure; Black plays for the ...b5 break and central pieces around the locked center. Teaching point: the Fianchetto is the KID for players who want positional chess without the wild pawnstorms — the trade is that Black's typical kingside attack is much harder to mount.",
    summary:
      'The positional anti-KID. White fianchettoes too. No pawnstorms — just slow maneuvering.',
    hook: "How to play the King's Indian without the wild pawnstorms.",
    durationTargetSec: 75,
  },
  {
    id: 'kid_averbakh',
    title: "King's Indian: Averbakh Variation",
    pgn: `[Event "King's Indian — Averbakh Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Be2 O-O 6. Bg5 c5 7. d5 e6 8. Qd2 exd5 9. exd5 Re8 10. Nf3 Bg4 11. O-O Nbd7 *
`,
    lessonContext:
      "Averbakh Variation (6.Bg5). White pins the f6 knight before Black can play ...e5. The pin restricts Black's central break and pushes Black toward Benoni-style play with ...c5. The line shown is the modern Averbakh with c5/d5/e6 — Black accepts a slightly worse Benoni structure to escape the pin. Plans: White uses the bishop pair and central space; Black plays for the ...b5 break and active piece play. Teaching point: the Averbakh is the line for White players who want to prevent the KID's signature ...e5 — instead of joining the pawnstorm race, restrict Black's structure.",
    summary:
      "Pin the knight before ...e5 happens. The Averbakh forces Black into Benoni-style play.",
    hook: 'No ...e5 allowed.',
    durationTargetSec: 75,
  },
];
