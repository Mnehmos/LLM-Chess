/**
 * Ruy Lopez (Spanish Game) — Closed Defense main line.
 *
 * 12-move teaching line covering the classical Closed Spanish through
 * the Chigorin Defense setup. Selected to showcase:
 *   - The pin on c6 and Black's a6/Ba4 response
 *   - The Spanish bishop's long retreat (Bb5-Ba4-Bb3-Bc2)
 *   - Central tension without an immediate break
 *   - Maneuvering chess — knights to the rim then back to the center
 *     (the Knight tour Nb1-d2-f1-g3 is the same idea as the Italian)
 *
 * Ends in a balanced middlegame typical of the Closed Spanish, where
 * White's space advantage and Black's solid structure are both intact.
 */
export const RUY_LOPEZ_LESSON_PGN = `[Event "AI Lesson — Ruy Lopez Closed"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "C84"]
[Opening "Ruy Lopez, Closed Defense"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 Nc6 *
`;
