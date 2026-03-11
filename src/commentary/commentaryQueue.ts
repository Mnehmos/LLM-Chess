import type { EvalResult } from '../chess/stockfish';
import type { CommentaryContext } from '../llm/prompts';
import { VERBOSITY_TOKEN_MAP } from '../llm/prompts';
import type { LLMClient } from '../llm/client';
import type { CommentatorConfig } from '../engine/types';
import { buildBatchCommentaryPrompt } from './batchPrompt';
import { buildReasoningParams } from '../llm/model-capabilities';
import { pickFillerPrompt, type FillerCategory, type FillerContext, type ChannelInfo } from './fillerPrompts';
import { parseAnnotations, type BoardAnnotations } from '../utils/board-annotations';

export interface QueuedMove {
  moveIndex: number;
  move: string;
  color: 'w' | 'b';
  turnNumber: number;
  fen: string;
  isCheck: boolean;
  isCapture: boolean;
  whiteModel: string;
  blackModel: string;
  moveHistory: string[];
  stockfishEval?: EvalResult;
  prevEvalCp?: number;
  /** How long the player took to make this move (ms). */
  thinkingTimeMs?: number;
  /** Source and destination squares for arrow drawing. */
  from?: string;
  to?: string;
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
  /** Channel info for plug/donation fillers. */
  channelInfo?: ChannelInfo;
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
  if (isReasoning) return outputBudget + 2000;

  return outputBudget;
}

export class CommentaryQueue {
  private pending: QueuedMove[] = [];
  private active: QueuedMove[] | null = null;
  private entries: CommentaryEntry[] = [];
  private activeEntryIndex = -1;
  private listeners: Set<UpdateListener> = new Set();
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
  private lastFillerCategory: FillerCategory | undefined;
  /** Snapshot of the last move for filler context. */
  private lastMoveSnapshot: QueuedMove | null = null;

  constructor(config: CommentaryQueueConfig) {
    this.config = config;
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

  /**
   * Generate an introduction commentary entry before the first move.
   * For replays, this sets the historical stage. For tournaments, it introduces the matchup.
   * The intro is narrated via TTS like any other entry, with maxMoveIndex=-1 so the board
   * stays at the starting position.
   */
  async generateIntro(introPrompt: string): Promise<void> {
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

    try {
      const client = this.config.getClient();
      const ttsMode = this.config.getTtsMode?.() ?? false;
      const systemPrompt = this.config.systemPromptOverride || (
        ttsMode
          ? 'You are a chess broadcast host opening a live stream. Speak naturally and conversationally.'
          : 'You are a chess commentator introducing a game. Use rich markdown.'
      );

      const messages: import('../llm/prompts').ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: introPrompt },
      ];

      const raw = await client.requestMoveRaw(model.id, messages, 0.8, { promptLevel: 'p0' }, (partial) => {
        this.updateEntryText(entryIndex, partial);
      });

      // Clear active and complete, then process any queued moves
      this.active = null;
      this.completeEntry(entryIndex, raw.content, true);
      this.processNext();
    } catch (err) {
      this.active = null;
      const message = err instanceof Error ? err.message : String(err);
      this.completeEntry(entryIndex, `(Intro error: ${message})`, true);
      this.processNext();
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

    try {
      const client = this.config.getClient();
      const messages: import('../llm/prompts').ChatMessage[] = [
        { role: 'system', content: this.config.systemPromptOverride ?? `You are an expert chess commentator providing a post-game recap.${ttsMode ? ' Spoken natural language only, no markdown.' : ''}` },
        { role: 'user', content: recapPrompt },
      ];
      const verbosityTokens = model.verbosity ? VERBOSITY_TOKEN_MAP[model.verbosity] : undefined;
      const raw = await client.requestMoveRaw(
        model.id,
        messages,
        0.8,
        { promptLevel: 'p0' },
        (partial) => {
          if (this.destroyed || entryIndex >= this.entries.length) return;
          const updated = [...this.entries];
          updated[entryIndex] = { ...updated[entryIndex], text: partial, streaming: true };
          this.entries = updated;
          this.emit();
        },
      );
      void verbosityTokens; // acknowledged — not passable via requestMoveRaw interface
      this.completeEntry(entryIndex, raw.content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.completeEntry(entryIndex, `(Recap error: ${message})`);
    }
  }

  enqueue(item: QueuedMove): void {
    if (this.destroyed) return;
    this.moveTimestamps.push(Date.now());
    this.pending.push(item);
    this.lastMoveSnapshot = item;
    // Cancel any filler — real move takes priority
    this.cancelFiller();
    this.processNext();
  }

  reset(): void {
    this.cancelFiller();
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
    this.emit();
  }

  destroy(): void {
    this.cancelFiller();
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

    const entry: CommentaryEntry = {
      id: genId(),
      moves,
      text: '',
      streaming: true,
      timestamp: Date.now(),
      maxMoveIndex,
    };

    this.entries = [...this.entries, entry];
    this.activeEntryIndex = this.entries.length - 1;
    this.emit();

    this.runCommentary(batch, this.activeEntryIndex);
  }

  private async runCommentary(batch: QueuedMove[], entryIndex: number): Promise<void> {
    try {
      const model = this.config.getCommentatorModel();
      if (!model.id) {
        this.completeEntry(entryIndex, '(No commentator model selected)');
        return;
      }

      const client = this.config.getClient();
      const ttsMode = this.config.getTtsMode?.() ?? false;

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
      const tokenBudget = this.config.maxTokensOverride
        ?? verbosityTokens
        ?? dynamicMaxTokens(ttsMode, deadAirMs, model.id, model.maxTokens, measuredDeadAirMs);
      const options = {
        maxTokens: tokenBudget,
        reasoningEffort: model.reasoningEffort,
      };

      let result: string;
      const MAX_COMMENTARY_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_COMMENTARY_RETRIES; attempt++) {
        if (attempt > 0) {
          // Clear streaming text before retry so stale partial content doesn't linger
          this.updateEntryText(entryIndex, '');
        }

        if (batch.length === 1) {
          // Single move — use standard commentary
          const item = batch[0];
          const ctx: CommentaryContext = {
            fen: item.fen,
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
            prevCommentary: this.lastCommentaryText || undefined,
            ttsMode,
            systemPromptOverride: this.config.systemPromptOverride,
            verbosity: model.verbosity,
          };

          result = await client.requestCommentaryStream(model.id, ctx, (partial) => {
            this.updateEntryText(entryIndex, partial);
          }, options);
        } else {
          // Batch — use batch prompt (plain text, no structured output)
          const messages = buildBatchCommentaryPrompt(batch, this.lastCommentaryText || undefined, ttsMode, this.config.systemPromptOverride, model.verbosity);
          const raw = await client.requestMoveRaw(model.id, messages, 0.8, { promptLevel: 'p0' }, (partial) => {
            this.updateEntryText(entryIndex, partial);
          });
          result = raw.content;
        }

        // Retry if the LLM returned empty or the fallback placeholder
        const isEmpty = !result || result.trim() === '' || result.startsWith('(No commentary generated)');
        if (!isEmpty) break;
        if (attempt < MAX_COMMENTARY_RETRIES) {
          console.warn(`[Commentary] Empty result on attempt ${attempt + 1}, retrying...`);
        }
      }

      this.completeEntry(entryIndex, result!);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.completeEntry(entryIndex, `(Commentary error: ${message})`);
    }
  }

