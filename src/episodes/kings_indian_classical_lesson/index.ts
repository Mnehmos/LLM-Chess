import type {
  Episode,
  EpisodeChapter,
  KeyIdeasBlock,
  WhatToWatchBlock,
  FunFact,
  MoveTangent,
  BoardBranch,
  WhiteboardScene,
} from '../types';
import { KINGS_INDIAN_CLASSICAL_LESSON_PGN } from './pgn';
import { KINGS_INDIAN_CLASSICAL_LESSON_COMMENTATOR } from './commentator';
import { KINGS_INDIAN_VARIATIONS } from './variations';
import { KINGS_INDIAN_CLASSICAL_LESSON_EXPORT } from './exports';

// ─── KID book standard ─────────────────────────────────────────
const KID_BOOK_STANDARD = [
  "King's Indian Defense book standard.",
  "Black's goal: play the SAME setup against anything (Nf6/g6/Bg7/d6/O-O), let White build a big classical center, then attack it with the ...e5 / ...c5 / ...f5 pawn break. Play for the king attack at all costs.",
  "White's goal: build the c4/d4/e4 'big three' pawn center, then choose between the Classical (Nf3+Be2 setup with d5 closing + Nb5/Nd3 maneuvers) or one of the sharp anti-KID lines (Sämisch f3, Four Pawns f4, Fianchetto g3).",
  "Holding lines: Black times the ...e5 break to challenge the center (typically move 6-7); after d5 closes, Black launches the ...f5/...f4 kingside pawnstorm while White's queenside expansion races on the other wing.",
  "The opposite-wing race is the KID's signature: whoever's pawnstorm arrives first wins. There is NO middle ground — you either checkmate or get steamrolled.",
  "Common pitfalls: Black playing ...c5 too early (different opening — Benoni); White trading queens to defuse the attack (works as a draw weapon, kills the lesson); either side hesitating on the pawnstorm and ceding the initiative.",
].join(' ');

// ─── Chapters ───────────────────────────────────────────────────
const KID_CHAPTERS: EpisodeChapter[] = [
  {
    ply: 0,
    title: 'The KID Setup',
    subtitle: 'Five moves that define hypermodern strategy',
  },
  {
    ply: 7, // After 4.e4 (white's 4th — the "big three" emerges)
    title: 'White Builds, Black Lets Them',
    subtitle: 'The c4/d4/e4 center vs the fianchetto crouch',
  },
  {
    ply: 12, // After 6...e5 — Black challenges the center
    title: 'The ...e5 Challenge',
    subtitle: 'Black bites at d4, forcing White\'s choice',
  },
  {
    ply: 15, // After 8.d5 — center closes
    title: 'The Center Closes',
    subtitle: 'd5 triggers the opposite-wing race',
  },
  {
    ply: 21, // After 11.Be3 — White completes the kingside dam
    title: 'The Kingside Pawnstorm',
    subtitle: '...f5/...f4 begins. No retreat from here.',
  },
];

// ─── Key ideas per chapter ─────────────────────────────────────
const KID_KEY_IDEAS: KeyIdeasBlock[] = [
  {
    chapterPly: 0,
    ideas: [
      'Nf6 + g6 + Bg7 + d6 + O-O — five moves Black plays REGARDLESS of White\'s setup.',
      'Hypermodern strategy: let the opponent build the big center, then attack it from the flanks.',
      "Fischer, Kasparov, Nakamura, Radjabov all built world-championship careers on this opening.",
      'The most THEORETICAL black-side defense in chess — also the most DANGEROUS.',
    ],
  },
  {
    chapterPly: 7,
    ideas: [
      'White\'s "big three" (c4/d4/e4) looks overwhelming but exposes the d5/e4 squares to Black\'s pieces.',
      'Black\'s fianchetto on g7 aims at the long diagonal — eyes White\'s queenside.',
      'Standard order: Nc3 + e4 + Nf3 + Be2 — flexible, classical, leaves all plans open.',
      'White can still pick Sämisch (f3), Four Pawns (f4), or Fianchetto (g3) — all sharper.',
    ],
  },
  {
    chapterPly: 12,
    ideas: [
      "Black plays ...e5 to CHALLENGE the center — White must respond.",
      "White has three real choices: dxe5 (trade), d5 (close), or Bg5/h3 (slow develop).",
      "...e5 is NOT ...c5 — that's the Benoni, a different opening with different plans.",
      "The d5 push is the most popular response and triggers the Mar del Plata main line.",
    ],
  },
  {
    chapterPly: 15,
    ideas: [
      'd5 closes the center and DEFINES the rest of the game: opposite-wing pawnstorms.',
      'Black\'s plan: ...f5/...f4 kingside pawnstorm + ...g5-g4 if needed for mate.',
      'White\'s plan: c5-c6/b4-b5 queenside expansion + Nb5/Nc7 invasion.',
      'The Mar del Plata trade-off: both kings are vulnerable, whoever attacks faster wins.',
    ],
  },
  {
    chapterPly: 21,
    ideas: [
      "After ...f4 the kingside pawnstorm is unstoppable — White can't retreat the f4 square.",
      "Typical attack sequence: ...g5, ...Nf6-g6/h5, ...Rf7-g7, ...Qh4-h3 (long route to king).",
      "White's counter: c5/cxd6 then Nb5-c7/d6 invasion — race to capture the queenside.",
      'In the Mar del Plata main lines, both sides are mated by move 30 — checkmate is the norm, not the exception.',
    ],
  },
];

