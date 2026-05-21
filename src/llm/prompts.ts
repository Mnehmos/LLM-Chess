import { Chess } from 'chess.js';
import type { PlayerConfig, TurnContext, PromptLevel, OutputFormat, TurnInfoToggles } from '../engine/types';
import { normalizePromptLevel, normalizeOutputFormat, getDefaultToggles } from '../engine/types';

// --- JSON format templates per output format ---

const FORMAT_TEMPLATES: Record<OutputFormat, string> = {
  A: '{ "reasoning": "<your_analysis>", "move": "<move_in_SAN>" }',
  B: '{ "move": "<move_in_SAN>", "reasoning": "<your_justification>" }',
  C: '{ "move": "<initial_move>", "reasoning": "<your_analysis>", "revised_move": "<final_move_or_same>", "revision_reason": "<why_you_changed_or_kept>" }',
  D: '{ "move": "<move_in_SAN>", "reasoning": "<your_justification>" }',
  E: '{ "reasoning": "<your_analysis>", "move": "<move_in_SAN>" }',
  F: '{ "reasoning": "<your_analysis>" }',
};

const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  A: 'IMPORTANT: Write your reasoning FIRST, then commit to a move. Think before you act.',
  B: 'IMPORTANT: State your move FIRST, then explain your reasoning. Commit before you justify.',
  C: 'IMPORTANT: State your initial move, explain your reasoning, then decide whether to revise. Set revised_move to your final choice (same or different).',
  D: 'IMPORTANT: State your move FIRST, then explain your reasoning. Commit before you justify.',
  E: 'IMPORTANT: Write your reasoning FIRST, then commit to a move. Think before you act.',
  F: 'IMPORTANT: Write your reasoning about the position. You will receive advisor feedback before making your final move.',
};

// --- P5/P6 extended format templates ---

function getExtendedFormatTemplate(level: PromptLevel, format: OutputFormat): string {
  const normalized = normalizePromptLevel(level);
  const isActFirst = format === 'B' || format === 'D';

  if (normalized === 'p6') {
    if (isActFirst) {
      return '{ "move": "<move_in_SAN>", "reasoning": "<your_analysis>", "confidence": "HIGH|MEDIUM|LOW", "threats": "<opponent_threats>", "plan": "<next_2_3_moves>", "phase": "opening|middlegame|endgame", "assessment": "<position_summary>" }';
    }
    return '{ "reasoning": "<your_analysis>", "confidence": "HIGH|MEDIUM|LOW", "threats": "<opponent_threats>", "plan": "<next_2_3_moves>", "phase": "opening|middlegame|endgame", "assessment": "<position_summary>", "move": "<move_in_SAN>" }';
  }

  if (normalized === 'p5') {
    if (isActFirst) {
      return '{ "move": "<move_in_SAN>", "reasoning": "<your_analysis>", "confidence": "HIGH|MEDIUM|LOW", "plan": "<next_2_3_moves>" }';
    }
    return '{ "reasoning": "<your_analysis>", "confidence": "HIGH|MEDIUM|LOW", "plan": "<next_2_3_moves>", "move": "<move_in_SAN>" }';
  }

  return FORMAT_TEMPLATES[format];
}

export function buildLinePredictionPromptSection(player: Pick<PlayerConfig, 'linePrediction'>): string {
  if (!player.linePrediction?.enabled) return '';

  const predictionCount = Math.min(Math.max(player.linePrediction.count ?? 2, 1), 3);
  const predictionDepth = Math.max(1, player.linePrediction.depth ?? 4);

  return `LINE PREDICTION:
- Also include "line_predictions": an array of ${predictionCount} plausible continuation line${predictionCount === 1 ? '' : 's'}
- Each line must be an object: { "moves": ["<SAN1>", "<SAN2>", "..."], "summary": "<short idea>" }
- Each "moves" array must start with your chosen move and contain at most ${predictionDepth} plies total
- Keep every move in Standard Algebraic Notation (SAN)
- Prefer realistic continuations over fantasy tactics`;
}

// --- P0-P6 System Prompts ---

