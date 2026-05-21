/**
 * Sicilian Defense — Najdorf Variation, English Attack main line.
 *
 * 11-move teaching line covering the most popular Sicilian by reputation.
 * The Najdorf is the variation Fischer, Kasparov, Topalov and Carlsen
 * have all leaned on as their main weapon against 1.e4.
 *
 *   - The Open Sicilian: White's d4 break, Black takes
 *   - Black's a6 (the Najdorf move) restraining b5 and Bb5 ideas
 *   - The English Attack with f3 + Be3 + Qd2 + O-O-O
 *   - Black's typical e6 / Be7 / O-O setup before counterattacking
 */
export const SICILIAN_NAJDORF_LESSON_PGN = `[Event "AI Lesson — Sicilian Najdorf"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "B90"]
[Opening "Sicilian Defense, Najdorf Variation"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e6 7. f3 Be7 8. Qd2 O-O 9. O-O-O Nbd7 10. g4 b5 11. g5 Nh5 *
`;
