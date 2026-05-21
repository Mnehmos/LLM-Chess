import type { VariationShort } from '../types';

export const FRENCH_WINAWER_VARIATIONS: VariationShort[] = [
  {
    id: 'french_classical',
    title: 'French Defense: Classical Variation',
    pgn: `[Event "French — Classical Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. Bg5 Be7 5. e5 Nfd7 6. Bxe7 Qxe7 7. f4 a6 8. Nf3 c5 9. dxc5 Qxc5 10. Qd2 Nc6 11. O-O-O b5 *
`,
    lessonContext:
      "French Classical (3...Nf6). Instead of the Winawer pin, Black develops the knight to f6 and accepts a position with less structural drama but more typical piece play. The line shown is the Steinitz Variation with 4.Bg5 — the knight is pinned and forced to retreat after 5.e5. Plans: White attacks on the kingside, Black breaks with ...c5 and plays for queenside expansion. Teaching point: the Classical is the French line for players who want the French structure without the Winawer's strange-looking doubled c-pawns.",
    summary:
      "The French without the Winawer pin. Solid, structural, easier to learn than the main Winawer line.",
    hook: "The French Defense, but without the weird doubled pawns.",
    durationTargetSec: 75,
  },
  {
    id: 'french_tarrasch',
    title: 'French Defense: Tarrasch Variation',
    pgn: `[Event "French — Tarrasch Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e6 2. d4 d5 3. Nd2 Nf6 4. e5 Nfd7 5. Bd3 c5 6. c3 Nc6 7. Ne2 cxd4 8. cxd4 f6 9. exf6 Nxf6 10. Nf3 Bd6 11. O-O O-O *
`,
    lessonContext:
      "French Tarrasch (3.Nd2). White sidesteps the Winawer pin by developing the knight to d2 instead of c3. The line shown is the closed Tarrasch with 3...Nf6 and the typical 4.e5 advance. Plans: White builds on the kingside with Nf3, Bd3, O-O; Black breaks with ...c5 and ...f6 to challenge the e5 pawn. Teaching point: Karpov made the Tarrasch his main weapon against the French — it's the line for White players who want a positional, low-theory anti-French.",
    summary:
      "White's clever workaround. 3.Nd2 sidesteps the Winawer pin and steers toward calm positional play.",
    hook: "How White avoids the entire Winawer mess.",
    durationTargetSec: 75,
  },
  {
    id: 'french_advance',
    title: 'French Defense: Advance Variation',
    pgn: `[Event "French — Advance Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 Nh6 7. b4 cxd4 8. cxd4 Nf5 9. Bb2 Be7 10. Bd3 O-O 11. O-O f6 *
`,
    lessonContext:
      "French Advance (3.e5). White locks the center immediately and gains space on move 3. The line shown is the modern main with 5...Qb6 hitting d4 and b2. Plans: White consolidates the chain with c3, a3, b4 and looks to attack with Bd3 + O-O; Black breaks with ...Nh6-f5 (rerouting the knight via h6 because f6 is unavailable), ...f6 to challenge the pawn chain, or queenside pressure with ...Qb6 and ...c4. Teaching point: the Advance is structurally the purest French — the locked pawn chain is the position the French was named for.",
    summary:
      'White locks the center on move 3. The purest French pawn chain — same opening as the Winawer, different character.',
    hook: 'The French position the opening was named for.',
    durationTargetSec: 75,
  },
  {
    id: 'french_exchange',
    title: 'French Defense: Exchange Variation',
    pgn: `[Event "French — Exchange Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 e6 2. d4 d5 3. exd5 exd5 4. Bd3 Nc6 5. c3 Nf6 6. Nf3 Bd6 7. O-O O-O 8. Bg5 h6 9. Bh4 Bg4 10. Nbd2 Re8 11. Re1 Qd7 *
`,
    lessonContext:
      "French Exchange (3.exd5 exd5). The 'drawing' line — White trades central tension for a symmetrical pawn structure. Both sides have IQP-free positions with mirrored pieces. Plans: each side develops naturally, looks for kingside attacks, and tries to outplay the other in a position with almost zero structural imbalance. Teaching point: the Exchange is the French line White picks when they want a quiet day — but black actually scores well here at the club level because Black knows the structure better than White does.",
    summary:
      "The 'boring' anti-French. White trades into a symmetric structure — but Black often outplays White anyway.",
    hook: 'The line White plays to avoid the French — that Black wins anyway.',
    durationTargetSec: 65,
  },
];