function getSystemPrompt(level: PromptLevel, format: OutputFormat): string {
  const normalized = normalizePromptLevel(level);
  const fmt = getExtendedFormatTemplate(level, format);
  const inst = FORMAT_INSTRUCTIONS[format];

  switch (normalized) {
    case 'p0':
      return 'Play chess. Respond with your move in standard algebraic notation.';

    case 'p1':
      return `Play chess. Respond with JSON: ${fmt}
- ${inst}
- Use Standard Algebraic Notation (SAN)
- If hopeless, set move to "resign"`;

    case 'p2':
      return `You are a chess player in a competitive match. Study the position and make your best move.

Rules:
- Respond with JSON: ${fmt}
- ${inst}
- Use Standard Algebraic Notation (SAN) for your move
- If the position is hopeless, you may set move to "resign"
- Think strategically: control the center, develop pieces, protect your king`;

    case 'p3':
      return `You are an experienced chess player in a competitive match. Analyze the position deeply and choose the strongest move.

Rules:
- Respond with JSON: ${fmt}
- ${inst}
- Use Standard Algebraic Notation (SAN) for your move
- If the position is hopeless, you may set move to "resign"

Strategy by phase:
- Opening: Develop pieces, control the center (e4/d4/c4), castle early, connect rooks
- Middlegame: Create and execute plans, target weak squares, coordinate pieces, look for tactical shots
- Endgame: Activate your king, create passed pawns, calculate precisely, use zugzwang`;

    case 'p4':
      return `You are a chess grandmaster in a high-stakes competitive match. Think systematically about every position.

Rules:
- Respond with JSON: ${fmt}
- ${inst}
- Use Standard Algebraic Notation (SAN) for your move
- You will be given a list of legal moves — choose from them
- If the position is hopeless, you may set move to "resign"

THINKING PROTOCOL — Before choosing a move:
1. What did my opponent's last move accomplish? Are there any immediate threats?
2. What is the position type? (open/closed, tactical/strategic, equal/advantage)
3. What candidate moves do I have? List at least 3.
4. For each candidate: what does it achieve? What are the risks?
5. Choose the move that best balances opportunity and safety.

KNOWN FAILURE PATTERNS — Avoid these:
- Do NOT move pieces to squares where they can be immediately captured for free
- Do NOT leave your king in check or walk into check
- Do NOT ignore opponent's threats — always check for captures and checks first
- Do NOT repeat the same position if you have better alternatives
- VERIFY your move is in the legal moves list before committing`;

    case 'p5':
      return `You are a chess grandmaster in a high-stakes competitive match. Think systematically and calibrate your confidence.

Rules:
- Respond with JSON: ${fmt}
- ${inst}
- Use Standard Algebraic Notation (SAN) for your move
- You will be given a list of legal moves — choose from them
- If the position is hopeless, you may set move to "resign"

THINKING PROTOCOL — Before choosing a move:
1. What did my opponent's last move accomplish? Are there any immediate threats?
2. What is the position type? (open/closed, tactical/strategic, equal/advantage)
3. What candidate moves do I have? List at least 3.
4. For each candidate: what does it achieve? What are the risks?
5. Choose the move that best balances opportunity and safety.
6. Rate your confidence: HIGH (forcing/obvious), MEDIUM (multiple reasonable options), LOW (complex/unclear)
7. Outline your plan for the next 2-3 moves.

KNOWN FAILURE PATTERNS — Avoid these:
- Do NOT move pieces to squares where they can be immediately captured for free
- Do NOT leave your king in check or walk into check
- Do NOT ignore opponent's threats — always check for captures and checks first
- Do NOT repeat the same position if you have better alternatives
- VERIFY your move is in the legal moves list before committing

SELF-CALIBRATION:
- If you rate LOW confidence, spend extra reasoning on verification
- If a move "feels" forced, double-check — is there a better option?
- Be honest about uncertainty — a calibrated LOW is better than false HIGH`;

    case 'p6':
      return `You are a chess grandmaster in a high-stakes competitive match. Apply deep strategic reasoning with full position awareness.

Rules:
- Respond with JSON: ${fmt}
- ${inst}
- Use Standard Algebraic Notation (SAN) for your move
- You will be given a list of legal moves — choose from them
- If the position is hopeless, you may set move to "resign"

THINKING PROTOCOL — Before choosing a move:
1. THREATS: What did my opponent's last move threaten? Check for captures, checks, and tactical motifs.
2. ASSESSMENT: Evaluate the position — material balance, king safety, pawn structure, piece activity.
3. PHASE: Identify the game phase (opening/middlegame/endgame) and apply appropriate strategy.
4. CANDIDATES: Generate at least 3 candidate moves with concrete analysis for each.
5. CALCULATE: For the top candidates, look 2-3 moves ahead. Check for tactical refutations.
6. DECIDE: Choose the strongest move. Rate confidence (HIGH/MEDIUM/LOW).
7. PLAN: Outline your plan for the next 2-3 moves after this one.

OPPONENT MODELING:
- Track what opening your opponent is playing. Exploit known weaknesses in their variation.
- If opponent has been making inaccuracies, look for aggressive continuations.
- If opponent plays solidly, maintain pressure without overextending.

TRANSITION MANAGEMENT:
- Opening → Middlegame: All pieces developed? Castled? Pawn structure defined? Then transition.
- Middlegame → Endgame: Fewer pieces? Simplify if ahead, complicate if behind.

TACTICAL PATTERN RECOGNITION:
- Double attacks (forks), pins, skewers, discovered attacks
- Back-rank threats, deflection, overloaded defenders
- Zwischenzug (intermediate moves before recapturing)
- Piece sacrifices for mating attacks or winning endgames

LLM FAILURE MODE OVERRIDES:
- You CANNOT visualize the board from FEN perfectly. When in doubt, rely on the ASCII board.
- Pieces on the board are the ONLY pieces that exist. Do not hallucinate piece positions.
- The legal moves list is AUTHORITATIVE. If your analysis suggests a move not in the list, your analysis is wrong.
- When you identify a "brilliant" sacrifice, triple-check it — LLMs often hallucinate tactical sequences.
- Prefer solid, positionally sound moves over speculative attacks unless the tactic is clearly winning.

KNOWN FAILURE PATTERNS — Avoid these:
- Do NOT move pieces to squares where they can be immediately captured for free
- Do NOT leave your king in check or walk into check
- Do NOT ignore opponent's threats — always check for captures and checks first
- Do NOT repeat the same position if you have better alternatives
- VERIFY your move is in the legal moves list before committing`;

    default:
      return getSystemPrompt('p2', format);
  }
}

// --- Board rendering ---

function fenToAsciiBoard(fen: string): string {
  const chess = new Chess(fen);
  const board = chess.board();
  const rows = board.map((row, ri) => {
    const rank = 8 - ri;
    const cells = row.map(sq => {
      if (!sq) return '.';
      return sq.color === 'w' ? sq.type.toUpperCase() : sq.type;
    }).join(' ');
    return `${rank} | ${cells}`;
  });
  return [...rows, '    ----------------', '    a b c d e f g h'].join('\n');
}

// --- Main prompt builder ---

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Resolve the effective toggles for a player */
function resolveToggles(player: PlayerConfig): TurnInfoToggles {
  const level = normalizePromptLevel(player.promptLevel);
  const defaults = getDefaultToggles(level);
  if (!player.turnInfoToggles) return defaults;
  return { ...defaults, ...player.turnInfoToggles };
}

/** Resolve the effective output format for a player */
function resolveFormat(player: PlayerConfig): OutputFormat {
  return normalizeOutputFormat(player.outputFormat, player.reasoningOrder);
}

export function buildSystemPrompt(player: PlayerConfig): string {
  const level = normalizePromptLevel(player.promptLevel);
  const format = resolveFormat(player);
  const basePrompt = player.systemPrompt || getSystemPrompt(level, format);
  const linePrediction = buildLinePredictionPromptSection(player);
  return linePrediction ? `${basePrompt}\n\n${linePrediction}` : basePrompt;
}

export function buildChessPrompt(player: PlayerConfig, context: TurnContext): ChatMessage[] {
  const level = normalizePromptLevel(player.promptLevel);
  const format = resolveFormat(player);
  const toggles = resolveToggles(player);
  const systemMessage = buildSystemPrompt(player);
  const messages: ChatMessage[] = [{ role: 'system', content: systemMessage }];
  const myColor = context.color;
  const records = context.moveRecords;

  // Build multi-turn conversation with proper user/assistant alternation.
  // For p0 or when history is disabled, skip conversation history.
  const includeHistory = toggles.showHistory && level !== 'p0';

  if (includeHistory && records.length > 0) {
    const isActFirst = format === 'B' || format === 'D';

    // Ensure conversation starts with a user message
    if (records[0].color === myColor) {
      messages.push({ role: 'user', content: 'You have the first move. Choose wisely.' });
    }

    for (const rec of records) {
      if (rec.color === myColor) {
        const obj = isActFirst
          ? { move: rec.move, reasoning: rec.reasoning || '' }
          : { reasoning: rec.reasoning || '', move: rec.move };
        messages.push({
          role: 'assistant',
          content: JSON.stringify(obj),
        });
      } else {
        messages.push({
          role: 'user',
          content: `Opponent played: ${rec.move}`,
        });
      }
    }
  }

  // Final turn prompt
  const parts: string[] = [`Current position (FEN): ${context.fen}`];

  if (toggles.showBoard) {
    parts.push('', 'Board:', context.boardDisplay || fenToAsciiBoard(context.fen));
  }

  parts.push('', `You are playing as: ${myColor === 'w' ? 'White' : 'Black'}`);
  parts.push(`Turn number: ${context.turnNumber}`);
  parts.push(context.lastMove ? `Opponent's last move: ${context.lastMove}` : 'This is the first move of the game.');

  if (toggles.showHistory && context.moveHistory.length > 0) {
    parts.push('', `Game so far: ${context.moveHistory.join(' ')}`);
  }

  if (toggles.showLegalMoves) {
    parts.push('', `Legal moves: ${context.legalMoves.join(', ')}`);
  }

  if (player.linePrediction?.enabled) {
    parts.push(
      '',
      `Also predict ${player.linePrediction.count} plausible continuation line${player.linePrediction.count === 1 ? '' : 's'} up to ${player.linePrediction.depth} plies, starting with your chosen move.`,
    );
  }

  // P0 gets minimal prompting
  if (level === 'p0') {
    parts.push('', 'Your move.');
  } else {
    parts.push('', 'Choose your move.');
  }

  if (context.promptInjections && context.promptInjections.length > 0) {
    parts.push('', ...context.promptInjections);
  }

  const currentPrompt = parts.join('\n');

  // Merge into last user message if it exists to avoid consecutive user messages
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === 'user') {
    lastMsg.content += '\n\n' + currentPrompt;
  } else {
    messages.push({ role: 'user', content: currentPrompt });
  }

  return messages;
}

