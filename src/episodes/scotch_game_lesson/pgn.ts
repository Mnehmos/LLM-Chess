/**
 * Scotch Game — Classical Variation main line.
 *
 * 11-move teaching line through the Scotch's central trade. The Scotch
 * was popular in the 19th century, abandoned during the positional era,
 * then revived by Kasparov in the 1990s as a sharp anti-Ruy alternative.
 *
 *   - The d4 break on move 3 (vs the Italian's c3+d3, the Ruy's Bb5)
 *   - Black recaptures and the center opens immediately
 *   - The Classical Scotch (4...Bc5) — most popular at the top level
 *   - Sharp piece play with no long pawn-chain maneuvering
 */
export const SCOTCH_GAME_LESSON_PGN = `[Event "AI Lesson — Scotch Game"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "C45"]
[Opening "Scotch Game, Classical Variation"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6 6. c3 Nge7 7. Bc4 Ne5 8. Be2 Qg6 9. O-O d6 10. Kh1 O-O 11. f4 Nec6 *
`;
