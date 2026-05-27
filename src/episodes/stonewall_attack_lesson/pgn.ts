/**
 * Stonewall Attack — Classical Main Line.
 *
 * 11-move teaching line through the most committed kingside-attack
 * system in 1.d4 chess. White builds the famous "Stonewall" pawn
 * formation (d4 + e3 + f4) and aims everything at h7.
 *
 *   - d4 + e3 + Bd3 + f4 — the Stonewall skeleton
 *   - Nf3 + Nbd2 + O-O — patient development
 *   - Ne5 + fxe5 — the key central trade locking the f-file open
 *   - The bishop on d3 + queen lift = classic Pillsbury attack
 */
export const STONEWALL_ATTACK_LESSON_PGN = `[Event "AI Lesson — Stonewall Attack"]
[Site "—"]
[Date "2026.05.27"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "D00"]
[Opening "Stonewall Attack, Classical Main Line"]

1. d4 d5 2. e3 Nf6 3. Bd3 e6 4. f4 c5 5. c3 Nc6 6. Nf3 Bd6 7. Nbd2 O-O 8. O-O Qc7 9. Ne5 Bxe5 10. fxe5 Nd7 11. Nf3 b6 *
`;
