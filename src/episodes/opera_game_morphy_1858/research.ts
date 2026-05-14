/**
 * Historical context injected into the commentator's system prompt so it
 * has dates, players, venue, and famous moves to reference without having
 * to recall them.
 *
 * Sources: Edward Winter's chess-history columns (Chess Notes), the
 * Wikipedia article "Opera Game", and standard reference works including
 * Kasparov's "My Great Predecessors" Vol. 1 and Reinfeld's annotated
 * collections. The Norma performance attribution is the consensus account
 * recorded by Morphy's contemporaries.
 */
export const OPERA_GAME_HISTORICAL_CONTEXT = `
The Opera Game was played in 1858 in Paris, in the box of Duke Karl II of
Brunswick at the Salle Le Peletier opera house, during a performance of
Vincenzo Bellini's "Norma." Paul Morphy, age 21 and on the European tour
that established him as the strongest player in the world, played White.
The Duke and his frequent chess partner Count Isouard de Vauvenargues
played Black as a consulting pair against Morphy.

The game opens with the Philidor Defense (1.e4 e5 2.Nf3 d6). Morphy plays
classical principles — rapid development, central control, castling early
— while Black falls behind in development and weakens the queenside with
9...b5 in response to the Bg5 pin on the f6 knight.

From move 10 onward, Morphy executes a textbook attacking sequence:
- 10.Nxb5! sacrificing the knight to open lines against the king,
- 11.Bxb5+ recapturing with check while pinning the new defender,
- 12.O-O-O+ castling long with discovered check, bringing the rook to the
  open d-file and aiming directly at the Black king,
- 13.Rxd7! exchange sacrifice removing the only defending knight,
- 14.Rd1 doubling on the d-file,
- 15.Bxd7+ continuing the assault,
- 16.Qb8+!! the immortal queen sacrifice that decoys the Black knight to
  b8 and clears d8 for the rook,
- 17.Rd8# the final mate.

Morphy is reported to have been watching the opera while playing, and his
opponents reportedly only realized the situation when 16.Qb8+ landed on
the board. The game has been used as a first-tutorial demonstration for
generations of chess students because every move teaches a discrete
principle (development, the open file, the pin, the sacrifice for tempo,
the mating net) without any of the obscuring complexity of modern theory.
`.trim();
