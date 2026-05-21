/**
 * Caro-Kann Defense — Classical Variation main line.
 *
 * 11-move teaching line through the classical 4...Bf5 setup. The
 * Caro-Kann is the "rock-solid" answer to 1.e4 — chosen by Karpov,
 * Petrosian, and modern positional grinders.
 *
 *   - Black supports d5 with c6 (like the Slav), then trades on e4
 *   - The light-squared bishop comes OUT to f5 (the Caro-Kann's
 *     famous advantage over the French — no bad bishop)
 *   - White harasses with h4/h5 and eventually trades light-squared
 *     bishops on h7
 *   - Both sides reach a symmetric pawn structure with active piece play
 */
export const CARO_KANN_CLASSICAL_LESSON_PGN = `[Event "AI Lesson — Caro-Kann Classical"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "B18"]
[Opening "Caro-Kann Defense, Classical Variation"]

1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bd2 Ngf6 *
`;