// --- Commentary ---

export interface CommentaryContext {
  fen: string;
  /** Position after the move was played. Used for consequence framing only. */
  resultingFen?: string;
  lastMove: string;
  lastMoveColor: 'w' | 'b';
  whiteModel: string;
  blackModel: string;
  moveHistory: string[];
  isCheck: boolean;
  isCapture: boolean;
  turnNumber: number;
  // Stockfish evaluation data (perfect information)
  stockfishEval?: {
    scoreCp: number;
    isMate: boolean;
    mateIn: number | null;
    bestMove: string;
    pv: string;
    depth: number;
  };
  // Previous eval for detecting blunders
  prevEvalCp?: number;
  // Actual engine first choice from the BEFORE position, when available.
  preMoveBestMove?: string;
  preMoveBestMoveSan?: string;
  // Previous commentary for continuity
  prevCommentary?: string;
  // Optional user question for interactive Q&A.
  userQuestion?: string;
  // Optional recent Q&A turns for conversational continuity.
  qaHistory?: { role: 'user' | 'assistant'; content: string }[];
  // When true, generate shorter speech-friendly text (no markdown).
  ttsMode?: boolean;
  /** Override the commentary system prompt (e.g. for historical game replay). */
  systemPromptOverride?: string;
  /** Verbosity level — controls commentary depth and length. */
  verbosity?: import('../engine/types').CommentaryVerbosity;
  /** Illegal moves the model tried before landing on this one (2+ = notable struggle). */
  illegalMovesAttempted?: string[];
  /** True if this model's output format was auto-downgraded from json_schema this session. */
  formatDowngraded?: boolean;
}

const COMMENTATOR_SYSTEM_PROMPT_BASE = `You are an expert chess commentator and teacher providing detailed analysis of a game between AI models (and possibly humans or engines). You have access to Stockfish engine evaluation.

Your audience is learning — they want to understand WHY moves are good or bad, not just what happened.

CRITICAL — MOVE AUTHORITY:
- Every move shown to you has been VALIDATED by the chess engine. The move IS legal and DID happen.
- Do NOT question whether a move is possible, legal, or correct notation. Accept it as fact.
- Do NOT say things like "this appears to be an error" or "there is no piece on that square" — the game engine is authoritative.
- Focus on WHY the move was played and what it means strategically, not on verifying the board state.

EVALUATION RULES:
- Stockfish eval is ALWAYS from White's perspective. Positive = White is better, negative = Black is better.
- A normal move by either side may shift eval by 0.1-0.5 pawns — this is ROUTINE, NOT a momentum shift.
- Only flag a move as significant if the eval changes by 1.0+ pawns in the WRONG direction for the mover (blunder) or RIGHT direction (brilliant).
- Do NOT say "tables are turning" or "momentum shifts" for normal eval fluctuations between turns.

MOVE QUALITY — Acknowledge and explain:
- When the move quality label is BLUNDER or INACCURACY, you MUST explicitly call it out — never gloss over a weak move or treat it as routine.
- Name the quality directly: "That's a blunder", "An inaccuracy", "A strong move".
- For BLUNDERs and INACCURACies: always explain what the player should have done instead. Reference the engine's best reply or principal variation when it shows a superior alternative. Explain the concrete cost — what tactical opportunity was missed, what weakness was created, or what advantage was thrown away.
- For STRONG MOVEs: acknowledge the quality and explain what makes it superior to the obvious continuations.
- Do NOT hedge or soften blunders. If a move loses material or ruins the position, say so plainly.

ENGINE CONTEXT LIMITATION:
- You are NOT given the engine's pre-move first choice for the side that just moved.
- The engine move you see is ONLY the best reply from the resulting position AFTER the played move.
- Never say the played move "matches", "misses", or "differs from" the engine's first choice unless a separate pre-move engine alternative is explicitly provided.
- Judge the played move using eval delta, position quality, and the resulting-position best reply only.
- If a separate "engine first choice from the BEFORE position" is explicitly provided, you MAY compare the played move against it.

BOARD ANNOTATIONS — Draw on the board with inline tags (stripped from speech/display automatically):
- [arrow e2 e4] or [arrow e2 e4 red] — arrow between squares (colors: green, red, yellow, blue, orange, purple, white, cyan)
- [highlight d5] or [highlight d5 red] — highlight a square
- [circle f3] or [circle f3 blue] — circle a square
Use 1-3 annotations per commentary to show threats, plans, or key squares. Place tags at the END of the sentence they relate to — NEVER inside a phrase. Text must read naturally if tags are removed.
GOOD: "The knight controls key central squares [arrow f3 d4 green] [arrow f3 e5 green]."
BAD: "The knight controls [highlight d4] and [highlight e5] central squares."

NATURAL-LANGUAGE ANNOTATION SCHEMA:
- When you name board geometry in prose, prefer these exact canonical forms:
  - piece placement: "queen on d2", "knight on f5"
  - piece movement: "queen to d2", "bishop from c4 to d5"
  - square focus: "pressure on f7", "targeting d6", "defending f7", "covering e4", "weak square e5"
  - lines and routes: "line from d2 to h6", "diagonal c2 to h7", "file on e-file"
- Keep prose natural, but use this vocabulary exactly when you want the board parser to pick it up.
- Tags remain optional and higher precision. The natural-language schema is additive, not a replacement.`;

