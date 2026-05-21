import type { Episode, MoveTangent } from '../types';
import { ITALIAN_GAME_LESSON_PGN } from './pgn';
import { ITALIAN_GAME_LESSON_COMMENTATOR } from './commentator';
import { ITALIAN_GAME_VARIATIONS } from './variations';
import { ITALIAN_GAME_EXPORT } from './exports';

const ITALIAN_GAME_BOOK_STANDARD = [
  "Italian Game book standard.",
  "White's goal: develop knights before bishops, place the king's bishop on c4 (aiming at f7), castle early, and choose between the classical c3-d4 break (Möller, romantic style) and the modern d3 quiet system (slow strategic maneuver).",
  "Black's goal: mirror development with Nc6 + Bc5 (Giuoco Piano) or play more dynamically with Nf6 (Two Knights), keep the king safe on g8, and time ...d6 / ...a6 / ...h6 to neutralize White's bishop pressure.",
  "Holding lines: both sides develop pieces toward the center, neither commits to a wing attack early, and either side that breaks the Italian's slow buildup tempo (premature pawn pushes, leaving f7/f2 weak) hands the initiative to the other.",
  "Common pitfalls: blundering the f7-pawn to a knight or bishop, playing Bb6 too soon and getting hit by Nxe5/d5, or capturing with the wrong pawn structure after Bxe6 fxe6.",
].join(' ');

// POC tangents — three illustrative alternatives along the Italian
// Game teaching line. Each ghost arrow appears for the duration of
// the matching ply's commentary, then clears with the next move.
// All SANs verified legal against the main PGN's position before
// the ply they apply to.
const ITALIAN_GAME_TANGENTS: MoveTangent[] = [
  {
    ply: 7, // White's 4th move (c3 in main)
    san: 'd4',
    category: 'engine_refutation',
    note: 'Instead of c3, White could try d4 directly — but exd4 transposes the Italian into Scotch Game territory and concedes the central tension.',
  },
  {
    ply: 9, // White's 5th move (d3 in main)
    san: 'Ng5',
    category: 'student_mistake',
    note: 'Ng5 looks aggressive (the Two Knights idea against f7), but here Black has ...d5! and the knight is offside — d3 quietly is correct.',
  },
  {
    ply: 11, // White's 6th move (O-O in main)
    san: 'Bxf7+',
    category: 'student_mistake',
    note: 'Bxf7+ is the famous Italian sacrifice pattern but here it loses the bishop outright — ...Kxf7 and White has no follow-up. Castle first.',
  },
];

/**
 * The Italian Game — opening lesson.
 *
 * The PGN is a curated 12-move teaching line through the Giuoco Piano
 * main line. The commentator is in TEACHER mode (first-person voice,
 * lessonContext set), making this the first "AI teaches X opening"
 * style episode in the catalog.
 *
 * source = 'agent_generated' rather than 'public_domain' or
 * 'licensed' because this isn't a historical game — it's an AI demo.
 */
export const ITALIAN_GAME_LESSON_EPISODE: Episode = {
  id: 'italian_game_lesson',
  track: 'lesson',
  title: 'Italian Game Explained by an AI (Giuoco Piano, Move by Move)',
  summary:
    'An AI walks through the Italian Game (Giuoco Piano main line), playing both sides of a 12-move demonstration and explaining each idea in real time.',
  source: 'agent_generated',
  pgn: ITALIAN_GAME_LESSON_PGN,
  commentator: ITALIAN_GAME_LESSON_COMMENTATOR,
  bookStandard: ITALIAN_GAME_BOOK_STANDARD,
  moveTangents: ITALIAN_GAME_TANGENTS,
  exports: ITALIAN_GAME_EXPORT,
};

export {
  ITALIAN_GAME_LESSON_PGN,
  ITALIAN_GAME_LESSON_COMMENTATOR,
  ITALIAN_GAME_VARIATIONS,
  ITALIAN_GAME_EXPORT,
};
