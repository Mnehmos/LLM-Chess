import type { EvalResult } from '../chess/stockfish';
import type { CommentaryContext } from '../llm/prompts';
import { buildCommentaryPrompt, VERBOSITY_TOKEN_MAP } from '../llm/prompts';
import type { BoardBranch } from '../episodes/types';
import type { LLMClient } from '../llm/client';
import type { CommentatorConfig } from '../engine/types';
import { buildBatchCommentaryPrompt } from './batchPrompt';
import { buildReasoningParams } from '../llm/model-capabilities';
import { runResilientTextGeneration } from '../llm/resilient-text';
import { pickFillerPrompt, type FillerCategory, type FillerContext, type ChannelInfo } from './fillerPrompts';
import { parseAnnotations, type BoardAnnotations } from '../utils/board-annotations';

export interface QueuedMove {
  moveIndex: number;
  move: string;
  color: 'w' | 'b';
  turnNumber: number;
  /** Position before this move was played. */
  fenBefore?: string;
  /** Live/current position after this move was played. */
  fen: string;
  isCheck: boolean;
  isCapture: boolean;
  whiteModel: string;
  blackModel: string;
  moveHistory: string[];
  stockfishEval?: EvalResult;
  prevEvalCp?: number;
  preMoveBestMove?: string;
  preMoveBestMoveSan?: string;
  /** How long the player took to make this move (ms). */
  thinkingTimeMs?: number;
  /** Source and destination squares for arrow drawing. */
  from?: string;
  to?: string;
  /** Illegal moves the model tried before this legal move (≥2 means it struggled). */
  illegalMovesAttempted?: string[];
  /** True if this model's output format was downgraded from json_schema this session. */
  formatDowngraded?: boolean;
  /** Reasoning effort setting for each player — passed through for filler commentary context. */
  whiteReasoningEffort?: string;
  blackReasoningEffort?: string;
}

export interface CommentaryEntry {
  id: string;
  moves: { moveNumber: number; move: string; color: 'w' | 'b'; from?: string; to?: string }[];
  text: string;
  /** Raw text with annotation tags intact (for audio queue per-sentence parsing). */
  rawText?: string;
  streaming: boolean;
  timestamp: number;
  /** Highest move index covered by this entry (for board sync). */
  maxMoveIndex?: number;
  /** True when this entry is filler content (not tied to a specific move). */
  isFiller?: boolean;
  /** Model-driven board annotations parsed from inline tags. */
  annotations?: BoardAnnotations;
  /** Accumulated reasoning/thinking tokens from the model (🧠-prefixed, shown during streaming only). */
  thinking?: string;
}

export interface CommentaryQueueConfig {
  getClient: () => LLMClient;
  getCommentatorModel: () => CommentatorConfig;
  getTtsMode?: () => boolean;
  /** Returns the audio queue's average dead air gap in ms (0 if no data). */
  getDeadAirMs?: () => number;
  /** Returns true when filler commentary should fire during dead air. */
  getFillerEnabled?: () => boolean;
  /** Returns the number of queued audio entries (filler stops when backlog > 0). */
  getAudioBacklog?: () => number;
  /** Returns true while narration audio is actively playing. */
  getAudioPlaying?: () => boolean;
  /** Channel info for plug/donation fillers. */
  channelInfo?: ChannelInfo;
  /** Returns true when puzzle break feature is enabled. */
  getPuzzleBreakEnabled?: () => boolean;
  /** Returns true while a puzzle break is currently mounted/open in the UI. */
  getPuzzleBreakActive?: () => boolean;
  /**
   * Called by the filler system when a puzzle break should replace the next filler.
   * Only fires when filler would normally fire AND the thinking model is using
   * medium/high/xhigh reasoning effort (i.e. a genuine long thinker).
   */
  onPuzzleBreak?: () => void;
  /** Override the commentary system prompt (e.g. for historical replay narration). */
  systemPromptOverride?: string;
  /** Max moves per batch (1 = move-by-move narration for replay, undefined = batch all). */
  maxBatchSize?: number;
  /** Minimum ms between commentator LLM calls (rate limiting). Default: 0 (no limit). */
  minCallIntervalMs?: number;
  /** Hard token budget override — bypasses dynamic dead-air calculation. Use for replay mode. */
  maxTokensOverride?: number;
}

type UpdateListener = (entries: CommentaryEntry[]) => void;

let nextId = 0;
function genId(): string {
  return `cq-${++nextId}-${Date.now()}`;
}

const MAX_STREAMING_THINKING_CHARS = 4000;
const MAX_STREAMING_TEXT_CHARS = 6000;
const THINKING_TRUNCATED_SUFFIX = '\n\n[thinking truncated]';
const TEXT_TRUNCATED_SUFFIX = '\n\n[stream truncated]';
const STREAMING_ENTRY_EMIT_MS = 125;

function clampStreamingThinking(text: string): string {
  if (!text) return text;
  if (text.endsWith(THINKING_TRUNCATED_SUFFIX)) return text;
  if (text.length <= MAX_STREAMING_THINKING_CHARS) return text;
  return text.slice(0, MAX_STREAMING_THINKING_CHARS) + THINKING_TRUNCATED_SUFFIX;
}

function clampStreamingText(text: string): string {
  if (!text) return text;
  if (text.endsWith(TEXT_TRUNCATED_SUFFIX)) return text;
  if (text.length <= MAX_STREAMING_TEXT_CHARS) return text;
  return text.slice(0, MAX_STREAMING_TEXT_CHARS) + TEXT_TRUNCATED_SUFFIX;
}

/**
 * Compute dynamic max tokens based on available dead air time.
 *
 * The commentary audio needs to fill the gap until the next batch arrives.
 * With asymmetric games (e.g. GPT-5.4 at 88s vs Stockfish at 3s), moves
 * batch together and we have ~91s of dead air to fill.
 *
 * TTS speaks at ~150 words/min ≈ 2.5 words/sec. At ~0.75 tokens/word,
 * that's ~1.9 tokens/sec of TTS audio.
 *
 * We target filling ~70% of the dead air (leave room for pauses/transitions).
 *   outputTokens ≈ (deadAirSec × 0.7) × 1.9
 *
 * Reasoning models need extra headroom because reasoning tokens consume
 * most of the budget before any visible output.
 * Non-TTS mode → use model default.
 */
/**
 * Compute dynamic max tokens based on available dead air time.
 *
 * @param deadAirMs - estimated time until next batch (sum of batch move times)
 * @param measuredDeadAirMs - actual observed dead air from audio queue (0 if no data)
 *
 * TTS speaks at ~150 words/min ≈ 2.5 words/sec ≈ 1.9 tokens/sec.
 * We target filling ~80% of the dead air.
 */