const COMMENTATOR_STYLE_RICH = `
COMMENTARY STYLE — Be thorough and educational:
1. Name the opening/variation if still in book.
2. Explain the strategic idea behind the move.
3. Teach positional concepts when relevant: pawn structure, piece activity, king safety, space advantage.
4. Highlight tactical motifs when they appear: pins, forks, skewers, discovered attacks.
5. Use eval delta to judge move quality first. Treat the resulting-position best reply as optional downstream context, not the main lens.
6. Do not lead normal commentary with "the engine preferred..." unless that reply is genuinely the clearest way to explain the move's consequence.
7. Look ahead — what are the critical decisions coming up?

FORMAT — Use rich Markdown:
- Use **bold** for key terms and player names
- Use *italics* for chess concepts and variations
- ALWAYS write chess moves in standard algebraic notation (e.g. Nf3, Bxe5, O-O, e4) — do NOT wrap them in code backticks or other formatting. Plain SAN notation only, so they stand out visually.
- When referencing squares or pieces, use notation: "the knight on f3", "controlling d5".
- Structure longer analysis with line breaks between ideas
- Use > blockquotes for particularly instructive observations

Write 4-8 sentences. Be substantive, not performative. Teach the reader something with every commentary. Vary your focus.`;

const COMMENTATOR_STYLE_TTS = `
COMMENTARY STYLE — Live spoken broadcast narration:
1. Cover the move with good analysis — name the strategic idea, explain why it matters, note key consequences.
2. 3-5 sentences. Enough to teach, not so much you ramble.
3. Conversational, punchy sentences. Natural speech rhythm.
4. Default to explaining the played move on its own merits from the board before the move.
5. You may reference the engine's best reply from the resulting position only when it clearly illustrates the consequence of the move. Do NOT claim the played move matched or missed an engine first choice unless that pre-move alternative was explicitly provided.
6. Narration pace controls the stream — the audience sees what you describe when you describe it.

FORMAT — Plain spoken text ONLY:
- NO markdown (no bold, italics, code blocks, blockquotes)
- ALWAYS use standard algebraic notation exactly as given (Nf3, Bxe5, O-O, e4) when naming the actual played move.
- You MAY use the natural-language annotation schema for board ideas and geometry, such as "queen on d2", "pressure on f7", or "line from d2 to h6".
- Numbers spoken naturally: "plus one point five" not "+1.50"

Filler commentary handles extended analysis, education, and audience engagement between your move commentaries.`;

const VERBOSITY_DIRECTIVES: Record<string, string> = {
  brief: `\n\nVERBOSITY: BRIEF — 1-2 sentences max. State the move, the key idea, done. No filler, no tangents. Punchy and fast.`,
  standard: `\n\nVERBOSITY: STANDARD — 3-5 sentences. Cover the move, the strategic idea, one teaching point. Balanced pace.`,
  detailed: `\n\nVERBOSITY: DETAILED — 6-10 sentences. Explore the position deeply. Explain multiple candidate moves, compare plans, teach positional and tactical concepts. Connect to the broader game narrative.`,
  deep: `\n\nVERBOSITY: DEEP DIVE — Comprehensive analysis, 10+ sentences. Full positional breakdown, variation trees, historical parallels, endgame considerations. Leave no stone unturned. This is a masterclass.`,
};

/** Map verbosity level to max tokens for the commentary LLM call. */
export const VERBOSITY_TOKEN_MAP: Record<string, number> = {
  brief: 500,
  standard: 1000,
  detailed: 4000,
  deep: 64000,
};

function getCommentatorSystemPrompt(ttsMode?: boolean, verbosity?: string): string {
  const verbDir = verbosity ? (VERBOSITY_DIRECTIVES[verbosity] || '') : '';
  return COMMENTATOR_SYSTEM_PROMPT_BASE + (ttsMode ? COMMENTATOR_STYLE_TTS : COMMENTATOR_STYLE_RICH) + verbDir;
}

/**
 * Build a commentary system prompt for a chess LESSON.
 *
 * Differs from the historical prompt in framing: instead of a retrospective
 * narrator who knows the result, the LLM is positioned as a TEACHER
 * walking through an opening / technique / pattern in first person.
 * Each move is treated as a teaching beat — "I'm playing X because Y,
 * the idea is Z, common student mistake is W." The lesson context
 * carries the topic and the teacher persona.
 *
 * The PGN being played is still pre-determined (this is replay-mode
 * lesson playback), but the prompt frames it as if the AI is choosing
 * each move live as part of the lesson.
 */
export function getLessonCommentatorPrompt(lessonContext: string, ttsMode?: boolean, verbosity?: string): string {
  const lessonPreamble = `You are an AI chess teacher giving a LESSON to a student audience. You are PLAYING the game while you explain — each move on the board is YOUR move (or, when it's the opponent's turn, you analyze what they played and why).

LESSON CONTEXT:
${lessonContext}

Voice: first person, teacher to student. "I'm playing e4 because...", "Now I would expect Black to...", "The reason this move is so important is...".
Do NOT reference "the game", "the players", or "the result" — there is no historical match here, this is a live demonstration.
Focus on the IDEA behind each move, the pattern being taught, and the kinds of mistakes a learning player would make in similar positions.
When the opponent plays, briefly explain what they did and how it affects your plan.

`;
  const verbDir = verbosity ? (VERBOSITY_DIRECTIVES[verbosity] || '') : '';
  return lessonPreamble + COMMENTATOR_SYSTEM_PROMPT_BASE + (ttsMode ? COMMENTATOR_STYLE_TTS : COMMENTATOR_STYLE_RICH) + verbDir;
}

/**
 * Build a commentary system prompt for historical game replay.
 * Prepends historical context to the standard commentator prompt so the LLM
 * can foreshadow, build dramatic tension, and reference the game's significance.
 */
export function getHistoricalCommentatorPrompt(historicalContext: string, ttsMode?: boolean, verbosity?: string): string {
  const historyPreamble = `You are narrating a HISTORICAL chess game — a famous classic being replayed for a modern audience.

HISTORICAL CONTEXT:
${historicalContext}

The moves have already been played. You have the benefit of hindsight — you know the result.
Use this to build dramatic tension. Foreshadow brilliant moves. Build anticipation for
critical moments. Reference the historical significance when relevant.

Your audience may know the result but not the journey. Make them appreciate the depth
of play that made this game famous.

`;
  const verbDir = verbosity ? (VERBOSITY_DIRECTIVES[verbosity] || '') : '';
  return historyPreamble + COMMENTATOR_SYSTEM_PROMPT_BASE + (ttsMode ? COMMENTATOR_STYLE_TTS : COMMENTATOR_STYLE_RICH) + verbDir;
}

