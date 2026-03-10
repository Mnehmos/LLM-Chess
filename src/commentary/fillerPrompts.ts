import type { ChatMessage } from '../llm/prompts';
import type { QueuedMove } from './commentaryQueue';

export type FillerCategory =
  | 'position_analysis'
  | 'prediction'
  | 'model_comparison'
  | 'game_recap'
  | 'chess_education'
  | 'channel_plug'
  | 'audience_engagement';

export interface FillerPromptTemplate {
  category: FillerCategory;
  /** Weight for random selection (higher = more likely). */
  weight: number;
  /** Min turns into the game before this filler is available. */
  minTurn?: number;
  /** Build the user message given current game state. */
  build: (ctx: FillerContext) => string;
}

export interface FillerContext {
  fen: string;
  moveHistory: string[];
  turnNumber: number;
  whiteModel: string;
  blackModel: string;
  lastMove?: string;
  lastMoveColor?: 'w' | 'b';
  /** Current Stockfish eval in centipawns (from White's perspective). */
  evalCp?: number;
  /** Previous commentary text for continuity. */
  prevCommentary?: string;
  /** Custom channel/stream info for plugs. */
  channelInfo?: ChannelInfo;
}

export interface ChannelInfo {
  channelName: string;
  website?: string;
  donationUrl?: string;
  socialLinks?: string[];
  /** Extra lines the streamer wants mentioned. */
  customPlugLines?: string[];
}

const FILLER_SYSTEM_PROMPT = `You are a live chess stream commentator filling time between moves. Keep it conversational, engaging, and natural — like a real broadcast.

RULES:
- Plain spoken text ONLY — no markdown, no special formatting
- ALWAYS use standard algebraic notation for chess moves (Nf3, Bxe5, O-O)
- Short and punchy — aim for 3-5 sentences (about 15 seconds of speech)
- Sound natural and enthusiastic, not robotic
- Never say "as an AI" or break the commentator persona

BOARD ANNOTATIONS — Draw on the board with inline tags:
- [arrow e2 e4] — green arrow (colors: green, red, yellow, blue, orange, purple, white, cyan)
- [highlight d5] — highlight a square (default yellow)
- [circle f3] — circle a square (default blue)
Place tags at the END of sentences — text must read naturally without them. Tags are stripped from speech automatically.`;

