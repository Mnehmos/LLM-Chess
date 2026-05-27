/**
 * King's Indian Attack (KIA) — Classical Main Line.
 *
 * 11-move teaching line. The KIA is the KID with COLORS REVERSED:
 * White plays the Black side of the King's Indian (Nf3 + g3 + Bg2
 * + d3 + Nbd2 + e4 + Re1) and aims for the same kingside attack —
 * but with a tempo up.
 *
 *   - Nf3 + g3 + Bg2 — the fianchetto skeleton
 *   - d3 (not d4!) — the hypermodern restraint
 *   - e4 + e5 — the classic central push and outpost
 *   - h4 + Nf1 + Ng3 — slow kingside attack
 */
export const KIA_LESSON_PGN = `[Event "AI Lesson — King's Indian Attack"]
[Site "—"]
[Date "2026.05.27"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "A07"]
[Opening "King's Indian Attack, Classical Main Line"]

1. Nf3 d5 2. g3 Nf6 3. Bg2 e6 4. O-O Be7 5. d3 O-O 6. Nbd2 c5 7. e4 Nc6 8. Re1 b5 9. e5 Nd7 10. Nf1 a5 11. h4 b4 *
`;
