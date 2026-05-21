/**
 * The Italian Game — Giuoco Piano main line.
 *
 * 12-move teaching line covering the classical Italian setup through
 * a typical kingside fianchetto-style middlegame plan. Selected to
 * showcase:
 *   - Central pawn play (e4 / e5, d2-d3)
 *   - Piece development priorities (knight before bishop, bishop to
 *     active diagonal, castle early)
 *   - The Italian's central tension (c3/d4 break vs. quiet d3 plans)
 *   - Black's symmetric responses and where they break symmetry
 *
 * Game ends in a balanced middlegame position — this is an OPENING
 * lesson, not a brilliancy. Move count is intentionally short
 * (~3 minutes of capture wall-clock) so the demo runs fast.
 */
export const ITALIAN_GAME_LESSON_PGN = `[Event "AI Lesson — Italian Game"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Nbd2 a6 8. Bb3 Ba7 9. Re1 h6 10. Nf1 Be6 11. Bxe6 fxe6 12. Ng3 Qd7 *
`;
