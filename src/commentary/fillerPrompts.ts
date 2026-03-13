import type { ChatMessage } from '../llm/prompts';

export type FillerCategory =
  | 'position_analysis'
  | 'prediction'
  | 'model_comparison'
  | 'game_recap'
  | 'chess_education'
  | 'channel_plug'
  | 'audience_engagement'
  | 'thinking_update';

export interface FillerPromptTemplate {
  category: FillerCategory;
  weight: number;
  minTurn?: number;
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
  evalCp?: number;
  prevCommentary?: string;
  channelInfo?: ChannelInfo;
  thinkingElapsedMs?: number;
  thinkingModel?: string;
  thinkingReasoningEffort?: string;
  recentFillerCategories?: FillerCategory[];
  recentFillerTexts?: string[];
}

export interface ChannelInfo {
  channelName: string;
  website?: string;
  donationUrl?: string;
  socialLinks?: string[];
  customPlugLines?: string[];
}

const FILLER_SYSTEM_PROMPT = `You are a live chess stream commentator filling dead air between moves.

Stay grounded in the current game, but do not sound scripted. Use the requested topic only as a launch point, then improvise naturally from there.

Rules:
- Plain spoken text only. No markdown, no lists.
- Use standard algebraic notation for moves.
- Aim for 2-5 sentences.
- Be concrete and varied, not generic broadcaster wallpaper.
- Do not repeat the same opener, takeaway, or rhythm from recent filler.
- Do not say "while we wait", "fascinating position", "both sides have chances", "anything can happen", or "you can feel the tension".
- Prefer one clear idea over several vague ones.

Board annotations:
- [arrow e2 e4]
- [highlight d5]
- [circle f3]
Only use annotations when they help.`;

const FILLER_STYLE_ANGLES = [
  'sound like you just spotted one sharp detail worth sharing',
  'sound like an experienced host staying lively without padding',
  'sound a little more analytical than theatrical',
  'sound like a strong club coach talking to serious viewers',
  'sound brisk, fresh, and specific',
];

function moveWindow(ctx: FillerContext, maxMoves = 12): string {
  const moves = ctx.moveHistory.slice(-maxMoves);
  return moves.length > 0 ? moves.join(' ') : '(opening position)';
}

function evalText(ctx: FillerContext): string {
  return ctx.evalCp !== undefined ? `Current eval: ${(ctx.evalCp / 100).toFixed(1)} from White's perspective.` : '';
}