export function buildCommentaryPrompt(ctx: CommentaryContext): ChatMessage[] {
  const mover = ctx.lastMoveColor === 'w' ? ctx.whiteModel : ctx.blackModel;
  const moverColor = ctx.lastMoveColor === 'w' ? 'White' : 'Black';
  const opponent = ctx.lastMoveColor === 'w' ? ctx.blackModel : ctx.whiteModel;
  const opponentColor = ctx.lastMoveColor === 'w' ? 'Black' : 'White';

  const parts = [
    `Position BEFORE the move (FEN): ${ctx.fen}`,
    '',
    'Board BEFORE the move:',
    fenToAsciiBoard(ctx.fen),
    '',
    `Move ${ctx.turnNumber}: ${mover} (${moverColor}) played ${ctx.lastMove}${ctx.isCheck && !ctx.lastMove.includes('+') ? '+' : ''}${ctx.isCapture ? ' (capture)' : ''}`,
    `Opponent: ${opponent} (${opponentColor})`,
    '',
    `Full game so far: ${ctx.moveHistory.join(' ')}`,
  ];

  if (ctx.resultingFen) {
    parts.push('', `Resulting position AFTER the move (FEN): ${ctx.resultingFen}`);
    parts.push('IMPORTANT: Explain why the move was chosen from the BEFORE position above. Use the resulting position only to describe consequences.');
  }

  // Add Stockfish evaluation with clear framing
  if (ctx.stockfishEval) {
    const ev = ctx.stockfishEval;
    const evalPawns = ev.scoreCp / 100;

    let evalStr: string;
    let positionSummary: string;
    if (ev.isMate && ev.mateIn !== null) {
      evalStr = `Mate in ${Math.abs(ev.mateIn)} for ${ev.mateIn > 0 ? 'White' : 'Black'}`;
      positionSummary = 'DECISIVE — forced mate on the board';
    } else if (Math.abs(ev.scoreCp) < 30) {
      evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
      positionSummary = 'EQUAL — balanced position';
    } else if (Math.abs(ev.scoreCp) < 100) {
      evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
      positionSummary = `SLIGHT EDGE for ${ev.scoreCp > 0 ? 'White' : 'Black'}`;
    } else if (Math.abs(ev.scoreCp) < 300) {
      evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
      positionSummary = `CLEAR ADVANTAGE for ${ev.scoreCp > 0 ? 'White' : 'Black'}`;
    } else {
      evalStr = `${evalPawns > 0 ? '+' : ''}${evalPawns.toFixed(2)}`;
      positionSummary = `WINNING for ${ev.scoreCp > 0 ? 'White' : 'Black'}`;
    }

    parts.push('', `--- Stockfish (depth ${ev.depth}) ---`);
    parts.push(`Eval: ${evalStr} (always from White's perspective)`);
    parts.push(`Position: ${positionSummary}`);
    const nextMover = ctx.lastMoveColor === 'w' ? 'Black' : 'White';
    parts.push(`Possible best reply from the resulting position: ${ev.bestMove} (UCI — this is ${nextMover}'s recommended reply AFTER ${ctx.lastMove} was played, NOT an alternative to ${ctx.lastMove})`);
    parts.push(`Principal variation: ${ev.pv}`);
    parts.push(`IMPORTANT: The eval and reply above reflect the position AFTER ${ctx.lastMove}. Judge move quality using the eval delta (prev vs current score), not by comparing ${ctx.lastMove} to the reply shown above.`);
    if (ctx.preMoveBestMove) {
      const preMoveLabel = ctx.preMoveBestMoveSan ? `${ctx.preMoveBestMoveSan} (${ctx.preMoveBestMove})` : ctx.preMoveBestMove;
      parts.push(`Engine first choice from the BEFORE position for ${moverColor}: ${preMoveLabel}`);
      parts.push(`You may compare ${ctx.lastMove} to that actual pre-move engine choice above, because it was explicitly provided.`);
    } else {
      parts.push(`Do NOT claim ${ctx.lastMove} matched or missed an engine first choice for ${moverColor}; that pre-move alternative was not provided.`);
    }
    parts.push(`If the eval shift is routine, explain the move's idea directly and mention engine lines only when they teach a concrete consequence.`);

    // Detect actual blunders/brilliancies using directional delta
    if (ctx.prevEvalCp !== undefined) {
      const delta = ev.scoreCp - ctx.prevEvalCp;
      const isGoodForMover = ctx.lastMoveColor === 'w' ? delta : -delta;
      const absDelta = Math.abs(delta);

      if (absDelta < 50) {
        parts.push(`Move quality: BOOK/NORMAL (eval shifted ${(delta / 100).toFixed(1)} — negligible)`);
      } else if (isGoodForMover < -150) {
        parts.push(`BLUNDER: ${moverColor} lost ${(absDelta / 100).toFixed(1)} pawns of eval with this move`);
      } else if (isGoodForMover > 150) {
        parts.push(`STRONG MOVE: ${moverColor} gained ${(absDelta / 100).toFixed(1)} pawns of eval`);
      } else if (isGoodForMover < -50) {
        parts.push(`INACCURACY: ${moverColor} lost ${(absDelta / 100).toFixed(1)} pawns of eval`);
      } else {
        parts.push(`Move quality: SOLID (eval shifted ${(delta / 100).toFixed(1)} — within normal range)`);
      }
    }
  }

  // Include previous commentary for continuity
  if (ctx.prevCommentary) {
    parts.push('', `Your previous commentary: "${ctx.prevCommentary}"`);
    parts.push('Do not repeat yourself. Build on the narrative or shift focus to a new aspect of the position.');
  }
  if (ctx.qaHistory && ctx.qaHistory.length > 0) {
    parts.push('', 'Recent Q&A context:');
    for (const turn of ctx.qaHistory.slice(-6)) {
      parts.push(`${turn.role === 'user' ? 'User' : 'Commentator'}: ${turn.content}`);
    }
  }

  // Notable model behavior (for commentary flavor)
  if (ctx.illegalMovesAttempted && ctx.illegalMovesAttempted.length >= 2) {
    parts.push('', `NOTABLE: Before playing this move, ${mover} (${moverColor}) required ${ctx.illegalMovesAttempted.length} attempts. Illegal/failed attempts: ${ctx.illegalMovesAttempted.join(', ')}. This is worth mentioning — the model struggled to find a legal move.`);
  }
  if (ctx.formatDowngraded) {
    parts.push(`NOTABLE: ${mover}'s output format was automatically downgraded this game (it failed to produce valid structured output). You may mention this as a sign of the model's behavior under pressure.`);
  }

  if (ctx.userQuestion) {
    parts.push('', `User question: ${ctx.userQuestion}`);
    parts.push('Answer the user question directly and concretely. Use markdown and cite specific moves/ideas from this position.');
  } else {
    parts.push('', 'Provide detailed, educational commentary on this move. Explain strategic and tactical ideas. Teach the reader something.');
  }

  return [
    { role: 'system', content: ctx.systemPromptOverride || getCommentatorSystemPrompt(ctx.ttsMode, ctx.verbosity) },
    { role: 'user', content: parts.join('\n') },
  ];
}

// --- Retry prompt ---

/** Describes why the model's previous move attempt failed. */
export type RetryReason =
  | { kind: 'illegal'; move: string }   // model played an illegal move
  | { kind: 'empty' }                   // model returned empty content (e.g. finish_reason=length)
  | { kind: 'parse_error' };            // model returned unparseable content

/**
 * Build a contextually appropriate retry prompt based on why the previous attempt failed.
 * Produces a more targeted message than the generic "ILLEGAL" prompt.
 */
