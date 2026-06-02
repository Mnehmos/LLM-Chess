/**
 * Historical context for Praggnanandhaa vs Rapport injected into the
 * commentator's system prompt so it has dates, players, venue, the
 * sacrificial decisions, and the post-game analysis to reference
 * without having to recall them.
 *
 * Sources: The Week in Chess archive
 * (https://theweekinchess.com/chessnews/events/2nd-uzchess-cup-2025),
 * ChessBase report (https://en.chessbase.com/post/uzchess-cup-2025-6),
 * Chess.com event recap of the UzChess Masters 2025
 * (https://www.chess.com/news/view/praggnanandhaa-wins-uzchess-masters-2025),
 * and the litandchess Substack annotated analysis
 * (https://litandchess.substack.com/p/praggnanandhaa-rapport-uzchess-cup).
 */
export const PRAGG_RAPPORT_UZCHESS_2025_HISTORICAL_CONTEXT = `
The game was played on 2025-06-24 in Round 6 of the 2nd UzChess Cup
Masters, a 10-player round robin held in Tashkent, Uzbekistan from
June 19 to June 28, 2025. White was GM Rameshbabu Praggnanandhaa
(India, FIDE 2767, world #5 at the start of the event). Black was GM
Richard Rapport (Hungary, FIDE 2714). The result was 0-1 in 37 moves.
Praggnanandhaa went on to win the tournament outright despite this
loss — the brilliancy is what the event is remembered for.

Opening: King's Indian Defense, Sämisch Variation (ECO E81). White
plays the early f3 + e4 + Nge2 setup, supporting a big classical
center and leaving open the option to castle long. The move order
6.Nge2 (before Be3) is slightly flexible — most modern White players
play Be3 first. Praggnanandhaa's plan with 8.Qd2 and 9.h4 commits to
opposite-side castling and the kingside pawn storm.

Rapport's plan: 7...Nbd7 + 8...b5 is a long-standing theoretical
pawn sacrifice in the Sämisch. The point is NOT to recover the pawn
later but to crack open the c- and a-files against White's king, which
is committed to the queenside by White's own setup. Once White takes
on b5, Black's queen's rook has a permanent file and Black's light-
squared bishop sees the c-file and the long diagonal.

The critical sacrifice is 15...Nxd5! — a top engine line that both
sides had likely seen in preparation. Black sacrifices a full knight
for the bishop pair, an open e-file, the diagonal to White's king, and
TIME. White cannot easily develop the f1-bishop or activate the queen
because every developing move creates a new tactical weakness.

The decisive moment is moves 22-24. Praggnanandhaa's original intent
was 23.Nd4, holding the structure and trying to consolidate. He
deviated to 23.Bc4? — protecting his bishop and seeming to repel
the attack. Rapport then played 23...Bc2!!, the move Garry Kasparov
publicly praised on social media. The bishop heads for a4 (not for
the obvious d1 or e4), where it removes the defending Nb5 and finishes
the queenside collapse. After 24.Rd2 Ba4 25.Nd4 Rac5 the position is
already lost for White; the rest is conversion.

This game has been described by multiple commentators as a candidate
for the 2025 Game of the Year. The combination of the deeply prepared
opening sacrifice, the quiet maneuvering moves (17...Ra4, 18.Nc1
Qd7 — Black is voluntarily down material and moving QUIETLY), and the
geometric brilliance of the ...Bc2/...Ba4 idea makes it a teaching
example for how to play with a sacrificed piece against a partially-
developed enemy king.
`.trim();
