/**
 * Catalan Opening — Open Catalan main line.
 *
 * 11-move teaching line covering the Catalan's defining hybrid:
 * Queen's Gambit + King's Indian Attack rolled into one opening.
 * Kramnik's preferred 1.d4 weapon during his 2000-2007 reign.
 *
 *   - The Catalan setup: d4 + c4 + g3 + Bg2 (fianchetto + closed center)
 *   - Black takes the c-pawn (Open Catalan) accepting structural concession
 *   - White recovers the pawn but plays for long-term Bg2 pressure
 *   - The Qc2/Qb3 dance to harass the pawn and force Black to give it back
 *   - Typical endgames: Black slightly worse, hard to convert
 */
export const CATALAN_OPEN_LESSON_PGN = `[Event "AI Lesson — Open Catalan"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "E04"]
[Opening "Catalan Opening, Open Defense"]

1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4 5. Nf3 a6 6. O-O Nc6 7. Qc2 Rb8 8. Nbd2 b5 9. b3 cxb3 10. axb3 Bb4 11. Bb2 O-O *
`;