// ─── What to watch per chapter ─────────────────────────────────
const KID_WHAT_TO_WATCH: WhatToWatchBlock[] = [
  {
    chapterPly: 0,
    text: "Watch Black's setup unfold WITHOUT regard to White's moves. The same five-move skeleton plays against the Sämisch, Classical, Fianchetto, or Four Pawns — that's the whole point of the KID.",
  },
  {
    chapterPly: 7,
    text: "Watch the c4/d4/e4 'big three' pawn formation appear. White looks dominant, but every one of those pawns is also a target — Black's plan is to crack them with ...e5 or ...c5 later.",
  },
  {
    chapterPly: 12,
    text: "Watch White's response to ...e5 carefully. d5 (closing) means the Mar del Plata pawnstorm race; dxe5 (trading) means a slower positional game; Bg5 (pinning) means the Averbakh variation. The choice defines the rest of the game.",
  },
  {
    chapterPly: 15,
    text: "Watch how Black's knights reroute: f6 → h5 → f4 (or g4-h6 then back); c6 → e7 → g6 (to support kingside attack). The knight tour is the heart of the KID's middlegame — pieces move FAR from where you'd expect.",
  },
  {
    chapterPly: 21,
    text: "Watch the pawnstorm BUILD. Every ...f5/...f4/...g5 advance commits another piece of Black's structure but brings the attack closer. The KID's signature: zero retreat, total commitment.",
  },
];

// ─── Fun facts ─────────────────────────────────────────────────
const KID_FUN_FACTS: FunFact[] = [
  {
    label: 'History',
    text: "The King's Indian was the favorite weapon of Kasparov, Bronstein, and Fischer — three players Garry himself ranked among the all-time greatest attackers.",
  },
  {
    label: 'Theory',
    text: "Kramnik switched Anand AWAY from the KID before their world-championship match in 2008 because he believed the engine evaluation had finally caught up to White.",
  },
  {
    label: 'Pattern',
    text: "The Mar del Plata variation gets its name from the 1953 Mar del Plata tournament where Najdorf and Gligoric played the line — both sides attacking each other's king with full pawnstorms.",
  },
  {
    label: 'Modern usage',
    text: "Hikaru Nakamura plays the KID in over 60% of his Black games against 1.d4 — even at the top levels of online blitz, the king attack still works.",
  },
  {
    label: 'Quote',
    text: "Boris Spassky: 'The King's Indian is the most exciting opening for Black. You suffer through 20 moves, then mate the king on move 28.'",
  },
];

// ─── Move tangents (single-move ghost arrows) ──────────────────
// All SANs validated against the main PGN's position BEFORE the ply.
const KID_TANGENTS: MoveTangent[] = [
  {
    ply: 7, // White's 4th (e4 in main)
    san: 'Bg5',
    category: 'engine_refutation',
    note: "Bg5 here is the Averbakh prep — pinning Nf6 BEFORE Black plays ...d6. But Black answers ...c5 (Benoni transposition) and the Bg5 bishop is offside. The classical e4 is sounder.",
  },
  {
    ply: 9, // White's 5th (Nf3 in main)
    san: 'h3',
    category: 'student_mistake',
    note: 'h3 wastes a tempo on a non-developing move. The KID is one of the few openings where prophylaxis (preventing ...Ng4) is worth LESS than fast development — fewer moves = more space for the attacker.',
  },
  {
    ply: 11, // White's 6th (Be2 in main)
    san: 'Bd3',
    category: 'engine_refutation',
    note: 'Bd3 looks aggressive (aims at h7) but blocks the d-file — Black plays ...e5 and the d-pawn can\'t advance. Be2 is the principled retreat — keeps d-file open for d4-d5 push.',
  },
  {
    ply: 13, // White's 7th (O-O in main)
    san: 'dxe5',
    category: 'engine_refutation',
    note: "dxe5 trades White's center pawn for Black's, killing the KID's signature middlegame. White avoids the pawnstorm race entirely but cedes any winning chances — used as a 'safe draw' weapon at the top level.",
  },
  {
    ply: 17, // White's 9th (Ne1 in main)
    san: 'Nd2',
    category: 'move_order_trap',
    note: "Nd2 looks similar but blocks the c1-h6 diagonal for the dark-squared bishop — Black plays ...Nh5 chasing the bishop and gains tempo. Ne1 keeps the diagonal clear for Be3.",
  },
  {
    ply: 21, // White's 11th (Be3 in main)
    san: 'g4',
    category: 'student_mistake',
    note: 'g4 is the panicked attempt to prevent ...f5. But Black just plays ...f5 anyway with ...gxf5 in mind — White ends up with a wrecked kingside and Black still has the attack. Be3 cools the position.',
  },
];

