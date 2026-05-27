/**
 * Colle System — Colle-Koltanowski main line.
 *
 * 11-move teaching line through the classical Colle structure. The
 * Colle is the "London's older cousin" — same system-opening
 * philosophy but with the c1 bishop locked in on c1 and the
 * e3-e4 break as the strategic centerpiece.
 *
 *   - 1.d4 + 2.Nf3 + 3.e3 — the Colle skeleton (no Bf4 yet)
 *   - Slow build with Bd3 + c3 + Nbd2 + O-O
 *   - Wait for Black to commit, then unleash e3-e4 push
 *   - Strategic test: can White get the e4 break safely?
 */
export const COLLE_SYSTEM_LESSON_PGN = `[Event "AI Lesson — Colle System"]
[Site "—"]
[Date "2026.05.27"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "D05"]
[Opening "Colle System, Colle-Koltanowski"]

1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 c5 5. c3 Nc6 6. Nbd2 Bd6 7. O-O O-O 8. dxc5 Bxc5 9. e4 Qc7 10. Qe2 e5 11. h3 Bd7 *
`;