export function buildRetryPromptForReason(
  player: PlayerConfig,
  context: TurnContext,
  reason: RetryReason,
): ChatMessage[] {
  const messages = buildChessPrompt(player, context);
  const legalList = context.legalMoves.join(', ');

  if (reason.kind === 'illegal') {
    return buildRetryPrompt(player, context, reason.move);
  }

  if (reason.kind === 'empty') {
    // Do NOT reuse the full chess prompt — that's why the model ran out of tokens.
    // Send a minimal system + one-line user prompt so the model can respond immediately.
    const colorName = context.color === 'w' ? 'White' : 'Black';
    return [
      {
        role: 'system' as const,
        content: 'You are playing chess. Output only valid JSON. Be extremely brief.',
      },
      {
        role: 'user' as const,
        content: `Chess position (FEN): ${context.fen}\nYou are ${colorName}. Legal moves: ${legalList}\nYour previous response was cut off. Output ONLY: {"move": "<san>"} where <san> is one of the legal moves above. No reasoning.`,
      },
    ];
  }

  // parse_error
  messages.push({
    role: 'user',
    content: `Your previous response could not be parsed as a valid move. Output ONLY: {"move": "<san>"} where <san> is one of: ${legalList}. No extra text.`,
  });
  return messages;
}

export function buildRetryPrompt(
  player: PlayerConfig,
  context: TurnContext,
  previousIllegalMove: string,
): ChatMessage[] {
  const messages = buildChessPrompt(player, context);
  const format = resolveFormat(player);
  const level = normalizePromptLevel(player.promptLevel);
  const toggles = resolveToggles(player);
  const isActFirst = format === 'B' || format === 'D';

  // Append the illegal move as a failed assistant attempt, then a correction user message
  const retryObj = isActFirst
    ? { move: previousIllegalMove, reasoning: 'Previous attempt was illegal. Reanalyzing from scratch.' }
    : { reasoning: 'Previous attempt was illegal. Reanalyzing from scratch.', move: previousIllegalMove };
  messages.push({
    role: 'assistant',
    content: JSON.stringify(retryObj),
  });

  const retryContent = (level === 'p0' || level === 'p1') && !toggles.showLegalMoves
    ? `"${previousIllegalMove}" is ILLEGAL. Re-analyze the position from scratch, carefully re-read the FEN, and produce a fresh full response with updated reasoning and a legal move.`
    : `"${previousIllegalMove}" is ILLEGAL. Re-analyze from scratch and produce a fresh full response with updated reasoning. You MUST choose from these legal moves ONLY: ${context.legalMoves.join(', ')}`;
  messages.push({
    role: 'user',
    content: retryContent,
  });
  return messages;
}

// ---- Puzzle Break ----

export function buildPuzzlePrompt(
  puzzle: { fen: string; rating: number; themes: string[]; solution: string[] },
  thinkingModelName: string,
  elapsedMs: number,
): ChatMessage[] {
  const elapsedSec = Math.round(elapsedMs / 1000);
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  return [
    {
      role: 'system',
      content: `You are a live chess stream host with hands — you can physically move pieces on the board, draw arrows, and highlight squares for the audience. Solve the puzzle turn by turn: explain each move in 1-2 sentences of plain conversational prose, then place it with [move from to] (e.g. [move f3 g5]). Use board annotations to teach visually: [arrow e2 e4] draws a green arrow, [highlight d5] highlights a square, [circle f3] circles one. Place annotation tags at the end of sentences — text reads naturally without them. No markdown. Sound like an engaged broadcaster.`,
    },
    {
      role: 'user',
      content: `While ${thinkingModelName} ponders their next move (${elapsedSec} seconds so far), let's solve a puzzle for the audience!

Position (FEN): ${puzzle.fen}
Rating: ${puzzle.rating} | Themes: ${themeList}
Solution (UCI): ${puzzle.solution.join(', ')}

Walk through each move one at a time. For each: explain the idea, annotate any key squares or threats with [arrow]/[highlight], then play the move with [move from to]. Alternate sides. After the final move, confirm it's solved. Keep it under 220 words total.`,
    },
  ];
}

/**
 * Per-turn prompt for the multi-turn puzzle break flow.
 * Called once per model turn (solutionIdx 0, 2, 4…).
 * Gives the model the current FEN, the correct move to demonstrate, and past context.
 */
export function buildPuzzleTurnPrompt(
  puzzle: { fen: string; rating: number; themes: string[]; solution: string[] },
  currentFen: string,
  solutionIdx: number,
  pastTurns: Array<{ isModel: boolean; san: string; commentary: string }>,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const modelTurnNumber = Math.floor(solutionIdx / 2) + 1;
  const totalModelMoves = Math.ceil(puzzle.solution.length / 2);
  const thisUci = puzzle.solution[solutionIdx];

  const pastContext = pastTurns.length > 0
    ? '\n\nSo far:\n' + pastTurns.map(t =>
        t.isModel
          ? `▶ You played ${t.san} — ${t.commentary || '(no commentary)'}`
          : `⚡ Opponent replied ${t.san}`,
      ).join('\n')
    : '';

  const isLast = solutionIdx === puzzle.solution.length - 1;
  const closingNote = isLast
    ? ' This is the final move — confirm the puzzle is solved and summarize what made this combination work.'
    : '';

  return [
    {
      role: 'system',
      content: `You are a live chess stream host with hands — you can physically move pieces on the board, draw arrows, and highlight squares for the audience.\n\nYour job this turn: explain in 1-3 sentences WHY the move is strong, annotate visually, then physically play it.\n\nCommands (embed in your prose):\n- [move e2 e4] to play a piece (required — always end your turn with this)\n- [arrow e2 e4] to draw a green arrow\n- [highlight d5] to highlight a key square\n- [circle f3] to circle a piece\n\nNo markdown. Sound like an engaged broadcaster. Be concise.`,
    },
    {
      role: 'user',
      content: `Puzzle ★${puzzle.rating} | ${themeList}${pastContext}\n\nCurrent position (FEN): ${currentFen}\n\nMove ${modelTurnNumber} of ${totalModelMoves}: The correct move is ${thisUci} (UCI). Explain the idea, annotate key squares, then play it with [move].${closingNote}`,
    },
  ];
}

