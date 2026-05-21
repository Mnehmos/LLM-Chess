import type { VariationShort } from '../types';

export const SICILIAN_NAJDORF_VARIATIONS: VariationShort[] = [
  {
    id: 'sicilian_dragon',
    title: 'Sicilian Defense: Dragon Variation',
    pgn: `[Event "Sicilian — Dragon Variation"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Rc8 11. Bb3 Ne5 *
`,
    lessonContext:
      "Sicilian Dragon (5...g6). Black fianchettoes the king's bishop into a fearsome diagonal aimed at White's queenside. The line shown is the Yugoslav Attack — White's most ambitious try, with the king castling queenside and h-pawn pawnstorming the Dragon castle. Black counterpunches on the c-file and a-file. Teaching point: the Dragon is the most theory-dependent Sicilian line — a single tempo lost in the pawnstorm race can decide the game. Both sides race for mate.",
    summary:
      'The most aggressive Sicilian. Both sides castle on opposite wings, both pawnstorm, and the first attacker through wins.',
    hook: 'A theoretical pawnstorm race for opposite-side mate.',
    durationTargetSec: 80,
  },
  {
    id: 'sicilian_scheveningen',
    title: 'Sicilian Defense: Scheveningen',
    pgn: `[Event "Sicilian — Scheveningen"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e6 6. Be2 Be7 7. O-O O-O 8. f4 Nc6 9. Be3 a6 10. a4 Qc7 11. Kh1 Re8 *
`,
    lessonContext:
      "Sicilian Scheveningen (5...e6). Black builds the 'small center' (e6 + d6) and develops solidly without grabbing space. The line shown is the Classical Scheveningen with White's Maroczy/Kasparov-style setup (Be2, O-O, f4). Plans: White looks for f4-f5 break and kingside attack; Black plays for ...b5-b4 queenside expansion and ...d5 central break. Teaching point: the Scheveningen is the Sicilian for a player who wants Black's positional ideas without the Najdorf's memorization burden.",
    summary:
      'The "small center" Sicilian. Solid, principled, less theory than the Najdorf or Dragon.',
    hook: 'The Sicilian with no early commitments.',
    durationTargetSec: 75,
  },
  {
    id: 'sicilian_sveshnikov',
    title: 'Sicilian Defense: Sveshnikov Variation',
    pgn: `[Event "Sicilian — Sveshnikov"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5 9. Nd5 Be7 10. Bxf6 Bxf6 11. c3 O-O *
`,
    lessonContext:
      "Sicilian Sveshnikov (4...Nf6 5.Nc3 e5). Black plays the bold ...e5 on move 5, accepting a hole on d5 in exchange for active piece play and a strong dark-squared bishop. The line shown is the modern main line with Nd5, exchange on f6, and Black's ...O-O. Teaching point: the Sveshnikov was Magnus Carlsen's main Sicilian during his world-championship matches against Caruana (2018) — modern engines confirm Black is fully fine despite the structural concession.",
    summary:
      "Carlsen's Sicilian. Black creates a permanent hole on d5 and trusts in piece play to compensate.",
    hook: 'A hole on d5, accepted on purpose.',
    durationTargetSec: 80,
  },
  {
    id: 'sicilian_closed',
    title: 'Sicilian Defense: Closed Sicilian',
    pgn: `[Event "Sicilian — Closed Sicilian"]
[Site "Lesson"]
[Date "????.??.??"]
[Round "-"]
[White "Teacher (W)"]
[Black "Teacher (B)"]
[Result "*"]

1. e4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. d3 d6 6. Be3 e6 7. Qd2 Nge7 8. Nf3 Nd4 9. O-O O-O 10. Nh4 Rb8 11. f4 b6 *
`,
    lessonContext:
      "Closed Sicilian (2.Nc3). White declines the Open Sicilian's theoretical battle and plays a King's Indian Attack-style positional game instead. The line shown is the classical setup with Bg2 fianchetto, f4 push, and a slow kingside attack. Plans: White attacks on the kingside with f4-f5; Black counters with a queenside pawnstorm (b5, b4). Teaching point: the Closed Sicilian is the choice for White players who want to avoid Najdorf theory entirely — Spassky played it his whole career and won World Championship games with it.",
    summary:
      "Avoid the Najdorf theory entirely. White plays a King's Indian Attack-style positional Sicilian.",
    hook: 'The Sicilian without the theory.',
    durationTargetSec: 75,
  },
];
