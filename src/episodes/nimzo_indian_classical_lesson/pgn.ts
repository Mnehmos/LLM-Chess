/**
 * Nimzo-Indian Defense — Classical / Capablanca Variation main line.
 *
 * 11-move teaching line covering the most respected 1.d4 defense.
 * The Nimzo was Aron Nimzowitsch's contribution to opening theory
 * and has been a top-tier weapon for Karpov, Kasparov, Anand, Caruana.
 *
 *   - Black pins the c3 knight with Bb4 (the "Nimzo bishop")
 *   - The structural bargain: Black gives White the bishop pair in
 *     exchange for doubled c-pawns (Bxc3+ bxc3)
 *   - The Capablanca system with Qc2 trying to avoid the doubled pawns
 *   - Black's typical setup: ...b6 + ...Bb7 hitting the long diagonal
 */
export const NIMZO_INDIAN_CLASSICAL_LESSON_PGN = `[Event "AI Lesson — Nimzo-Indian Classical"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "E32"]
[Opening "Nimzo-Indian Defense, Classical / Capablanca"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Qc2 O-O 5. a3 Bxc3+ 6. Qxc3 b6 7. Bg5 Bb7 8. f3 d5 9. e3 Nbd7 10. cxd5 exd5 11. Bd3 c5 *
`;