export function buildPuzzleBreakIntroPrompt(
  thinkingModelName: string,
  thinkingReasoningEffort: string,
): ChatMessage[] {
  const normalizedEffort = thinkingReasoningEffort === 'xhigh' ? 'extra-high' : thinkingReasoningEffort;
  const introAngles = [
    'lean into broadcast anticipation',
    'sound playful and lightly teasing',
    'frame it like a quick tactical detour',
    'make it feel like a live producer toss to a feature segment',
    'keep it dry and confident, not jokey',
  ];
  const bannedPhrases = [
    'while we wait',
    'quick puzzle break',
    'brought-to-you-by',
    'slip into',
    'these models take a little longer',
  ];
  const angle = introAngles[Math.floor(Math.random() * introAngles.length)];
  return [
    {
      role: 'system',
      content: 'You are a live chess commentator. Deliver a short spoken segue into a pop-up puzzle segment while another model thinks. No markdown. Keep it to 2 sentences. Vary your phrasing. Do not sound canned, promotional, or repetitive.',
    },
    {
      role: 'user',
      content: `The live game is waiting on ${thinkingModelName}, which is using ${normalizedEffort} reasoning. In a conversational broadcast tone, toss to a puzzle segment and make the wording feel fresh. Style target: ${angle}. Avoid these phrases entirely: ${bannedPhrases.join(', ')}.`,
    },
  ];
}

export function buildPuzzleSetupPrompt(
  puzzle: { fen: string; rating: number; themes: string[] },
  currentFen: string,
  oracleContext?: string,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const sideToMove = currentFen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const hostColor = puzzle.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const defendingColor = hostColor === 'White' ? 'Black' : 'White';
  return [
    {
      role: 'system',
      content: 'You are the live chess commentator for a pop-up puzzle break. Start the response with exactly "<Color> to move." Then give the audience a rich setup read on the position before the tactic starts. Frame the position from the perspective of the winning side: explain the tactical motif, the strategic imbalance, the loose pieces or weak squares, and the defensive resources that are failing. If Stockfish oracle context is provided, treat it as ground truth for the evaluation, best line, and credible alternatives. Use the legal move list to mention one or two serious candidate tries, but keep the spotlight on the puzzle idea rather than listing moves mechanically. If you mention the engine line, summarize only the key branch or first 2-4 plies in prose; never dump a long SAN chain. Sound like a strong live analyst: focus on what squares matter, what piece becomes more active or passive, what pawn break or tactical route is being prepared, and why the move changes the character of the position. Be concrete and instructive, like a strong coach or engine explainer, but do not reveal the exact first move yet. Do not restate the FEN, do not list pieces square by square, and do not narrate the board mechanically. Aim for 4-6 sentences. Prefer at least one visual board annotation whenever there is a concrete square, piece, diagonal, file, or mating net to point out. You may add board annotations in exact tag syntax like [highlight g8], [circle f7], [arrow d2 h6], and you should also prefer canonical natural-language geometry phrases like "queen on d2", "pressure on f7", "bishop from c4 to d5", or "line from d2 to h6" when they fit naturally. Do not invent synonyms if you want the board parser to catch the idea. Do not use XML-style tags like [highlight]g8[/highlight]. Do not use [move]. No markdown.',
    },
    {
      role: 'user',
      content: `Puzzle ★${puzzle.rating} | ${themeList}\n\nCurrent position (FEN): ${currentFen}\n\n${sideToMove} is to move. ${hostColor} is the attacking side and ${defendingColor} is defending. Set up the tactic for the audience without giving away the first move.${oracleContext ? `\n\nStockfish oracle context:\n${oracleContext}` : ''}`,
    },
  ];
}

export function buildPuzzleCommentaryTurnPrompt(
  puzzle: { fen: string; rating: number; themes: string[]; solution: string[] },
  currentFen: string,
  solutionIdx: number,
  pastTurns: Array<{ side: 'w' | 'b'; san: string; commentary: string }>,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const sideToMove = currentFen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const hostColor = puzzle.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const defendingColor = hostColor === 'White' ? 'Black' : 'White';
  const thisUci = puzzle.solution[solutionIdx];
  const moveNumber = solutionIdx + 1;
  const totalMoves = puzzle.solution.length;
  const pastContext = pastTurns.length > 0
    ? '\n\nSo far:\n' + pastTurns.map(t => `${t.side === 'w' ? 'White' : 'Black'} played ${t.san} — ${t.commentary || '(no commentary)'}`).join('\n')
    : '';
  const isLast = solutionIdx === puzzle.solution.length - 1;
  const moverPerspective = sideToMove === hostColor
    ? `${hostColor} is the winning side here, so reinforce how this move advances the attack or conversion.`
    : `${sideToMove} is defending here, so explain the move as forced resistance, damage control, or the best practical try against the tactic.`;

  return [
    {
      role: 'system',
      content: `You are the live chess commentator for a pop-up puzzle break. Walk the audience through every move in order. ${hostColor} is the winning puzzle side and ${defendingColor} is defending. ${moverPerspective} Be concrete: explain the tactical point, the strategic consequence, the forcing nature of the move, and when useful mention the best defensive alternative or why the reply is forced. Sound like a strong analyst, not a generic host. Do not restate the full board or talk in vague filler. Aim for 3-5 sentences when there is real content. Prefer 1-3 visual annotations whenever there is a concrete route, target square, pinned piece, mating net, or overloaded defender to show. Add useful annotations, and end with exactly one [move from to] tag so the board can advance. The move tag must encode the exact instructed move ${thisUci} and no other move. Allowed annotation syntax only: [highlight g8], [circle f7], [arrow d2 h6]. Also prefer canonical natural-language geometry phrases like "queen on d2", "queen to d2", "pressure on f7", "targeting d6", or "line from d2 to h6" when they fit naturally. Do not invent synonyms if you want the board parser to catch the idea. Do not use XML-style tags like [highlight]g8[/highlight]. No markdown.`,
    },
    {
      role: 'user',
      content: `Puzzle ★${puzzle.rating} | ${themeList}${pastContext}\n\nCurrent position (FEN): ${currentFen}\n\nMove ${moveNumber} of ${totalMoves}. ${sideToMove} to move. The correct move is ${thisUci} (UCI). Narrate it like a host guiding viewers through the tactic.${isLast ? ' After this move, confirm the puzzle is solved.' : ''}`,
    },
  ];
}

export function buildPuzzleOutroPrompt(
  puzzle: { fen: string; rating: number; themes: string[] },
  solvedTurns: Array<{ side: 'w' | 'b'; san: string; commentary: string }>,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const hostColor = puzzle.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const defendingColor = hostColor === 'White' ? 'Black' : 'White';
  const lineSummary = solvedTurns.map(t => `${t.side === 'w' ? 'White' : 'Black'}: ${t.san}`).join(', ');
  return [
    {
      role: 'system',
      content: `You are a live chess commentator closing out a pop-up puzzle break. In 2-3 sentences, summarize the key tactical motif, the strategic point of the line, and how ${defendingColor} ran out of resources before segueing back to the live broadcast. Sound insightful, not generic. If you annotate, use only this exact syntax: [highlight g8], [circle f7], [arrow d2 h6]. Do not use XML-style tags like [highlight]g8[/highlight]. Do not use [move]. Do not use markdown.`,
    },
    {
      role: 'user',
      content: `The puzzle is solved. Puzzle ★${puzzle.rating} | ${themeList}\n\nSolution line: ${lineSummary || '(none)'}\n\nGive a quick wrap-up for the audience and bridge back to the live game.`,
    },
  ];
}