const TEMPLATES: FillerPromptTemplate[] = [
  // --- Position Analysis (deep dive) ---
  {
    category: 'position_analysis',
    weight: 3,
    minTurn: 3,
    build: (ctx) => `While we wait for the next move, give a brief position assessment.

Position (FEN): ${ctx.fen}
Game: ${ctx.moveHistory.join(' ')}
White: ${ctx.whiteModel} | Black: ${ctx.blackModel}
${ctx.evalCp !== undefined ? `Eval: ${(ctx.evalCp / 100).toFixed(1)} (from White's perspective)` : ''}

Talk about pawn structure, piece activity, or king safety. Keep it educational but brief — 3-5 sentences.`,
  },
  {
    category: 'position_analysis',
    weight: 2,
    minTurn: 5,
    build: (ctx) => `Analyze the key squares and piece placement in this position.

Position (FEN): ${ctx.fen}
Game: ${ctx.moveHistory.join(' ')}
${ctx.evalCp !== undefined ? `Eval: ${(ctx.evalCp / 100).toFixed(1)}` : ''}

Focus on which squares are weak, which pieces are well-placed, and any imbalances. 3-5 sentences.`,
  },

  // --- Predictions ---
  {
    category: 'prediction',
    weight: 3,
    minTurn: 4,
    build: (ctx) => `Predict what might happen next in this game.

Position (FEN): ${ctx.fen}
Game so far: ${ctx.moveHistory.join(' ')}
White: ${ctx.whiteModel} | Black: ${ctx.blackModel}
${ctx.evalCp !== undefined ? `Eval: ${(ctx.evalCp / 100).toFixed(1)}` : ''}

What plans might each side pursue? What are the critical decisions coming up? Speculate like a real commentator — 3-5 sentences.`,
  },

  // --- Model Comparison ---
  {
    category: 'model_comparison',
    weight: 2,
    minTurn: 6,
    build: (ctx) => `Compare how ${ctx.whiteModel} (White) and ${ctx.blackModel} (Black) have been playing so far.

Game: ${ctx.moveHistory.join(' ')} (${ctx.turnNumber} turns in)
${ctx.evalCp !== undefined ? `Current eval: ${(ctx.evalCp / 100).toFixed(1)}` : ''}

Comment on their styles, accuracy, and any interesting tendencies you've noticed. 3-5 sentences.`,
  },

  // --- Game Recap ---
  {
    category: 'game_recap',
    weight: 2,
    minTurn: 8,
    build: (ctx) => `Give the audience a quick recap of how we got here.

Game: ${ctx.moveHistory.join(' ')}
White: ${ctx.whiteModel} | Black: ${ctx.blackModel}
${ctx.evalCp !== undefined ? `Current eval: ${(ctx.evalCp / 100).toFixed(1)}` : ''}

Summarize the key moments and the story of the game so far. 3-5 sentences.`,
  },

  // --- Chess Education ---
  {
    category: 'chess_education',
    weight: 2,
    minTurn: 3,
    build: (ctx) => {
      const phase = ctx.turnNumber <= 10 ? 'opening' : ctx.turnNumber <= 30 ? 'middlegame' : 'endgame';
      return `Teach the audience something about chess relevant to this ${phase} position.

Position (FEN): ${ctx.fen}
Turn: ${ctx.turnNumber}

Pick one concept (e.g. a tactical motif, positional idea, famous game parallel, or common mistake) and explain it briefly. Make it feel relevant to what's happening. 3-5 sentences.`;
    },
  },
  {
    category: 'chess_education',
    weight: 1,
    build: (_ctx) => `Share a fun fact or piece of chess trivia that the audience might enjoy. Maybe about AI chess, famous games, unusual rules, or chess history. Keep it light and entertaining — 2-3 sentences.`,
  },

  // --- Channel Plugs ---
  {
    category: 'channel_plug',
    weight: 1,
    build: (ctx) => {
      const info = ctx.channelInfo;
      if (!info) {
        return `Give a brief, natural plug for the stream. Thank the viewers for watching this AI chess match between ${ctx.whiteModel} and ${ctx.blackModel}. Encourage them to stick around and enjoy the game. 2-3 sentences.`;
      }
      const parts = [`Plug the stream naturally for ${info.channelName}.`];
      if (info.website) parts.push(`Website: ${info.website}`);
      if (info.socialLinks?.length) parts.push(`Social: ${info.socialLinks.join(', ')}`);
      if (info.customPlugLines?.length) parts.push(`Also mention: ${info.customPlugLines.join('. ')}`);
      parts.push(`Keep it brief and natural — 2-3 sentences. Don't sound like a commercial.`);
      return parts.join('\n');
    },
  },

  // --- Audience Engagement / Donations ---
  {
    category: 'audience_engagement',
    weight: 1,
    build: (ctx) => {
      const info = ctx.channelInfo;
      if (info?.donationUrl) {
        return `Encourage viewers to support the stream. Donation link: ${info.donationUrl}
Mention that donations help keep these AI chess matches running (API costs, compute, etc.). Be warm and genuine, not pushy. 2-3 sentences.`;
      }
      return `Engage the audience — ask them who they think is winning, what move they'd play, or if they're enjoying the match between ${ctx.whiteModel} and ${ctx.blackModel}. Be conversational. 2-3 sentences.`;
    },
  },
  {
    category: 'audience_engagement',
    weight: 1,
    minTurn: 5,
    build: (ctx) => `Ask the audience a thought-provoking question about the game.

Position (FEN): ${ctx.fen}
Game: ${ctx.moveHistory.join(' ')}
White: ${ctx.whiteModel} | Black: ${ctx.blackModel}

Maybe ask who they think will win, what they'd play in this position, or which AI model has impressed them more. 2-3 sentences.`,
  },
];

/**
 * Pick a filler prompt, avoiding the same category back-to-back.
 */
export function pickFillerPrompt(
  ctx: FillerContext,
  lastCategory?: FillerCategory,
): { template: FillerPromptTemplate; messages: ChatMessage[] } | null {
  // Filter eligible templates
  const eligible = TEMPLATES.filter(t => {
    if (t.minTurn && ctx.turnNumber < t.minTurn) return false;
    if (t.category === lastCategory) return false;
    // Channel plugs/donations only if channel info exists or using generic
    return true;
  });

  if (eligible.length === 0) return null;

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * totalWeight;
  let selected = eligible[0];
  for (const t of eligible) {
    roll -= t.weight;
    if (roll <= 0) {
      selected = t;
      break;
    }
  }

  const userContent = selected.build(ctx);

  return {
    template: selected,
    messages: [
      { role: 'system', content: FILLER_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  };
}
