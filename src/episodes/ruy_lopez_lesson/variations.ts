import type { VariationShort } from '../types';

export const RUY_LOPEZ_VARIATIONS: VariationShort[] = [
  {
    id: 'ruy_lopez_berlin_defense',
    title: 'Ruy Lopez: Berlin Defense',
    pgn: `[Event "Ruy Lopez — Berlin Defense"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. Nc3 Ke8 10. h3 h6 11. Rd1 Bd7 *
`,
    lessonContext:
      "Berlin Defense (3...Nf6). Black skips the symmetric a6 and challenges e4 immediately. The line shown is the Berlin Wall endgame after 4.O-O Nxe4 5.d4 Nd6 6.Bxc6 dxc6 7.dxe5 Nf5 8.Qxd8+ Kxd8 — Kramnik famously used this against Kasparov in 2000 to neutralize the world champion's white. The point: Black trades queens early and accepts a long-term structural concession (doubled c-pawns, king on d8) in exchange for a position with very little dynamic risk. Teaching point: if you can play the Berlin endgame well, you have a complete defense to 1.e4.",
    summary:
      "The endgame defense that neutralized Kasparov. Black trades queens early and walks into a structurally weird but very solid Wall position.",
    hook: "How do you beat 1.e4 without theory?",
    durationTargetSec: 80,
  },
  {
    id: 'ruy_lopez_exchange_variation',
    title: 'Ruy Lopez: Exchange Variation',
    pgn: `[Event "Ruy Lopez — Exchange Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 6. d4 exd4 7. Nxd4 c5 8. Nb3 Qxd1 9. Rxd1 Bd7 10. Nc3 O-O-O *
`,
    lessonContext:
      "Exchange Variation (4.Bxc6). Instead of retreating, White takes the knight and accepts doubling Black's pawns. Black recaptures with dxc6 to keep the d-file open. The line transitions quickly into an endgame where White's structural edge (4 vs 3 pawn majority on the kingside) is balanced against Black's bishop pair and slightly better piece activity. Teaching point: trading pieces does NOT mean ducking the fight — White is playing for a long, slow technical endgame win, the kind that won Fischer many games with 4.Bxc6.",
    summary:
      'Trade now, win later. White takes the knight, doubles Black\'s pawns, and aims for a long endgame grind.',
    hook: 'Why would you trade your prized Spanish bishop on move 4?',
    durationTargetSec: 75,
  },
  {
    id: 'ruy_lopez_open_spanish',
    title: 'Ruy Lopez: Open Spanish',
    pgn: `[Event "Ruy Lopez — Open Spanish"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4 6. d4 b5 7. Bb3 d5 8. dxe5 Be6 9. c3 Bc5 10. Nbd2 O-O 11. Bc2 f5 *
`,
    lessonContext:
      "Open Spanish (5...Nxe4). Black grabs the e-pawn and accepts a sharper, more dynamic position than the Closed Spanish allows. The key tabiya appears after 6.d4 b5 7.Bb3 d5 — Black builds a big pawn center while White prepares to fight for it. The Bb3-c2 maneuver targets Black's kingside, while Black's c2-c5 break and f7-f5 push generate counterplay. Teaching point: in the Open Spanish both sides commit early — this is NOT a positional opening, it's a race to mobilize the bigger pawn center.",
    summary:
      'Grab the pawn, build the center, and brace for a fight. The Open Spanish is the sharper alternative to the Closed Defense.',
    hook: 'What if Black just takes the e-pawn?',
    durationTargetSec: 80,
  },
  {
    id: 'ruy_lopez_marshall_attack',
    title: 'Ruy Lopez: Marshall Attack',
    pgn: `[Event "Ruy Lopez — Marshall Attack"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. c3 d5 9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 c6 *
`,
    lessonContext:
      "Marshall Attack (8...d5). Black sacrifices a central pawn for a long-lasting kingside attack. After 8.c3 (preparing d4) Black plays d5! immediately, opening lines before White can solidify. The sacrificed pawn buys Black active piece play, an open d-file, and threats against White's king. Teaching point: the Marshall is the gambit that's worth all the theory — even at the world-championship level, most top players avoid this with the anti-Marshall 8.a4 or 8.h3 rather than testing the main line. It's a complete attacking weapon vs the Closed Spanish.",
    summary:
      'Sacrifice a pawn for a long-lasting attack. Most elite Whites duck this with 8.h3 rather than test the main line.',
    hook: 'A pawn sacrifice so strong, top players refuse to enter it.',
    durationTargetSec: 85,
  },
];