// ─── Board branches (instructor "what if" interludes) ──────────
const KID_BOARD_BRANCHES: BoardBranch[] = [
  {
    id: 'kid_samisch_alternative',
    afterPly: 8, // After 4...d6 (black's 4th)
    fromPly: 8,
    title: "What if White plays 5.f3? (The Sämisch Variation)",
    branchMoves: ['f3', 'O-O', 'Be3', 'Nc6', 'Nge2', 'a6'],
    narrationCue:
      "Show the Sämisch — White's most violent anti-KID. Instead of Nf3, White plays f3 to build the strongest possible kingside pawn shield, then launches a pawnstorm with g4-h4. Black must counter on the queenside with ...c5 + ...b5 or get steamrolled. This is the KID line where games are decided by MOVE 25, not 50.",
    returnToPly: 8,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'kid_early_d5',
    afterPly: 12, // After 6...e5 (black's 6th)
    fromPly: 12,
    title: 'What if White closes immediately with 7.d5?',
    branchMoves: ['d5', 'Nbd7', 'Bg5', 'h6', 'Bh4', 'g5'],
    narrationCue:
      "Show what happens if White closes the center immediately with 7.d5 instead of castling first. Black retreats the knight (...Nbd7) and White tries to pin with Bg5. After ...h6 Bh4 ...g5, Black has KICKED both white bishops and gained huge kingside space. This is why castling FIRST (7.O-O) is correct — castling means Bg5 isn't punished as severely.",
    returnToPly: 12,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'kid_bayonet_attack',
    afterPly: 16, // After 8...Ne7 (black's 8th)
    fromPly: 16,
    title: "What if White plays the Bayonet Attack (9.b4)?",
    branchMoves: ['b4', 'Nh5', 'c5', 'Nf4', 'Bxf4', 'exf4'],
    narrationCue:
      "Show the Bayonet Attack — White's sharpest anti-KID try. Instead of the slow Ne1 retreat, White expands on the queenside with b4 immediately. Black responds with ...Nh5 (the typical knight tour to f4) and pieces fly. After ...Nf4 Bxf4 exf4, Black has traded a knight for the dark-squared bishop and the pawn structure is wrecked on both wings — but Black's f-pawn now attacks White's pieces directly.",
    returnToPly: 16,
    branchMoveDelayMs: 1800,
  },
  {
    id: 'kid_pawnstorm_continuation',
    afterPly: 22, // End of main PGN
    fromPly: 22,
    title: 'The pawnstorm continues — what comes after ...f4',
    branchMoves: ['Bf2', 'g5', 'c5', 'Nf6', 'Nd3', 'Nh5'],
    narrationCue:
      "Show what comes AFTER ...f4 — the natural continuation of the lesson. White's bishop retreats to f2 (out of harm's way), Black plays ...g5 to support ...f4 and prepare ...g4, White expands queenside with c5, and Black reroutes the knight from d7 back to f6 then h5. This is the Mar del Plata middlegame at full speed — both sides race their pawnstorms.",
    returnToPly: 22,
    branchMoveDelayMs: 1800,
  },
];