const TEMPLATES: FillerPromptTemplate[] = [
  {
    category: 'position_analysis',
    weight: 3,
    minTurn: 3,
    build: (ctx) => `Topic lane: position read.

Position (FEN): ${ctx.fen}
Recent game moves: ${moveWindow(ctx)}
White: ${ctx.whiteModel}
Black: ${ctx.blackModel}
${evalText(ctx)}

Pick one concrete feature to talk about: pawn structure, king safety, one loose piece, one critical square, or one active piece. Do not try to cover everything.`,
  },
  {
    category: 'position_analysis',
    weight: 2,
    minTurn: 5,
    build: (ctx) => `Topic lane: board geometry.

Position (FEN): ${ctx.fen}
Recent game moves: ${moveWindow(ctx)}
${evalText(ctx)}

Focus on one board zone or route that matters right now: a file, diagonal, outpost, weak square, or invasion path. Make it feel like live board reading, not a textbook summary.`,
  },
  {
    category: 'prediction',
    weight: 3,
    minTurn: 4,
    build: (ctx) => `Topic lane: what comes next.

Position (FEN): ${ctx.fen}
Recent game moves: ${moveWindow(ctx)}
White: ${ctx.whiteModel}
Black: ${ctx.blackModel}
${evalText(ctx)}

Speculate on one or two likely plans, candidate moves, or tactical worries. Be decisive and broadcaster-like, not hedged and generic.`,
  },
  {
    category: 'model_comparison',
    weight: 2,
    minTurn: 6,
    build: (ctx) => `Topic lane: compare the players.

Recent game moves: ${moveWindow(ctx)}
White: ${ctx.whiteModel}
Black: ${ctx.blackModel}
${evalText(ctx)}

Comment on style differences or decision quality so far. Keep it tied to this actual game, not generic AI commentary.`,
  },
  {
    category: 'game_recap',
    weight: 2,
    minTurn: 8,
    build: (ctx) => `Topic lane: story so far.

Recent game moves: ${moveWindow(ctx)}
White: ${ctx.whiteModel}
Black: ${ctx.blackModel}
${evalText(ctx)}

Give a quick narrative recap, but organize it around one turning point or one unfinished tension rather than listing every phase.`,
  },
  {
    category: 'chess_education',
    weight: 2,
    minTurn: 3,
    build: (ctx) => {
      const phase = ctx.turnNumber <= 10 ? 'opening' : ctx.turnNumber <= 30 ? 'middlegame' : 'endgame';
      return `Topic lane: teach one concept.

Position (FEN): ${ctx.fen}
Recent game moves: ${moveWindow(ctx)}
Phase: ${phase}

Pick one concept that genuinely fits this position: overloading, weak squares, dark-square control, initiative, prophylaxis, pawn breaks, or a common tactical motif. Keep it practical.`;
    },
  },
  {
    category: 'chess_education',
    weight: 1,
    build: (_ctx) => `Topic lane: chess culture.

Share one sharp or surprising chess-related nugget, but make it feel adjacent to the live game rather than random trivia. Keep it short and conversational.`,
  },
  {
    category: 'thinking_update',
    weight: 4,
    build: (ctx) => {
      const elapsedSec = Math.round((ctx.thinkingElapsedMs ?? 0) / 1000);
      const model = ctx.thinkingModel ?? 'The model';
      const effort = ctx.thinkingReasoningEffort ?? 'unknown';
      return `Topic lane: thinking update.

${model} has been thinking for about ${elapsedSec} seconds at ${effort} reasoning.
Position (FEN): ${ctx.fen}
Recent game moves: ${moveWindow(ctx, 10)}

Do not just say the model is thinking. Explain one concrete thing it may be calculating here: a tactical line, a king-safety tradeoff, a pawn break, a forcing sequence, or a difficult evaluation choice.`;
    },
  },
  {
    category: 'thinking_update',
    weight: 2,
    build: (ctx) => {
      const elapsedSec = Math.round((ctx.thinkingElapsedMs ?? 0) / 1000);
      const model = ctx.thinkingModel ?? 'The model';
      return `Topic lane: deep calculation.

${model} is still in the tank at ${elapsedSec} seconds.
Position (FEN): ${ctx.fen}
${evalText(ctx)}

Frame the long think as evidence that the position contains one hard decision. Name what kind of decision it is and why it is difficult.`;
    },
  },
  {
    category: 'channel_plug',
    weight: 1,
    build: (ctx) => {
      const info = ctx.channelInfo;
      if (!info) {
        return `Topic lane: soft stream plug.

Thank viewers for hanging out with this AI chess game between ${ctx.whiteModel} and ${ctx.blackModel}. Keep it warm and quick, and tie it back to the game instead of sounding like an ad read.`;
      }
      const parts = [
        'Topic lane: soft stream plug.',
        `Channel: ${info.channelName}`,
        info.website ? `Website: ${info.website}` : '',
        info.socialLinks?.length ? `Social: ${info.socialLinks.join(', ')}` : '',
        info.customPlugLines?.length ? `Optional mentions: ${info.customPlugLines.join(' | ')}` : '',
        'Make it feel casual and in-world, not like a scripted sponsor segment.',
      ].filter(Boolean);
      return parts.join('\n');
    },
  },
  {
    category: 'audience_engagement',
    weight: 1,
    build: (ctx) => {
      const info = ctx.channelInfo;
      if (info?.donationUrl) {
        return `Topic lane: audience support.

Donation link: ${info.donationUrl}
Game context: ${ctx.whiteModel} vs ${ctx.blackModel}

Invite support briefly and genuinely, with one sentence connecting it to running live AI chess. Do not sound pushy.`;
      }
      return `Topic lane: audience question.

Position (FEN): ${ctx.fen}
Recent game moves: ${moveWindow(ctx)}

Ask viewers one specific question they could actually answer about the current position, likely plan, or which side they trust more.`;
    },
  },
];

export function pickFillerPrompt(
  ctx: FillerContext,
  lastCategory?: FillerCategory,
): { template: FillerPromptTemplate; messages: ChatMessage[] } | null {
  const recentCategories = ctx.recentFillerCategories ?? [];
  const recentTexts = ctx.recentFillerTexts ?? [];
  const blockedRecent = new Set(recentCategories.slice(-2));

  const baseEligible = TEMPLATES.filter((template) => {
    if (template.minTurn && ctx.turnNumber < template.minTurn) return false;
    if (template.category === 'thinking_update' && (!ctx.thinkingElapsedMs || ctx.thinkingElapsedMs < 15000)) return false;
    return true;
  });

  const preferredPool = baseEligible.filter((template) => template.category !== lastCategory && !blockedRecent.has(template.category));
  const fallbackPool = baseEligible.filter((template) => template.category !== lastCategory);
  const pool = preferredPool.length > 0 ? preferredPool : fallbackPool;
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, template) => sum + template.weight, 0);
  let roll = Math.random() * totalWeight;
  let selected = pool[0];
  for (const template of pool) {
    roll -= template.weight;
    if (roll <= 0) {
      selected = template;
      break;
    }
  }

  const styleAngle = FILLER_STYLE_ANGLES[Math.floor(Math.random() * FILLER_STYLE_ANGLES.length)];
  const recentLines = recentTexts.slice(-2).map((text, index) => `${index + 1}. "${text}"`).join('\n');
  const continuity = [
    ctx.prevCommentary ? `Recent real game commentary: "${ctx.prevCommentary}"` : '',
    recentCategories.length > 0 ? `Recent filler categories to avoid echoing: ${recentCategories.slice(-3).join(', ')}` : '',
    recentLines ? `Recent filler lines to avoid echoing:\n${recentLines}` : '',
    `Style target: ${styleAngle}.`,
    'Improvise freely inside the requested topic lane. Do not sound canned.',
  ].filter(Boolean).join('\n\n');

  return {
    template: selected,
    messages: [
      { role: 'system', content: FILLER_SYSTEM_PROMPT },
      { role: 'user', content: `${selected.build(ctx)}\n\n${continuity}` },
    ],
  };
}
