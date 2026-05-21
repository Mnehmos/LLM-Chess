/**
 * Queen's Gambit Declined — Orthodox Defense main line.
 *
 * 12-move teaching line covering the most classical Queen's pawn opening.
 * Used in five world championship matches and still played at top level.
 *
 *   - White's d4-c4 setup challenging Black's center
 *   - Black declines with ...e6 (the Orthodox), keeping the structure solid
 *   - The Capablanca freeing maneuver (...Nd5 to liquidate)
 *   - White's minority attack vs Black's e6/d5 pawn chain
 */
export const QGD_ORTHODOX_LESSON_PGN = `[Event "AI Lesson — QGD Orthodox"]
[Site "—"]
[Date "2026.05.21"]
[Round "—"]
[White "AI Teacher"]
[Black "AI Teacher (Black side)"]
[Result "*"]
[ECO "D63"]
[Opening "Queen's Gambit Declined, Orthodox Defense"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 11. O-O Nxc3 12. Rxc3 e5 *
`;