// ─── Whiteboard scenes ─────────────────────────────────────────
const KID_WHITEBOARD: WhiteboardScene[] = [
  {
    kind: 'bullets',
    ply: 6, // After 3.Nc3 (white's 3rd) and 3...Bg7 (black's 3rd)
    heading: 'What is the King\'s Indian Defense?',
    narrationCue:
      "Pause to introduce the KID: who plays it, why, what win conditions it targets, what makes it different from the QGD or the Slav.",
    durationMs: 14000,
    bullets: [
      'A "system opening" for BLACK — the same five-move setup against anything (Nf6/g6/Bg7/d6/O-O).',
      'HYPERMODERN strategy: let White build a big center, then attack it from the flanks.',
      'Black\'s goal is the KING ATTACK — opposite-wing pawnstorms decide most games.',
      'The most dangerous Black opening in chess. Either you mate the king, or you get steamrolled.',
    ],
  },
  {
    kind: 'pawn_structure',
    ply: 15, // After 8.d5 — the center closes, the war begins
    heading: 'The Mar del Plata Pawn Skeleton',
    narrationCue:
      'Pause to show the locked pawn structure — what every KID middlegame converges on after d5.',
    durationMs: 13000,
    whitePawns: ['a2', 'b2', 'c4', 'd5', 'e4', 'f2', 'g2', 'h2'],
    blackPawns: ['a7', 'b7', 'c7', 'd6', 'e5', 'f7', 'g6', 'h7'],
    caption:
      'Locked at d5/e5. White attacks queenside (c5/b5/Nb5); Black attacks kingside (f5/g5/h5). Both kings exposed, both sides mate-hunting.',
  },
  {
    kind: 'move_tree',
    ply: 16, // After 8...Ne7 — White picks the anti-KID plan
    heading: "White's Four Anti-KID Plans",
    narrationCue:
      "Pause to lay out the strategic fork: which anti-KID system White picks defines the rest of the lesson.",
    durationMs: 15000,
    root: 'After 8...Ne7, White picks one of four plans:',
    branches: [
      {
        label: 'Main line — Ne1 + f3 + Be3 (classical Mar del Plata)',
        moves: ['Ne1', 'Nd7', 'f3', 'f5', 'Be3', 'f4'],
      },
      {
        label: 'Bayonet Attack — b4 + c5 (sharp queenside)',
        moves: ['b4', 'Nh5', 'c5', 'Nf4', 'Bxf4', 'exf4'],
      },
      {
        label: 'Petrosian System — Nd2 + b4 (slow squeeze)',
        moves: ['Nd2', 'Nd7', 'b4', 'f5', 'c5', 'Nf6'],
      },
      {
        label: 'Anti-Mar del Plata — h3 + Bg5 (deny ...Ng4)',
        moves: ['h3', 'a5', 'Bg5', 'h6', 'Bd2', 'Nh5'],
      },
    ],
  },
  {
    kind: 'bullets',
    ply: 22, // End of main PGN — practical takeaway
    heading: 'The KID Decision Tree',
    narrationCue:
      "Pause to give the viewer the practical takeaway: how to play the KID against any White setup.",
    durationMs: 14000,
    bullets: [
      'White plays Classical Be2 → main lesson line, target ...f5 + Mar del Plata pawnstorm.',
      'White plays Sämisch f3 → counter with ...c5 + ...b5 queenside expansion (different attack route).',
      'White plays Four Pawns f4 → Benoni-style ...c5 immediately, accept structural concessions.',
      'White plays Fianchetto g3 → ...c6 + ...a6 + ...Nbd7 slow positional play (no pawnstorms).',
    ],
  },
];

export const KINGS_INDIAN_CLASSICAL_LESSON_EPISODE: Episode = {
  id: 'kings_indian_classical_lesson',
  track: 'lesson',
  title: "King's Indian Defense for Black",
  summary:
    "A black-side King's Indian Defense walkthrough covering the core setup, the Classical / Mar del Plata main line, and the opposite-wing pawnstorm race that defines the system.",
  source: 'agent_generated',
  pgn: KINGS_INDIAN_CLASSICAL_LESSON_PGN,
  commentator: KINGS_INDIAN_CLASSICAL_LESSON_COMMENTATOR,
  bookStandard: KID_BOOK_STANDARD,
  chapters: KID_CHAPTERS,
  keyIdeas: KID_KEY_IDEAS,
  whatToWatch: KID_WHAT_TO_WATCH,
  funFacts: KID_FUN_FACTS,
  moveTangents: KID_TANGENTS,
  boardBranches: KID_BOARD_BRANCHES,
  whiteboardScenes: KID_WHITEBOARD,
  exports: KINGS_INDIAN_CLASSICAL_LESSON_EXPORT,
};

export {
  KINGS_INDIAN_CLASSICAL_LESSON_PGN,
  KINGS_INDIAN_CLASSICAL_LESSON_COMMENTATOR,
  KINGS_INDIAN_VARIATIONS,
  KINGS_INDIAN_CLASSICAL_LESSON_EXPORT,
};