function dynamicMaxTokens(
  ttsMode: boolean,
  deadAirMs: number,
  commentatorModelId: string,
  modelMaxTokens?: number,
  measuredDeadAirMs?: number,
): number | undefined {
  if (!ttsMode) return modelMaxTokens;

  const isReasoning = !!buildReasoningParams(commentatorModelId);

  // Dead air pattern: SF responds instantly, so dead air = LLM think time AFTER the batch.
  // Primary commentary covers the LLM+SF move pair, fillers fill the remaining wait.
  // Scale budget with expected dead air but cap moderately — fillers handle the rest.
  let effectiveDeadAirMs = deadAirMs;
  if (measuredDeadAirMs && measuredDeadAirMs > 2000) {
    effectiveDeadAirMs = Math.max(deadAirMs, measuredDeadAirMs);
  }

  // Target: fill ~40% of dead air with primary commentary (fillers get the other 60%)
  const targetTtsSec = Math.max(8, (effectiveDeadAirMs / 1000) * 0.4);
  // ~1.9 visible output tokens per second of TTS audio
  const outputTokens = Math.round(targetTtsSec * 1.9);
  // Clamp: at least 80 (2 sentences), cap at 500 (leaves room for fillers)
  const outputBudget = Math.min(800, Math.max(350, outputTokens));

  // Reasoning models burn thousands of tokens on thinking before output
  if (isReasoning) return outputBudget + 6000;

  return outputBudget;
}

function trimMoveHistory(moveHistory: string[], maxMoves = 18): string[] {
  return moveHistory.length <= maxMoves ? moveHistory : moveHistory.slice(-maxMoves);
}

function buildIntroFallback(ttsMode: boolean): string {
  return ttsMode
    ? 'We are live, the board is set, and the next move should arrive any moment.'
    : 'The board is set and the broadcast is live. Commentary dropped for the opening beat, but the game is underway.';
}

function buildRecapFallback(
  whiteModel: string,
  blackModel: string,
  result: string,
  totalMoves: number,
  ttsMode: boolean,
): string {
  return ttsMode
    ? `${whiteModel} versus ${blackModel} is over. Result: ${result} after ${totalMoves} moves. The game reached a clear conclusion even though the full recap failed to generate.`
    : `Post-game recap unavailable. Final result: ${whiteModel} vs ${blackModel}, ${result}, after ${totalMoves} moves.`;
}

function buildCommentaryFallback(batch: QueuedMove[], ttsMode: boolean): string {
  if (batch.length === 0) {
    return ttsMode
      ? 'The game is still moving, but commentary dropped out for a moment.'
      : 'Commentary temporarily unavailable, but the game state is still updating.';
  }

  if (batch.length === 1) {
    const move = batch[0];
    const mover = move.color === 'w' ? move.whiteModel : move.blackModel;
    const suffix = [
      move.isCapture ? 'It was a capture.' : '',
      move.isCheck ? 'The move gives check.' : '',
    ].filter(Boolean).join(' ');
    return `${mover} played ${move.move}. ${suffix || 'The position has changed and the broadcast is catching up.'}`.trim();
  }

  const summary = batch
    .map((move) => `${move.turnNumber}${move.color === 'w' ? 'w' : 'b'} ${move.move}`)
    .join(', ');
  return ttsMode
    ? `Quick catch-up: ${summary}. The moves are in, and the game is continuing while commentary recovers.`
    : `Commentary stalled during a multi-move batch. Moves covered: ${summary}.`;
}

function buildFillerFallback(ctx: FillerContext): string {
  const model = ctx.thinkingModel ?? 'The model';
  const lastMove = ctx.lastMove || 'the last move';
  const elapsedSec = Math.max(0, Math.round((ctx.thinkingElapsedMs ?? 0) / 1000));
  const variants = [
    `${model} is still calculating after ${lastMove}. This looks like a genuine tank, not a routine move.`,
    `${model} is still deep in the position after ${lastMove}, and the key question is which continuation actually holds together tactically.`,
    `${model} has not moved yet after ${lastMove}, which usually means it is sorting through one sharp branch rather than choosing between cosmetic options.`,
    `${model} is still working through the consequences of ${lastMove}. The board is stable for the moment, but the next decision clearly is not simple.`,
  ];
  const bucket = elapsedSec > 0 ? Math.floor(elapsedSec / 15) : 0;
  return variants[bucket % variants.length];
}

function buildCompactCommentaryMessages(
  ctx: CommentaryContext,
  systemPromptOverride?: string,
): import('../llm/prompts').ChatMessage[] {
  return buildCommentaryPrompt({
    ...ctx,
    moveHistory: trimMoveHistory(ctx.moveHistory, 14),
    prevCommentary: undefined,
    qaHistory: undefined,
    systemPromptOverride,
  });
}

function buildCompactBatchMessages(
  batch: QueuedMove[],
  ttsMode: boolean,
  systemPromptOverride?: string,
  verbosity?: string,
): import('../llm/prompts').ChatMessage[] {
  const compactBatch = batch.map((move) => ({
    ...move,
    moveHistory: trimMoveHistory(move.moveHistory, 14),
  }));
  return buildBatchCommentaryPrompt(compactBatch, undefined, ttsMode, systemPromptOverride, verbosity);
}

export class CommentaryQueue {
  private pending: QueuedMove[] = [];
  private active: QueuedMove[] | null = null;
  private entries: CommentaryEntry[] = [];
  private activeEntryIndex = -1;
  private listeners: Set<UpdateListener> = new Set();
  private streamEmitTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private config: CommentaryQueueConfig;
  private lastCommentaryText = '';

  /** The highest moveIndex that has completed commentary. -1 = none yet. */
  private _lastCommentedMoveIndex = -1;

  /** Timestamp of last completed (non-filler) commentator LLM call. 0 = never. */
  private _lastCallCompletedAt = 0;

  /** Resolvers waiting for the active commentary to finish. */
  private idleResolvers: (() => void)[] = [];

  /** Resolvers waiting for a specific moveIndex to complete commentary. */
  private moveWaiters: { moveIndex: number; resolve: () => void }[] = [];

  // Game pace tracking
  private moveTimestamps: number[] = [];

  // Filler system
  private fillerTimer: ReturnType<typeof setTimeout> | null = null;
  private fillerActive = false;
  private fillerAbort: AbortController | null = null;
  private fillerWatchdog: ReturnType<typeof setInterval> | null = null;
  private activeGenerationAbort: AbortController | null = null;
  private lastFillerCategory: FillerCategory | undefined;
  private recentFillerCategories: FillerCategory[] = [];
  private recentFillerTexts: string[] = [];
  /** True while the puzzle break panel is open — prevents double-firing on repeated audio drain callbacks. */
  private puzzleBreakActive = false;
  /** Once true, no further filler or puzzle scheduling fires for this queue's lifetime. */
  private fillerLockedOut = false;
  /** Snapshot of the last move for filler context. */
  private lastMoveSnapshot: QueuedMove | null = null;
  /** Timestamp when the last move snapshot was recorded (used to compute thinking elapsed time). */
  private lastMoveSnapshotAt = 0;

  constructor(config: CommentaryQueueConfig) {
    this.config = config;
    this.fillerWatchdog = setInterval(() => {
      if (this.destroyed) return;
      this.scheduleFillerIfIdle();
    }, 2000);
  }

  /** Dynamically set/clear the system prompt override (e.g. for historical replay narration). */
  setSystemPromptOverride(prompt: string | undefined): void {
    this.config = { ...this.config, systemPromptOverride: prompt };
  }

  /** Set max batch size (1 = move-by-move narration for replay, undefined = batch all). */
  setMaxBatchSize(size: number | undefined): void {
    this.config = { ...this.config, maxBatchSize: size };
  }

  /** Override the token budget (bypasses dynamic calculation). Pass undefined to restore auto. */
  setMaxTokensOverride(tokens: number | undefined): void {
    this.config = { ...this.config, maxTokensOverride: tokens };
  }

