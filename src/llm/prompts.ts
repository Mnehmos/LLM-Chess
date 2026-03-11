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

BOARD ANNOTATIONS — Draw on the board with inline tags (stripped from speech/display automatically):
- [arrow e2 e4] or [arrow e2 e4 red] — arrow between squares (colors: green, red, yellow, blue, orange, purple, white, cyan)
- [highlight d5] or [highlight d5 red] — highlight a square
- [circle f3] or [circle f3 blue] — circle a square
Use 1-3 annotations per commentary to show threats, plans, or key squares. Place tags at the END of the sentence they relate to — NEVER inside a phrase. Text must read naturally if tags are removed.
GOOD: "The knight controls key central squares [arrow f3 d4 green] [arrow f3 e5 green]."
BAD: "The knight controls [highlight d4] and [highlight e5] central squares."`;

const COMMENTATOR_STYLE_RICH = `
COMMENTARY STYLE — Be thorough and educational:
1. Name the opening/variation if still in book.
2. Explain the strategic idea behind the move.
3. Teach positional concepts when relevant: pawn structure, piece activity, king safety, space advantage.
4. Highlight tactical motifs when they appear: pins, forks, skewers, discovered attacks.
5. Compare to the engine's best move when the played move differs significantly.
6. Look ahead — what are the critical decisions coming up?

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
4. ALWAYS reference the engine's recommended move and compare it to what was played. If they match, say so briefly. If they differ, explain why the deviation was good, neutral, or a mistake.
5. Narration pace controls the stream — the audience sees what you describe when you describe it.

FORMAT — Plain spoken text ONLY:
- NO markdown (no bold, italics, code blocks, blockquotes)
- ALWAYS use standard algebraic notation exactly as given (Nf3, Bxe5, O-O, e4). Never paraphrase as "knight to f3".
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
    `Position (FEN): ${ctx.fen}`,
    '',
    'Board:',
    fenToAsciiBoard(ctx.fen),
    '',
    `Move ${ctx.turnNumber}: ${mover} (${moverColor}) played ${ctx.lastMove}${ctx.isCheck && !ctx.lastMove.includes('+') ? '+' : ''}${ctx.isCapture ? ' (capture)' : ''}`,
    `Opponent: ${opponent} (${opponentColor})`,
    '',
    `Full game so far: ${ctx.moveHistory.join(' ')}`,
  ];

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
    parts.push(`Engine's top move: ${ev.bestMove} (UCI notation)`);
    parts.push(`Best line (PV): ${ev.pv}`);
    parts.push(`Player played: ${ctx.lastMove} — always compare this to the engine's top move above and explain if it matches, deviates, or is a blunder/brilliancy.`);

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
    ? { move: previousIllegalMove, reasoning: 'I attempted this move.' }
    : { reasoning: 'I attempted this move.', move: previousIllegalMove };
  messages.push({
    role: 'assistant',
    content: JSON.stringify(retryObj),
  });

  const retryContent = (level === 'p0' || level === 'p1') && !toggles.showLegalMoves
    ? `"${previousIllegalMove}" is ILLEGAL. Carefully re-read the FEN and determine the legal moves yourself.`
    : `"${previousIllegalMove}" is ILLEGAL. You MUST choose from these legal moves ONLY: ${context.legalMoves.join(', ')}`;
  messages.push({
    role: 'user',
    content: retryContent,
  });
  return messages;
}
