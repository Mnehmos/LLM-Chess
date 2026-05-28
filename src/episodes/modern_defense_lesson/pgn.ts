/**
 * Modern Defense — Tiger's Modern main line.
 *
 * 11-move teaching line through the most flexible black system.
 * The Modern is the Pirc with ...g6/...Bg7 first and ...d6/...Nf6
 * delayed — Black plays a SETUP, not specific moves.
 *
 *   - 1...g6 + 2...Bg7 + 3...d6 — Black's fianchetto skeleton
 *   - 4...a6 (the Tiger Modern) — preparing ...b5 expansion
 *   - Slow development with queenside pawnstorm
 *   - The hippopotamus / modern setup converges here
 */
export const MODERN_DEFENSE_LESSON_PGN = `[Event "AI Lesson — Modern Defense"]
[Site "—"]
[Date "2026.05.27"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "B06"]
[Opening "Modern Defense, Tiger's Modern"]

1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. Nf3 a6 5. Be2 b5 6. O-O Bb7 7. a3 Nd7 8. Re1 e6 9. Bf4 Ne7 10. h3 c5 11. d5 e5 *
`;