  async generateIntroSequence(introPrompts: string[]): Promise<void> {
    for (let i = 0; i < introPrompts.length; i++) {
      const prompt = introPrompts[i]?.trim();
      if (!prompt) continue;
      await this.generateIntro(prompt, { deferProcessNext: i < introPrompts.length - 1 });
      if (this.destroyed) return;
    }
  }

  /**
   * Generate an introduction commentary entry before the first move.
   * For replays, this sets the historical stage. For tournaments, it introduces the matchup.
   * The intro is narrated via TTS like any other entry, with maxMoveIndex=-1 so the board
   * stays at the starting position.
   */
  async generateIntro(introPrompt: string, options?: { deferProcessNext?: boolean }): Promise<void> {
    if (this.destroyed) { console.log('[Commentary] generateIntro: queue destroyed'); return; }
    const model = this.config.getCommentatorModel();
    if (!model.id) { console.log('[Commentary] generateIntro: no model id'); return; }
    console.log('[Commentary] generateIntro: starting with model=%s', model.id);

    // Block processNext while intro generates (same as active blocks move processing)
    this.active = [];

    const entry: CommentaryEntry = {
      id: genId(),
      moves: [],
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex: -1,
      isFiller: true,
    };
    this.entries = [...this.entries, entry];
    const entryIndex = this.entries.length - 1;
    this.emit();
    let abortCtrl: AbortController | null = null;

    try {
      const client = this.config.getClient();
      const ttsMode = this.config.getTtsMode?.() ?? false;
      abortCtrl = new AbortController();
      this.activeGenerationAbort = abortCtrl;
      const systemPrompt = this.config.systemPromptOverride || (
        ttsMode
          ? 'You are a chess broadcast host opening a live stream. Speak naturally and conversationally.'
          : 'You are a chess commentator introducing a game. Use rich markdown.'
      );

      const messages: import('../llm/prompts').ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: introPrompt },
      ];

