/**
 * Vienna Game — Vienna Gambit main line.
 *
 * 11-move teaching line through the romantic-era Vienna with the
 * f4 gambit thrust. Played by Steinitz, Spielmann, and modern players
 * looking for a tactical anti-1...e5 line that avoids Ruy/Italian theory.
 *
 *   - 2.Nc3 instead of Nf3 (the Vienna's defining move)
 *   - The f2-f4 gambit on move 3 (or 4) creating immediate kingside tension
 *   - The Falkbeer-like central counter-thrust ...d5
 *   - Open files and active pieces vs material balance
 */
export const VIENNA_GAMBIT_LESSON_PGN = `[Event "AI Lesson — Vienna Gambit"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "C29"]
[Opening "Vienna Game, Vienna Gambit"]

1. e4 e5 2. Nc3 Nf6 3. f4 d5 4. fxe5 Nxe4 5. Nf3 Bg4 6. Qe2 Nxc3 7. dxc3 Bxf3 8. Qxf3 Nc6 9. Bf4 Qd7 10. O-O-O O-O-O 11. Bd3 g6 *
`;
