import type { Episode, MoveTangent, WhiteboardScene, BoardBranch } from '../types';
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

// POC board branches — instructor-controlled "what if" interludes.
// The lesson pauses after the chosen ply, plays the branch moves on
// the actual board (with amber banner), then restores the main line.
//
// Italian Game branch: after Black plays 5...d6 (ply 10), the board
// switches to "what if White tried Bxf7+ here?" — a famous student
// blunder. The branch demonstrates that Black's king walks but White
// has no follow-up, ending in a clearly losing position for White.
// SANs validated legal against the main PGN's position after ply 10.
const ITALIAN_GAME_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'italian_bxf7_blunder',
    afterPly: 10, // After 5...d6 (Black's 5th move), White to play
    fromPly: 10, // No rewind — branch starts from the current position
    title: '6.Bxf7+ — the bishop sacrifice that doesn\'t work',
    branchMoves: ['Bxf7+', 'Kxf7', 'Ng5+', 'Kg8', 'Qh5+', 'g6'],
    narrationCue:
      "Show what happens if White tries the famous Bxf7+ sacrifice here instead of castling. The king walks but White has no follow-up — after Qh5+ g6 White is just down a bishop with no compensation. This is the most common reason club players LOSE games as White in the Italian: confusing the Fried Liver pattern (which needs ...Nxe5) with positions where it just hangs a piece.",
    returnToPly: 10, // Resume main line at ply 11 (6.O-O)
    branchMoveDelayMs: 1800,
  },
];

// POC whiteboard scenes — three illustrative slates along the Italian
// Game teaching line. Each plays AFTER the matching ply's move
// commentary, gated by the ?whiteboard=1 URL flag. Default captures
// skip these entirely, so the standard MP4 output is unchanged.
const ITALIAN_GAME_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 3, // After 2.Nf3 (White's 2nd move, before Black's reply)
    heading: 'What is the Italian Game?',
    narrationCue:
      'Pause to set up the lesson: what the Italian Game is, who plays it, what win conditions each side targets.',
    durationMs: 14000,
    bullets: [
      "1.e4 e5 2.Nf3 Nc6 3.Bc4 — White's bishop aims at f7, Black's weakest square.",
      'The oldest opening still played at the top level; Greco published analysis in 1620.',
      "Two modern flavors: quiet d3 system (positional grind) or c3-d4 break (classical attack).",
      "Black's main reply: 3...Bc5 mirroring development; or 3...Nf6 (Two Knights, sharper).",
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 10, // After 5.d3 d6 (both sides locked the pawn structure)
    heading: "The Italian Pawn Structure",
    narrationCue:
      "Pause to explain the locked pawn skeleton — what it tells you about both sides' middlegame plans.",
    durationMs: 13000,
    whitePawns: ['a2', 'b2', 'c3', 'd3', 'e4', 'f2', 'g2', 'h2'],
    blackPawns: ['a7', 'b7', 'c7', 'd6', 'e5', 'f7', 'g7', 'h7'],
    caption:
      "Symmetric except for c3 vs c7. White's c3 prepares d4; Black's d6 supports e5 and stops Bxf7+.",
  },
  {
    kind: 'move_tree',
    ply: 13, // After 6.O-O O-O (both castled)
    heading: 'Three Plans from this Position',
    narrationCue:
      'Pause to outline the strategic fork after castling: which plan is White picking, and why.',
    durationMs: 15000,
    root: 'After 6.O-O O-O, White chooses one of three plans:',
    branches: [
      {
        label: 'Quiet Italian — Nbd2/Nf1/Ng3 knight tour',
        moves: ['Nbd2', 'a6', 'Bb3', 'Ba7', 'Re1', 'h6', 'Nf1'],
      },
      {
        label: 'Classical — c3 + d4 central break',
        moves: ['c3', 'a6', 'd4', 'exd4', 'cxd4', 'Bb6'],
      },
      {
        label: 'Aggressive — h3 prep + Bg5 pin',
        moves: ['h3', 'h6', 'Bg5', 'Be6', 'Bxe6', 'fxe6'],
      },
    ],
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
  boardBranches: ITALIAN_GAME_BOARD_BRANCHES,
  whiteboardScenes: ITALIAN_GAME_WHITEBOARD,
  exports: ITALIAN_GAME_EXPORT,
};

export {
  ITALIAN_GAME_LESSON_PGN,
  ITALIAN_GAME_LESSON_COMMENTATOR,
  ITALIAN_GAME_VARIATIONS,
  ITALIAN_GAME_EXPORT,
};