      const introResult = await runResilientTextGeneration({
        client,
        model: model.id,
        messages,
        temperature: 0.8,
        responseOptions: { promptLevel: 'p0', maxTokens: Math.max(model.maxTokens ?? 800, 800), reasoningEffort: model.reasoningEffort },
        abortSignal: abortCtrl.signal,
        onText: (text) => this.updateEntryText(entryIndex, text),
        stallTimeoutMs: 30000,
        hardTimeoutMs: 120000,
        maxAttempts: 3,
      });
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }

      // Clear active and complete, then process any queued moves
      this.active = null;
      this.completeEntry(entryIndex, introResult.text || buildIntroFallback(ttsMode), true);
      if (!options?.deferProcessNext) {
        this.processNext();
      }
    } catch (err) {
      if (abortCtrl?.signal.aborted) {
        if (this.activeGenerationAbort === abortCtrl) {
          this.activeGenerationAbort = null;
        }
        this.active = null;
        return;
      }
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Commentary] Intro failed:', message);
      this.completeEntry(entryIndex, buildIntroFallback(this.config.getTtsMode?.() ?? false), true);
      if (!options?.deferProcessNext) {
        this.processNext();
      }
    }
  }

  /**
   * Generate an end-of-game recap commentary entry.
   * Called after the final move has been narrated.
   */
  async generateRecap(
    whiteModel: string,
    blackModel: string,
    result: string,
    totalMoves: number,
    moveHistory: string,
  ): Promise<void> {
    if (this.destroyed) return;
    const model = this.config.getCommentatorModel();
    if (!model.id) return;

    const ttsMode = this.config.getTtsMode?.() ?? false;
    const recapPrompt = `The game between ${whiteModel} (White) and ${blackModel} (Black) has concluded.

Result: ${result}
Total moves: ${totalMoves}
Full game: ${moveHistory}

Provide a post-game recap: summarize the key moments, turning points, and decisive factor. ${ttsMode ? '3-5 sentences, spoken naturally.' : 'Be thorough — cover the opening choices, key middlegame decisions, and the decisive moment. 4-8 sentences.'}`;

    const entry: CommentaryEntry = {
      id: genId(),
      moves: [],
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex: Number.MAX_SAFE_INTEGER,
    };

    this.entries = [...this.entries, entry];
    const entryIndex = this.entries.length - 1;
    this.emit();
    let abortCtrl: AbortController | null = null;

    try {
      const client = this.config.getClient();
      abortCtrl = new AbortController();
      this.activeGenerationAbort = abortCtrl;
      const messages: import('../llm/prompts').ChatMessage[] = [
        { role: 'system', content: this.config.systemPromptOverride ?? `You are an expert chess commentator providing a post-game recap.${ttsMode ? ' Spoken natural language only, no markdown.' : ''}` },
        { role: 'user', content: recapPrompt },
      ];
      const verbosityTokens = model.verbosity ? VERBOSITY_TOKEN_MAP[model.verbosity] : undefined;
      const recapResult = await runResilientTextGeneration({
        client,
        model: model.id,
        messages,
        temperature: 0.8,
        responseOptions: {
          promptLevel: 'p0',
          maxTokens: verbosityTokens ?? Math.max(model.maxTokens ?? 1000, 1000),
          reasoningEffort: model.reasoningEffort,
        },
        abortSignal: abortCtrl.signal,
        onText: (text) => {
          if (this.destroyed || entryIndex >= this.entries.length) return;
          const updated = [...this.entries];
          updated[entryIndex] = { ...updated[entryIndex], text, streaming: true };
          this.entries = updated;
          this.emit();
        },
        stallTimeoutMs: 30000,
        hardTimeoutMs: 120000,
        maxAttempts: 3,
      });
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      void verbosityTokens; // acknowledged - not passable via requestMoveRaw interface
      this.completeEntry(entryIndex, recapResult.text || buildRecapFallback(whiteModel, blackModel, result, totalMoves, ttsMode));
    } catch (err) {
      if (abortCtrl?.signal.aborted) {
        if (this.activeGenerationAbort === abortCtrl) {
          this.activeGenerationAbort = null;
        }
        return;
      }
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Commentary] Recap failed:', message);
      this.completeEntry(entryIndex, buildRecapFallback(whiteModel, blackModel, result, totalMoves, ttsMode));
    }
  }

  /**
   * Generate a single narration block covering an entire board branch.
   *
   * The branch is an "instructor pause" — the lesson rewinds the board,
   * plays an alternative line, then restores. This call produces ONE
   * spoken paragraph that opens the branch and previews what the
   * viewer is about to see, while the board sits on the starting FEN.
   * Branch moves then fire on the board with delays; we do NOT generate
   * per-branch-move commentary (that's a v2 enhancement).
   *
   * The runtime awaits this call before the first branch move fires.
   */
  async generateBranch(branch: BoardBranch, startingFen: string): Promise<void> {
    if (this.destroyed) return;
    const model = this.config.getCommentatorModel();
    if (!model.id) return;
    console.log('[Commentary] generateBranch %s: starting with model=%s', branch.id, model.id);

    // Block processNext for the duration so the branch entry is the
    // singular focus, just like generateIntro does.
    this.active = [];

    const entry: CommentaryEntry = {
      id: genId(),
      moves: [],
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex: -1,
      isFiller: true,
    };
    this.entries = [...this.entries, entry];
    const entryIndex = this.entries.length - 1;
    this.emit();
    let abortCtrl: AbortController | null = null;

    const ttsMode = this.config.getTtsMode?.() ?? false;
    const titleLine = branch.title ? `Branch title: ${branch.title}.\n` : '';
    const branchPrompt = `You are narrating the OPENING of a teaching branch — a hypothetical alternative line the lesson is about to demonstrate on the board. The viewer will SEE the next ${branch.branchMoves.length} moves play out (each narrated separately), then the board snaps back to the main line.

${titleLine}Branch starting position FEN: ${startingFen}
Branch moves (will play in this order): ${branch.branchMoves.join(' ')}

Educational point of the branch: ${branch.narrationCue}

Set the stage with real depth — 3-5 spoken sentences covering:
- What QUESTION about chess this branch answers (e.g. "what does Black do if they go straight for the throat with ...c5?").
- The strategic theme at stake (king safety, piece activity, structural commitment, the engine's read of the position).
- The general SHAPE of how this branch will play — without spoiling every move (the per-move narration does that). What's the recurring idea? What's the punch you're watching for?

${ttsMode ? 'Spoken naturally, no markdown.' : 'Use plain prose.'}

Do NOT walk through every branch move individually — the per-move narration covers that. Do NOT reference "the video", "the viewer", or "the audience". Do NOT add a closing transition; a separate closing narration will fire at the end of the branch.`;

    try {
      const client = this.config.getClient();
      abortCtrl = new AbortController();
      this.activeGenerationAbort = abortCtrl;

      const messages: import('../llm/prompts').ChatMessage[] = [
        {
          role: 'system',
          content:
            this.config.systemPromptOverride ??
            `You are an expert chess instructor narrating a teaching branch — a hypothetical alternative move sequence the lesson is briefly demonstrating on the board.${ttsMode ? ' Spoken natural language only, no markdown.' : ''}`,
        },
        { role: 'user', content: branchPrompt },
      ];

      const branchOpeningIsReasoning = !!buildReasoningParams(model.id);
      const branchOpeningMaxTokens = branchOpeningIsReasoning ? 12000 : 2500;
      const result = await runResilientTextGeneration({
        client,
        model: model.id,
        messages,
        temperature: 0.8,
        responseOptions: {
          promptLevel: 'p0',
          maxTokens: branchOpeningMaxTokens,
          reasoningEffort: model.reasoningEffort,
        },
        abortSignal: abortCtrl.signal,
        onText: (text) => this.updateEntryText(entryIndex, text),
        stallTimeoutMs: 30000,
        hardTimeoutMs: 120000,
        maxAttempts: 2,
      });
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      this.completeEntry(
        entryIndex,
        result.text || (branch.title ? `Branch: ${branch.title}.` : 'Branch interlude.'),
        true,
      );
    } catch (err) {
      if (abortCtrl?.signal.aborted) {
        if (this.activeGenerationAbort === abortCtrl) {
          this.activeGenerationAbort = null;
        }
        this.active = null;
        return;
      }
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Commentary] Branch %s failed: %s', branch.id, message);
      this.completeEntry(
        entryIndex,
        branch.title ? `Branch: ${branch.title}.` : 'Branch interlude.',
        true,
      );
    }
  }

  /**
   * Generate narration for ONE branch move as it's about to be played
   * on the board. The runtime calls this BEFORE applying each branch
   * move so the audio leads the visual. Short (1-2 sentences), in the
   * commentator's teaching voice, focused on WHY this specific move
   * follows in the branch.
   *
   * Distinct from generateBranch (which produces the branch-OPENING
   * narration) — this fires per move so the branch isn't a silent
   * pass-through, which the user flagged as "the fundamental value of
   * the video" on 2026-05-28.
   */
  async generateBranchMove(params: {
    branchId: string;
    branchTitle: string;
    branchPly: number;
    san: string;
    color: 'w' | 'b';
    fenBefore: string;
    branchNarrationCue: string;
  }): Promise<void> {
    if (this.destroyed) return;
    const model = this.config.getCommentatorModel();
    if (!model.id) return;
    console.log('[Commentary] generateBranchMove %s ply=%d: %s', params.branchId, params.branchPly, params.san);

    this.active = [];

    const entry: CommentaryEntry = {
      id: genId(),
      moves: [],
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex: -1,
      isFiller: true,
    };
    this.entries = [...this.entries, entry];
    const entryIndex = this.entries.length - 1;
    this.emit();
    let abortCtrl: AbortController | null = null;

    const ttsMode = this.config.getTtsMode?.() ?? false;
    const colorWord = params.color === 'w' ? 'White' : 'Black';
    // Branch moves are core lesson content — narrate them with the
    // same depth as main-line commentary. Per user direction
    // 2026-05-28: "branches are all core part of the video's magic
    // AI tutor. That AI tutor has full control and responsibility
    // for conveying the lesson to the student without skipping over
    // anything... Chess isn't magically always one line and no plan
    // survives a punch in the face."
    const prompt = `You are teaching a deep chess lesson and currently demonstrating an alternative line titled "${params.branchTitle}".

Why this line matters: ${params.branchNarrationCue}

Position FEN BEFORE this move: ${params.fenBefore}
You are about to play: ${colorWord}'s ${params.san} (move ${params.branchPly} of the alternative line)

Narrate this move with real depth — the student needs to *understand* chess, not just hear move names. Cover, in spoken first-person ("I play ${params.san}…"):

1. **What the move does concretely** — squares it covers, pieces it eyes, structure it commits to.
2. **How a strong engine reads the position** — material balance, king safety, piece activity, pawn structure, space, who has the better minor pieces. If the engine evaluation has a clear winner, say which side and why.
3. **Why this move is the natural follow-up in THIS line** — the plan being executed, the system idea it serves.
4. **The most punishing reply you're watching for** — chess isn't one line, no plan survives a punch in the face. Name the critical defensive or counter-attacking idea the opponent might try and what you'd do about it.
5. **What to expect next** — likely candidate moves, structural shifts, the kind of position you're steering toward.

Be thorough. 3-6 spoken sentences. ${ttsMode ? 'Spoken naturally, no markdown.' : 'Use plain prose, no markdown headers.'}

Do NOT recap the whole branch from the start. Do NOT introduce yourself. Do NOT mention "the video", "the viewer", or "the audience". Every branch move is a real teaching beat — match the depth of a main-line move.`;

    try {
      const client = this.config.getClient();
      abortCtrl = new AbortController();
      this.activeGenerationAbort = abortCtrl;

      const messages: import('../llm/prompts').ChatMessage[] = [
        {
          role: 'system',
          content:
            this.config.systemPromptOverride ??
            `You are a chess instructor narrating one move at a time inside a hypothetical alternative line.${ttsMode ? ' Spoken natural language only, no markdown.' : ''}`,
        },
        { role: 'user', content: prompt },
      ];

      // Branch moves are core lesson content — depth over economy.
      // Per user directive 2026-05-28: "fuck token limits, we want to
      // *know* how chess is working, how the stockfish analyzer sees
      // the board, how variations play out, what to expect when the
      // punch comes for your plan, etc". Generous budget so the
      // narration has room to explain engine eval + variations +
      // counter-punch ideas without ever being truncated mid-sentence.
      const isReasoningModel = !!buildReasoningParams(model.id);
      const branchMoveMaxTokens = isReasoningModel ? 12000 : 2500;
      const result = await runResilientTextGeneration({
        client,
        model: model.id,
        messages,
        temperature: 0.7,
        responseOptions: {
          promptLevel: 'p0',
          maxTokens: branchMoveMaxTokens,
          reasoningEffort: model.reasoningEffort,
        },
        abortSignal: abortCtrl.signal,
        onText: (text) => this.updateEntryText(entryIndex, text),
        stallTimeoutMs: 30000,
        hardTimeoutMs: 180000,
        maxAttempts: 2,
      });
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      this.completeEntry(
        entryIndex,
        result.text || `${colorWord} plays ${params.san}.`,
        true,
      );
    } catch (err) {
      if (abortCtrl?.signal.aborted) {
        if (this.activeGenerationAbort === abortCtrl) {
          this.activeGenerationAbort = null;
        }
        this.active = null;
        return;
      }
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Commentary] BranchMove %s ply=%d failed: %s', params.branchId, params.branchPly, message);
      this.completeEntry(entryIndex, `${colorWord} plays ${params.san}.`, true);
    }
  }

  /**
   * Generate the CLOSING narration for a branch after its last move has
   * played but before the board snaps back to the main line. The student
   * needs to understand the resulting position — engine eval, who's
   * comfortable, what the long-term verdict on this line is, and why we
   * called this branch what we called it. Without this, the snap-back
   * feels abrupt and the lesson skips the punchline.
   *
   * Distinct from generateBranch (opening) and generateBranchMove (per-move).
   */
  async generateBranchClosing(params: {
    branchId: string;
    branchTitle: string;
    branchMoves: string[];
    finalFen: string;
    branchNarrationCue: string;
  }): Promise<void> {
    if (this.destroyed) return;
    const model = this.config.getCommentatorModel();
    if (!model.id) return;
    console.log('[Commentary] generateBranchClosing %s', params.branchId);

    this.active = [];

    const entry: CommentaryEntry = {
      id: genId(),
      moves: [],
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex: -1,
      isFiller: true,
    };
    this.entries = [...this.entries, entry];
    const entryIndex = this.entries.length - 1;
    this.emit();
    let abortCtrl: AbortController | null = null;

    const ttsMode = this.config.getTtsMode?.() ?? false;
    const prompt = `You are closing out a teaching BRANCH titled "${params.branchTitle}". The board has just finished playing the branch's last move; it is about to snap back to the main line.

Branch played: ${params.branchMoves.join(' ')}
Final position FEN: ${params.finalFen}
Why this branch matters: ${params.branchNarrationCue}

Deliver the CLOSING verdict on this line — 3-5 spoken sentences in first person. Cover:

1. **How this position reads to a strong engine** — material, who has the safer king, who has the more active pieces, who has the better structure, an approximate evaluation (small/clear/decisive advantage to either side, or equal).
2. **The strategic verdict on the line** — does this branch refute the idea? Hold it? Show it's playable but uncomfortable? Be specific about WHO this line favors and WHY.
3. **What the student should take away** — the principle this branch demonstrates, the warning sign to watch for if the same shape appears in their own games.
4. A brief, natural cue that we're now returning to the main line.

${ttsMode ? 'Spoken naturally, no markdown.' : 'Use plain prose.'}

Do NOT replay every branch move from the start. Do NOT mention "the video", "the viewer", or "the audience". Be a teacher delivering the verdict on what just played out.`;

    try {
      const client = this.config.getClient();
      abortCtrl = new AbortController();
      this.activeGenerationAbort = abortCtrl;

      const messages: import('../llm/prompts').ChatMessage[] = [
        {
          role: 'system',
          content:
            this.config.systemPromptOverride ??
            `You are an expert chess instructor delivering the closing verdict on a teaching branch.${ttsMode ? ' Spoken natural language only, no markdown.' : ''}`,
        },
        { role: 'user', content: prompt },
      ];

      const closingIsReasoning = !!buildReasoningParams(model.id);
      const closingMaxTokens = closingIsReasoning ? 12000 : 2500;
      const result = await runResilientTextGeneration({
        client,
        model: model.id,
        messages,
        temperature: 0.7,
        responseOptions: {
          promptLevel: 'p0',
          maxTokens: closingMaxTokens,
          reasoningEffort: model.reasoningEffort,
        },
        abortSignal: abortCtrl.signal,
        onText: (text) => this.updateEntryText(entryIndex, text),
        stallTimeoutMs: 30000,
        hardTimeoutMs: 180000,
        maxAttempts: 2,
      });
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      this.completeEntry(
        entryIndex,
        result.text || `That's the verdict on ${params.branchTitle}. Back to the main line.`,
        true,
      );
    } catch (err) {
      if (abortCtrl?.signal.aborted) {
        if (this.activeGenerationAbort === abortCtrl) {
          this.activeGenerationAbort = null;
        }
        this.active = null;
        return;
      }
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      this.active = null;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Commentary] BranchClosing %s failed: %s', params.branchId, message);
      this.completeEntry(
        entryIndex,
        `That's the verdict on ${params.branchTitle}. Back to the main line.`,
        true,
      );
    }
  }

  enqueue(item: QueuedMove): void {
    if (this.destroyed) return;
    this.moveTimestamps.push(Date.now());
    this.pending.push(item);
    this.lastMoveSnapshot = item;
    this.lastMoveSnapshotAt = Date.now();
    // Cancel any filler — real move takes priority
    this.cancelFiller();
    this.processNext();
  }

  /**
   * Seed dead-air tracking before the first move is made.
   * Call this right after the intro commentary fires so the filler system
   * starts its clock immediately — without it, fillers can't fire on turn 1.
   *
   * The synthetic snap uses color='b' so thinkingColor resolves to 'w' (White to move first).
   */
  seedPreMoveSnapshot(snap: Pick<QueuedMove, 'fen' | 'whiteModel' | 'blackModel' | 'whiteReasoningEffort' | 'blackReasoningEffort'>): void {
    if (this.destroyed || this.lastMoveSnapshot) return; // don't overwrite a real snapshot
    console.log('[Commentary] Seeding pre-move snapshot for dead air tracking (White to move)');
    this.lastMoveSnapshot = {
      moveIndex: -1,
      move: '',
      color: 'b', // last "mover" = black → thinkingColor resolves to white
      turnNumber: 1,
      fen: snap.fen,
      isCheck: false,
      isCapture: false,
      whiteModel: snap.whiteModel,
      blackModel: snap.blackModel,
      moveHistory: [],
      whiteReasoningEffort: snap.whiteReasoningEffort,
      blackReasoningEffort: snap.blackReasoningEffort,
    };
    this.lastMoveSnapshotAt = Date.now();
    this.scheduleFillerIfIdle();
  }

  reset(): void {
    this.cancelFiller();
    this.cancelActiveGeneration();
    this.pending = [];
    this.active = null;
    this.entries = [];
    this.activeEntryIndex = -1;
    this.lastCommentaryText = '';
    this.moveTimestamps = [];
    this._lastCommentedMoveIndex = -1;
    this.moveWaiters = [];
    this.lastMoveSnapshot = null;
    this.lastFillerCategory = undefined;
    this.recentFillerCategories = [];
    this.recentFillerTexts = [];
    this.emit();
  }

  /**
   * Called by the audio layer when the narration queue fully drains (dead air begins).
   * Re-triggers filler scheduling since the backlog check that blocked it is now clear.
   */
  notifyAudioDrained(): void {
    console.log('[Commentary] Audio drained — re-checking filler/puzzle break eligibility');
    this.scheduleFillerIfIdle();
  }

  /**
   * Called when the puzzle break panel is dismissed or auto-closed.
   * Clears the active flag so future dead air can trigger another puzzle break.
   */
  notifyPuzzleBreakDismissed(): void {
    console.log('[PuzzleBreak] Panel dismissed — clearing active flag');
    this.puzzleBreakActive = false;
    this.scheduleFillerIfIdle();
  }

  destroy(): void {
    this.cancelFiller();
    this.cancelActiveGeneration();
    this.clearScheduledEmit();
    if (this.fillerWatchdog) {
      clearInterval(this.fillerWatchdog);
      this.fillerWatchdog = null;
    }
    this.destroyed = true;
    this.pending = [];
    this.active = null;
    this.listeners.clear();
  }

  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEntries(): CommentaryEntry[] {
    return this.entries;
  }

  /** The highest move index that has finished commentary (ready to display on board). */
  get lastCommentedMoveIndex(): number {
    return this._lastCommentedMoveIndex;
  }

  /**
   * Returns a promise that resolves when the commentary queue has no active generation.
   * If already idle, resolves immediately. Used by ReplayRuntime to pace moves.
   */
  waitUntilIdle(): Promise<void> {
    if (this.active === null && this.pending.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.idleResolvers.push(resolve);
    });
  }

  /**
   * Returns a promise that resolves when commentary for the given moveIndex completes.
   * If already done, resolves immediately. Used by replay mode for per-move gating.
   */
  waitForMove(moveIndex: number): Promise<void> {
    if (this._lastCommentedMoveIndex >= moveIndex) return Promise.resolve();
    return new Promise<void>(resolve => {
      this.moveWaiters.push({ moveIndex, resolve });
    });
  }

  /**
   * Average milliseconds between moves (rolling window of last 10).
   * Returns 15000 (15s) as default when insufficient data.
   */
  getAvgMoveTimeMs(): number {
    const stamps = this.moveTimestamps;
    if (stamps.length < 2) return 15000;

    // Use last 10 intervals
    const recent = stamps.slice(-11);
    let totalDelta = 0;
    const count = recent.length - 1;
    for (let i = 1; i < recent.length; i++) {
      totalDelta += recent[i] - recent[i - 1];
    }
    return totalDelta / count;
  }

  private emit(): void {
    const snapshot = [...this.entries];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private clearScheduledEmit(): void {
    if (this.streamEmitTimer) {
      clearTimeout(this.streamEmitTimer);
      this.streamEmitTimer = null;
    }
  }

  private scheduleStreamingEmit(): void {
    if (this.destroyed || this.streamEmitTimer) return;
    this.streamEmitTimer = setTimeout(() => {
      this.streamEmitTimer = null;
      this.emit();
    }, STREAMING_ENTRY_EMIT_MS);
  }

  private cancelActiveGeneration(): void {
    if (this.activeGenerationAbort) {
      this.activeGenerationAbort.abort();
      this.activeGenerationAbort = null;
    }
  }

  private processNext(): void {
    if (this.destroyed || this.active !== null || this.pending.length === 0) return;

    // Rate limiting: enforce minimum interval between commentator LLM calls
    const minInterval = this.config.minCallIntervalMs ?? 0;
    if (minInterval > 0 && this._lastCallCompletedAt > 0) {
      const remaining = minInterval - (Date.now() - this._lastCallCompletedAt);
      if (remaining > 0) {
        setTimeout(() => this.processNext(), remaining);
        return;
      }
    }

    const batchSize = this.config.maxBatchSize ?? this.pending.length;
    const batch = this.pending.splice(0, Math.min(batchSize, this.pending.length));
    this.active = batch;

    const moves = batch.map(m => ({
      moveNumber: m.turnNumber,
      move: m.move,
      color: m.color as 'w' | 'b',
      from: m.from,
      to: m.to,
    }));

    const maxMoveIndex = Math.max(...batch.map(m => m.moveIndex));

    // Pre-check if the commentator is a reasoning model so we can initialize
    // the thinking field to '' immediately. This keeps the ThinkingTokensBox
    // at a stable fixed height from the moment the entry appears — no layout
    // shift when the first thinking token arrives. Non-reasoning models get
    // thinking=undefined so the box is never shown.
    const commentatorModel = this.config.getCommentatorModel();
    const isReasoningCommentator = !!buildReasoningParams(commentatorModel.id, commentatorModel.reasoningEffort);

    const entry: CommentaryEntry = {
      id: genId(),
      moves,
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex,
      thinking: isReasoningCommentator ? '' : undefined,
    };

    this.entries = [...this.entries, entry];
    this.activeEntryIndex = this.entries.length - 1;
    this.emit();

    this.runCommentary(batch, this.activeEntryIndex);
  }

  private async runCommentary(batch: QueuedMove[], entryIndex: number): Promise<void> {
    let abortCtrl: AbortController | null = null;
    try {
      const model = this.config.getCommentatorModel();
      if (!model.id) {
        this.completeEntry(entryIndex, '(No commentator model selected)');
        return;
      }

      const client = this.config.getClient();
      const ttsMode = this.config.getTtsMode?.() ?? false;
      abortCtrl = new AbortController();
      this.activeGenerationAbort = abortCtrl;

      // Dead air = sum of all batch move times.
      // E.g. batch [white 88s, black 3s] → 91s of audio time to fill.
      const batchTimeMs = batch.reduce((sum, m) => sum + (m.thinkingTimeMs ?? 0), 0);
      // Use batch total if available, otherwise fall back to rolling average
      const deadAirMs = batchTimeMs > 0 ? batchTimeMs : this.getAvgMoveTimeMs();
      // Actual measured dead air from the audio queue (self-tuning feedback)
      const measuredDeadAirMs = this.config.getDeadAirMs?.() ?? 0;
      // Verbosity overrides token budget when set; otherwise use dynamic dead-air sizing.
      // maxTokensOverride (e.g. replay mode) bypasses the dynamic calculation entirely.
      const verbosityTokens = model.verbosity ? VERBOSITY_TOKEN_MAP[model.verbosity] : undefined;
      const rawBudget = this.config.maxTokensOverride
        ?? verbosityTokens
        ?? dynamicMaxTokens(ttsMode, deadAirMs, model.id, model.maxTokens, measuredDeadAirMs);
      // Reasoning models need token headroom for hidden thinking regardless of verbosity setting.
      // Without this floor, 'standard' verbosity (1000 tokens) guarantees empty output for gpt-5/o-series.
      const isReasoningCommentator = !!buildReasoningParams(model.id, model.reasoningEffort);
      const tokenBudget = (isReasoningCommentator && rawBudget !== undefined)
        ? Math.max(rawBudget, 6000)
        : rawBudget;
      const options = {
        maxTokens: tokenBudget,
        reasoningEffort: model.reasoningEffort,
      };

      let baseMessages: import('../llm/prompts').ChatMessage[];
      let compactMessages: import('../llm/prompts').ChatMessage[];

      if (batch.length === 1) {
        const item = batch[0];
        const ctx: CommentaryContext = {
          fen: item.fenBefore ?? item.fen,
          resultingFen: item.fen,
          lastMove: item.move,
          lastMoveColor: item.color,
          whiteModel: item.whiteModel,
          blackModel: item.blackModel,
          moveHistory: item.moveHistory,
          isCheck: item.isCheck,
          isCapture: item.isCapture,
          turnNumber: item.turnNumber,
        stockfishEval: item.stockfishEval,
        prevEvalCp: item.prevEvalCp,
        preMoveBestMove: item.preMoveBestMove,
        preMoveBestMoveSan: item.preMoveBestMoveSan,
        prevCommentary: this.lastCommentaryText || undefined,
        ttsMode,
          systemPromptOverride: this.config.systemPromptOverride,
          verbosity: model.verbosity,
          illegalMovesAttempted: item.illegalMovesAttempted,
          formatDowngraded: item.formatDowngraded,
        };
        baseMessages = buildCommentaryPrompt(ctx);
        compactMessages = buildCompactCommentaryMessages(ctx, this.config.systemPromptOverride);
      } else {
        baseMessages = buildBatchCommentaryPrompt(batch, this.lastCommentaryText || undefined, ttsMode, this.config.systemPromptOverride, model.verbosity);
        compactMessages = buildCompactBatchMessages(batch, ttsMode, this.config.systemPromptOverride, model.verbosity);
      }

      const result = await runResilientTextGeneration({
        client,
        model: model.id,
        messages: baseMessages,
        temperature: 0.8,
        responseOptions: { ...options, promptLevel: 'p0' },
        abortSignal: abortCtrl.signal,
        onText: (text) => this.updateEntryText(entryIndex, text),
        onThinking: (thinking) => this.updateEntryThinking(entryIndex, thinking),
        stallTimeoutMs: ttsMode ? 30000 : 45000,
        hardTimeoutMs: ttsMode ? 120000 : 180000,
        maxAttempts: 3,
        buildRetryPlan: ({ attempt, reason, result: attemptResult, responseOptions }) => {
          if (attemptResult.text.trim()) return undefined;
          const shortenedPrompt = attempt === 0 && !attemptResult.text.trim();
          const messages = attemptResult.text.trim()
            ? undefined
            : [
              ...((shortenedPrompt && (reason === 'empty' || reason === 'timeout' || reason === 'placeholder')) ? compactMessages : baseMessages),
              {
                role: 'user' as const,
                content: ttsMode
                  ? 'Retry with 2-3 punchy spoken sentences. Produce visible commentary immediately.'
                  : 'Retry with a shorter commentary. Produce visible output immediately and skip any throat-clearing.',
              },
            ];
          return {
            messages,
            responseOptions: {
              ...responseOptions,
              promptLevel: 'p0',
            },
          };
        },
      });
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }

      this.completeEntry(entryIndex, result.text || buildCommentaryFallback(batch, ttsMode));
    } catch (err) {
      if (abortCtrl?.signal.aborted) {
        if (this.activeGenerationAbort === abortCtrl) {
          this.activeGenerationAbort = null;
        }
        return;
      }
      if (this.activeGenerationAbort === abortCtrl) {
        this.activeGenerationAbort = null;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Commentary] Generation failed:', message);
      this.completeEntry(entryIndex, buildCommentaryFallback(batch, this.config.getTtsMode?.() ?? false));
    }
  }

  private updateEntryText(entryIndex: number, text: string): void {
    if (this.destroyed || entryIndex >= this.entries.length) return;
    const updated = [...this.entries];
    updated[entryIndex] = { ...updated[entryIndex], text: clampStreamingText(text), streaming: true };
    this.entries = updated;
    this.scheduleStreamingEmit();
  }

  private updateEntryThinking(entryIndex: number, thinking: string): void {
    if (this.destroyed || entryIndex >= this.entries.length) return;
    const updated = [...this.entries];
    updated[entryIndex] = { ...updated[entryIndex], thinking: clampStreamingThinking(thinking), streaming: true };
    this.entries = updated;
    this.scheduleStreamingEmit();
  }

  private completeEntry(entryIndex: number, rawText: string, isFiller = false): void {
    if (this.destroyed || entryIndex >= this.entries.length) return;
    this.clearScheduledEmit();

    // Parse and strip annotation tags from the final text
    const { clean, annotations } = parseAnnotations(rawText);

    const updated = [...this.entries];
    updated[entryIndex] = { ...updated[entryIndex], text: clean, rawText: rawText, streaming: false, annotations, thinking: undefined };
    this.entries = updated;

    if (isFiller) {
      this.fillerActive = false;
      if (clean) {
        this.recentFillerTexts.push(clean);
        if (this.recentFillerTexts.length > 4) this.recentFillerTexts.shift();
      }
    } else {
      this.lastCommentaryText = clean;
      this.active = null;
      this.activeEntryIndex = -1;
      this._lastCallCompletedAt = Date.now();
    }
    this.emit();

    if (!isFiller) {
      // Track highest completed move index — only meaningful for
      // real move commentary, not filler/intro/branch.
      const entry = this.entries[entryIndex];
      if (entry.maxMoveIndex !== undefined && entry.maxMoveIndex > this._lastCommentedMoveIndex) {
        this._lastCommentedMoveIndex = entry.maxMoveIndex;
      }

      // Flush move-specific waiters whose target has been reached
      const remaining: typeof this.moveWaiters = [];
      for (const w of this.moveWaiters) {
        if (this._lastCommentedMoveIndex >= w.moveIndex) {
          w.resolve();
        } else {
          remaining.push(w);
        }
      }
      this.moveWaiters = remaining;
    }

    // Idle bookkeeping runs for BOTH filler and non-filler entries.
    //
    // Bug history: previously this block ran only inside the !isFiller
    // branch, which meant that when a board branch / intro / outro
    // completed (all isFiller=true), any main commentary that had been
    // enqueued during the branch generation would never be processed —
    // processNext was never called, idleResolvers was never flushed.
    // The replay runtime then awaited waitUntilIdle indefinitely,
    // producing the 9-hour London hang on 2026-05-28.
    //
    // The fix: always drain idleResolvers when the queue is genuinely
    // idle, and always call processNext so pending entries (filler or
    // not) get picked up.
    if (this.pending.length === 0 && this.active === null) {
      const resolvers = this.idleResolvers.splice(0);
      for (const r of resolvers) r();
    }
    this.processNext();

    // Schedule filler if nothing is pending and filler is enabled
    this.scheduleFillerIfIdle();
  }

  // --- Filler system ---

  private cancelFiller(): void {
    if (this.fillerTimer) {
      clearTimeout(this.fillerTimer);
      this.fillerTimer = null;
    }
    if (this.fillerAbort) {
      this.fillerAbort.abort();
      this.fillerAbort = null;
    }
    this.fillerActive = false;
  }

  /**
   * One-way switch that disables ALL future filler/puzzle scheduling
   * and cancels any in-flight filler. Called from the broadcast
   * post-game sequence right before the futures + outro segments —
   * once we're in "closing" mode, no stray filler clips should
   * appear after the brand sign-off.
   *
   * Idempotent. Cannot be undone (re-create the queue instead).
   */
  lockOutFillers(): void {
    this.fillerLockedOut = true;
    this.cancelFiller();
  }

  private scheduleFillerRecheck(ms: number): void {
    if (this.destroyed || this.fillerLockedOut || this.fillerTimer) return;
    this.fillerTimer = setTimeout(() => {
      this.fillerTimer = null;
      this.scheduleFillerIfIdle();
    }, ms);
  }

  private scheduleFillerIfIdle(): void {
    if (this.destroyed || this.fillerLockedOut) return;
    if (this.pending.length > 0 || this.active !== null) return;
    if (!this.lastMoveSnapshot) return; // No game context yet
    if (this.puzzleBreakActive || (this.config.getPuzzleBreakActive?.() ?? false)) return; // Puzzle break already open

    const fillerEnabled = this.config.getFillerEnabled?.() ?? false;
    const ttsMode = this.config.getTtsMode?.() ?? false;
    if (!fillerEnabled || !ttsMode) return;

    const avgMoveTime = this.getAvgMoveTimeMs();
    const currentThinkingMs = this.lastMoveSnapshotAt ? Date.now() - this.lastMoveSnapshotAt : 0;
    const audioPlaying = this.config.getAudioPlaying?.() ?? false;
    if (audioPlaying) {
      this.scheduleFillerRecheck(2000);
      return;
    }
    const backlog = this.config.getAudioBacklog?.() ?? 0;
    if (backlog > 0) {
      this.scheduleFillerRecheck(2000);
      return;
    }

    // Skip fillers for fast games (<10s avg), BUT override if the current player has already been
    // thinking for >15s — handles gauntlets where opening book moves pull the average down.
    if (avgMoveTime < 10000 && currentThinkingMs < 15000) {
      // Not ready yet — schedule a re-check when we might be. Without this, nothing
      // wakes us up after the intro commentary completes on a slow-thinking game.
      const recheckMs = 15000 - currentThinkingMs;
      if (recheckMs > 0) {
        console.log(`[Commentary] Dead air watch: re-check in ${Math.round(recheckMs / 1000)}s (thinking ${Math.round(currentThinkingMs / 1000)}s avg)`);
        this.scheduleFillerRecheck(recheckMs + 500);
      }
      return;
    }

    // Delay: 2s (let audio queue drain a bit before generating more)
    this.fillerTimer = setTimeout(() => {
      this.fillerTimer = null;
      this.runFiller();
    }, 2000);
  }

  private async runFiller(): Promise<void> {
    if (this.destroyed || this.fillerLockedOut || this.pending.length > 0 || this.active !== null) return;
    if (this.fillerActive) return;
    if (this.puzzleBreakActive || (this.config.getPuzzleBreakActive?.() ?? false)) return;

    const model = this.config.getCommentatorModel();
    if (!model.id) return;

    // Re-check audio backlog right before generating.
    // Require true dead air (backlog === 0) — don't start filler/puzzle break
    // while the previous commentary sentence is still playing.
    const audioPlaying = this.config.getAudioPlaying?.() ?? false;
    if (audioPlaying) {
      this.scheduleFillerRecheck(2000);
      return;
    }

    const snap = this.lastMoveSnapshot!;
    // Who is currently thinking? The player opposite to whoever just moved.
    const thinkingColor = snap.color === 'w' ? 'b' : 'w';
    const thinkingModel = thinkingColor === 'w' ? snap.whiteModel : snap.blackModel;
    const thinkingReasoningEffort = thinkingColor === 'w' ? snap.whiteReasoningEffort : snap.blackReasoningEffort;
    const thinkingElapsedMs = this.lastMoveSnapshotAt ? Date.now() - this.lastMoveSnapshotAt : 0;
    const backlog = this.config.getAudioBacklog?.() ?? 0;
    if (backlog > 0) {
      this.scheduleFillerRecheck(2000);
      return;
    }

    // Puzzle break: fires as a filler replacement when the thinking model is a genuine
    // long thinker (medium/high/xhigh reasoning effort), puzzle break is enabled,
    // AND the model has been thinking for at least 25s (prevents premature firing on
    // fast games or games that just started).
    const PUZZLE_BREAK_MIN_THINKING_MS = 25000;
    const puzzleBreakEnabled = this.config.getPuzzleBreakEnabled?.() ?? false;
    const isPuzzleBreakEligibleThinker =
      thinkingReasoningEffort === 'medium'
      || thinkingReasoningEffort === 'high'
      || thinkingReasoningEffort === 'xhigh';
    const hasThoughtLongEnough = thinkingElapsedMs >= PUZZLE_BREAK_MIN_THINKING_MS;
    if (puzzleBreakEnabled && isPuzzleBreakEligibleThinker && hasThoughtLongEnough && this.config.onPuzzleBreak) {
      console.log(`[PuzzleBreak] Filler slot → puzzle break (${thinkingModel} @ ${thinkingReasoningEffort}, thinking ${Math.round(thinkingElapsedMs / 1000)}s)`);
      this.puzzleBreakActive = true;
      this.config.onPuzzleBreak();
      return;
    }
    if (puzzleBreakEnabled && isPuzzleBreakEligibleThinker && !hasThoughtLongEnough) {
      console.log(`[PuzzleBreak] Skipping — only ${Math.round(thinkingElapsedMs / 1000)}s thinking (need ${PUZZLE_BREAK_MIN_THINKING_MS / 1000}s)`);
    }

    const fillerCtx: FillerContext = {
      fen: snap.fen,
      moveHistory: snap.moveHistory,
      turnNumber: snap.turnNumber,
      whiteModel: snap.whiteModel,
      blackModel: snap.blackModel,
      lastMove: snap.move,
      lastMoveColor: snap.color,
      evalCp: snap.stockfishEval?.scoreCp,
      prevCommentary: this.lastCommentaryText || undefined,
      channelInfo: this.config.channelInfo,
      thinkingElapsedMs,
      thinkingModel,
      thinkingReasoningEffort,
      recentFillerCategories: this.recentFillerCategories,
      recentFillerTexts: this.recentFillerTexts,
    };

    const picked = pickFillerPrompt(fillerCtx, this.lastFillerCategory);
    if (!picked) return;

    this.fillerActive = true;
    this.lastFillerCategory = picked.template.category;
    this.recentFillerCategories.push(picked.template.category);
    if (this.recentFillerCategories.length > 4) this.recentFillerCategories.shift();

    const entry: CommentaryEntry = {
      id: genId(),
      moves: [],
      text: '',
      streaming: true,
      timestamp: Date.now(),
      isFiller: true,
    };

    this.entries = [...this.entries, entry];
    const entryIndex = this.entries.length - 1;
    this.emit();

    const abortCtrl = new AbortController();
    this.fillerAbort = abortCtrl;

    try {
      const client = this.config.getClient();
      const isReasoning = !!buildReasoningParams(model.id);

      // Fillers are short - ~150 tokens of output (15s of speech)
      const maxTokens = isReasoning ? 4000 : 200;

      const result = await runResilientTextGeneration({
        client,
        model: model.id,
        messages: picked.messages,
        temperature: 0.9,
        responseOptions: { promptLevel: 'p0', maxTokens, reasoningEffort: model.reasoningEffort },
        abortSignal: abortCtrl.signal,
        onText: (text) => this.updateEntryText(entryIndex, text),
        onThinking: (thinking) => this.updateEntryThinking(entryIndex, thinking),
        stallTimeoutMs: 20000,
        hardTimeoutMs: 60000,
        maxAttempts: 2,
      });

      if (abortCtrl.signal.aborted) return;
      this.completeEntry(entryIndex, result.text || buildFillerFallback(fillerCtx), true);
    } catch (err) {
      if (abortCtrl.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Filler] Error: ${message}`);
      this.completeEntry(entryIndex, buildFillerFallback(fillerCtx), true);
    }
  }
}