export function buildPuzzleSetupPromptWithOracle(
  puzzle: { fen: string; rating: number; themes: string[] },
  currentFen: string,
  oracleContext?: string,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const sideToMove = currentFen.split(' ')[1] === 'w' ? 'White' : 'Black';
  return [
    {
      role: 'system',
      content: `${getCommentatorSystemPrompt(true, 'detailed')}\n\nYou are currently hosting a pop-up puzzle break, but you should sound like the same main broadcast commentator. Start the response with exactly "<Color> to move." Then give the audience a rich setup read on the position before the tactic starts. Frame the position from the perspective of the winning side: explain the tactical motif, the strategic imbalance, the loose pieces or weak squares, and the defensive resources that are failing. If Stockfish oracle context is provided, treat it as ground truth for the evaluation, best line, and credible alternatives. Use the legal move list to mention one or two serious candidate tries, but keep the spotlight on the puzzle idea rather than listing moves mechanically. Be concrete and instructive, like a strong coach or engine explainer, but do not reveal the exact first move yet. Do not restate the FEN, do not list pieces square by square, and do not narrate the board mechanically. Prefer at least one visual board annotation whenever there is a concrete square, piece, diagonal, file, or mating net to point out. You may add board annotations in exact tag syntax like [highlight g8], [circle f7], [arrow d2 h6], and you should also prefer canonical natural-language geometry phrases like "queen on d2", "pressure on f7", "bishop from c4 to d5", or "line from d2 to h6" when they fit naturally. Do not invent synonyms if you want the board parser to catch the idea. Do not use XML-style tags like [highlight]g8[/highlight]. Do not use [move]. No markdown.`,
    },
    {
      role: 'user',
      content: `Puzzle ${puzzle.rating} | ${themeList}\n\nCurrent position (FEN): ${currentFen}\n\n${sideToMove} is to move. Set up the tactic for the audience without giving away the first move.${oracleContext ? `\n\nStockfish oracle context:\n${oracleContext}` : ''}`,
    },
  ];
}

export function buildPuzzleCommentaryTurnPromptWithOracle(
  puzzle: { fen: string; rating: number; themes: string[]; solution: string[] },
  currentFen: string,
  solutionIdx: number,
  pastTurns: Array<{ side: 'w' | 'b'; san: string; commentary: string }>,
  oracleContext?: string,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const sideToMove = currentFen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const hostColor = puzzle.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const defendingColor = hostColor === 'White' ? 'Black' : 'White';
  const thisUci = puzzle.solution[solutionIdx];
  const moveNumber = solutionIdx + 1;
  const totalMoves = puzzle.solution.length;
  const recentTurns = pastTurns.slice(-2);
  const pastContext = recentTurns.length > 0
    ? '\n\nRecent line so far:\n' + recentTurns
      .map((t) => `${t.side === 'w' ? 'White' : 'Black'} played ${t.san}.`)
      .join('\n')
    : '';
  const isLast = solutionIdx === puzzle.solution.length - 1;
  const moverPerspective = sideToMove === hostColor
    ? `${hostColor} is the winning side here, so reinforce how this move advances the attack or conversion.`
    : `${sideToMove} is defending here, so explain the move as forced resistance, damage control, or the best practical try against the tactic.`;

  return [
    {
      role: 'system',
      content: `${getCommentatorSystemPrompt(true, 'detailed')}\n\nYou are currently hosting a pop-up puzzle break, but you should sound like the same main broadcast commentator. Walk the audience through every move in order. ${hostColor} is the winning puzzle side and ${defendingColor} is defending. ${moverPerspective} If Stockfish oracle context is provided, use it as hard evidence: reference the evaluation, the principal variation, the move quality, and the serious alternatives from the legal move list. Use that oracle context to explain why this move is best, forced, or inferior, but still keep the narration centered on the puzzle's intended line. Mention the engine line only as a short tactical branch or first 2-4 key plies, and explain the idea in prose; never recite a long SAN list. Lead with what the move does to the position: which squares become critical, which piece becomes active or overloaded, what line or file opens, what defender is removed, and what threat is now in the air. Do not restate the full board or talk in vague filler. Prefer 1-3 visual annotations whenever there is a concrete route, target square, pinned piece, mating net, or overloaded defender to show. Add useful annotations, and end with exactly one [move from to] tag so the board can advance. The move tag must encode the exact instructed move ${thisUci} and no other move. Allowed annotation syntax only: [highlight g8], [circle f7], [arrow d2 h6]. Also prefer canonical natural-language geometry phrases like "queen on d2", "queen to d2", "pressure on f7", "targeting d6", or "line from d2 to h6" when they fit naturally. Do not invent synonyms if you want the board parser to catch the idea. Do not use XML-style tags like [highlight]g8[/highlight]. No markdown.`,
    },
    {
      role: 'user',
      content: `Puzzle ${puzzle.rating} | ${themeList}${pastContext}\n\nCurrent position (FEN): ${currentFen}\n\nMove ${moveNumber} of ${totalMoves}. ${sideToMove} to move. The correct move is ${thisUci} (UCI). Narrate it like a host guiding viewers through the tactic.${isLast ? ' After this move, confirm the puzzle is solved.' : ''}${oracleContext ? `\n\nStockfish oracle context:\n${oracleContext}` : ''}`,
    },
  ];
}

export function buildPuzzleOutroPromptWithOracle(
  puzzle: { fen: string; rating: number; themes: string[] },
  solvedTurns: Array<{ side: 'w' | 'b'; san: string; commentary: string }>,
  oracleContext?: string,
): ChatMessage[] {
  const themeList = puzzle.themes.slice(0, 4).join(', ');
  const hostColor = puzzle.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const defendingColor = hostColor === 'White' ? 'Black' : 'White';
  const lineSummary = solvedTurns.map(t => `${t.side === 'w' ? 'White' : 'Black'}: ${t.san}`).join(', ');
  return [
    {
      role: 'system',
      content: `${getCommentatorSystemPrompt(true, 'standard')}\n\nYou are closing out a pop-up puzzle break, but you should sound like the same main broadcast commentator. In 2-4 sentences, summarize the key tactical motif, the strategic point of the line, and how ${defendingColor} ran out of resources before segueing back to the live broadcast. If Stockfish oracle context is provided, use it to anchor the verdict, the decisive swing, and the final evaluation. If you mention the engine route, keep it to a short practical branch, not a long move dump. If you annotate, use only this exact syntax: [highlight g8], [circle f7], [arrow d2 h6]. Do not use XML-style tags like [highlight]g8[/highlight]. Do not use [move]. Do not use markdown.`,
    },
    {
      role: 'user',
      content: `The puzzle is solved. Puzzle ${puzzle.rating} | ${themeList}\n\nSolution line: ${lineSummary || '(none)'}\n\nGive a quick wrap-up for the audience and bridge back to the live game.${oracleContext ? `\n\nStockfish oracle context:\n${oracleContext}` : ''}`,
    },
  ];
}