  private updateEntryText(entryIndex: number, text: string): void {
    if (this.destroyed || entryIndex >= this.entries.length) return;
    const updated = [...this.entries];
    updated[entryIndex] = { ...updated[entryIndex], text, streaming: true };
    this.entries = updated;
    this.emit();
  }

  private completeEntry(entryIndex: number, rawText: string, isFiller = false): void {
    if (this.destroyed || entryIndex >= this.entries.length) return;

    // Parse and strip annotation tags from the final text
    const { clean, annotations } = parseAnnotations(rawText);

    const updated = [...this.entries];
    updated[entryIndex] = { ...updated[entryIndex], text: clean, rawText: rawText, streaming: false, annotations };
    this.entries = updated;
    this.lastCommentaryText = clean;

    if (isFiller) {
      this.fillerActive = false;
    } else {
      this.active = null;
      this.activeEntryIndex = -1;
      this._lastCallCompletedAt = Date.now();
    }
    this.emit();

    if (!isFiller) {
      // Track highest completed move index
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

      // Flush idle waiters if nothing pending — replay runtime waits on this
      if (this.pending.length === 0) {
        const resolvers = this.idleResolvers.splice(0);
        for (const r of resolvers) r();
      }
      // Process any moves that arrived while we were generating
      this.processNext();
    }

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

  private scheduleFillerIfIdle(): void {
    if (this.destroyed) return;
    if (this.pending.length > 0 || this.active !== null) return;
    if (!this.lastMoveSnapshot) return; // No game context yet

    const fillerEnabled = this.config.getFillerEnabled?.() ?? false;
    const ttsMode = this.config.getTtsMode?.() ?? false;
    if (!fillerEnabled || !ttsMode) return;

    // Don't pile up fillers if audio backlog is already > 1
    const backlog = this.config.getAudioBacklog?.() ?? 0;
    if (backlog > 1) return;

    // Wait a short delay before firing filler — gives time for the next move to arrive
    // If average move time is short (fast game), don't bother with fillers
    const avgMoveTime = this.getAvgMoveTimeMs();
    if (avgMoveTime < 10000) return; // Skip fillers for fast games (<10s between moves)

    // Delay: 2s (let audio queue drain a bit before generating more)
    this.fillerTimer = setTimeout(() => {
      this.fillerTimer = null;
      this.runFiller();
    }, 2000);
  }

  private async runFiller(): Promise<void> {
    if (this.destroyed || this.pending.length > 0 || this.active !== null) return;
    if (this.fillerActive) return;

    const model = this.config.getCommentatorModel();
    if (!model.id) return;

    // Re-check audio backlog right before generating
    const backlog = this.config.getAudioBacklog?.() ?? 0;
    if (backlog > 1) return;

    const snap = this.lastMoveSnapshot!;
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
    };

    const picked = pickFillerPrompt(fillerCtx, this.lastFillerCategory);
    if (!picked) return;

    this.fillerActive = true;
    this.lastFillerCategory = picked.template.category;

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

      // Fillers are short — ~150 tokens of output (15s of speech)
      const maxTokens = isReasoning ? 4000 : 200;

      const raw = await client.requestMoveRaw(
        model.id,
        picked.messages,
        0.9,
        { promptLevel: 'p0' },
        (partial) => {
          if (abortCtrl.signal.aborted) return;
          this.updateEntryText(entryIndex, partial);
        },
      );

      if (abortCtrl.signal.aborted) return;
      this.completeEntry(entryIndex, raw.content, true);
    } catch (err) {
      if (abortCtrl.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Filler] Error: ${message}`);
      this.completeEntry(entryIndex, `(Filler error: ${message})`, true);
    }
  }
}
