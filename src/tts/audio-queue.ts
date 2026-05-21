import { synthesize, type TtsSynthesizeOptions } from './tts-client';
import { extractChessSquares, sanToSpoken } from '../utils/chess-squares';
import { parseAnnotations, type BoardAnnotations, EMPTY_ANNOTATIONS } from '../utils/board-annotations';

export interface NarrationMove {
  from: string;
  to: string;
  color: 'w' | 'b';
}

interface QueueEntry {
  /** Clean text with SAN notation (annotation tags already stripped, used for callbacks/highlights). */
  text: string;
  /** Spoken-English version sent to TTS synthesizer. */
  spokenText: string;
  synthOptions: TtsSynthesizeOptions;
  squares: string[];
  /** Board annotations parsed from this sentence's annotation tags. */
  annotations: BoardAnnotations;
  /** Entry-level metadata propagated from enqueueEntry. */
  entryId?: string;
  maxMoveIndex?: number;
  moves?: NarrationMove[];
  /**
   * True when this sentence opens a new commentary entry (i.e. the
   * board should advance and a render-plan paint offset should be
   * recorded). Set by enqueueEntry for the first sentence only.
   */
  isEntryHead?: boolean;
}

export type SentenceStartCallback = (text: string, squares: string[], annotations: BoardAnnotations) => void;
export type EntryStartCallback = (maxMoveIndex: number, moves: NarrationMove[], entryId: string) => void;
/**
 * Fires when the first sentence of a commentary entry begins playing.
 * Receives the move index this entry covers and the offset from
 * markPlaybackStart() in ms. Used only in broadcast / MP4-export mode.
 * The export pipeline maps moveIndex → render-plan segment index when
 * composing audio.
 */
export type SegmentStartCallback = (maxMoveIndex: number, offsetMs: number) => void;

/**
 * Sequential audio narration queue with per-sentence board sync.
 * Accepts text segments, synthesizes them via TTS,
 * and plays them in order using the Web Audio API.
 *
 * Key features:
 * - Prefetching: synthesizes next segment while playing current
 * - Per-sentence callback: fires onSentenceStart when each sentence begins playing
 * - Pace-aware: adjusts behavior based on game speed
 */
export class AudioNarrationQueue {
  private queue: QueueEntry[] = [];
  private playing = false;
  private processingPromise: Promise<void> | null = null;
  private paused = false;
  private volume = 0.8;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private prefetchPromise: Promise<ArrayBuffer> | null = null;
  private onSentenceStart: SentenceStartCallback | null = null;
  private onEntryStart: EntryStartCallback | null = null;
  private onSegmentStart: SegmentStartCallback | null = null;
  /** Tracks which entryId we last fired onEntryStart for. */
  private _lastFiredEntryId: string | null = null;
  /**
   * performance.now() at which __CHESS_EXPORT__.start() was called.
   * Used to compute per-segment paint offsets in broadcast / MP4-export
   * mode. Zero when not in broadcast mode (and onSegmentStart never
   * fires).
   */
  private playbackStartMs = 0;
  /** Tracks which moveIndex we last fired onSegmentStart for. */
  private _lastFiredSegmentMoveIndex = -1;

  /**
   * MediaStreamAudioDestinationNode that mirrors the gain node so a
   * MediaRecorder can capture everything the queue plays. Only created
   * when startRecording() is called (broadcast / MP4-export mode); the
   * normal SPA path never instantiates it.
   */
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  /** Active MediaRecorder during a broadcast capture. */
  private mediaRecorder: MediaRecorder | null = null;
  /** Accumulated audio chunks. Combined into a single Blob by stopRecording(). */
  private recordedChunks: Blob[] = [];

  /** Number of commentary entries waiting or being played. */
  private _entryCount = 0;

  /** Timestamp when the queue last went idle (finished all playback). */
  private _idleSince: number = 0;
  /** Rolling window of dead air gaps (ms) — last 10. */
  private _deadAirGaps: number[] = [];
  /** Monotonic playback generation; incrementing cancels stale async work. */
  private generation = 0;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  /**
   * Start recording everything the queue plays from this point until
   * stopRecording() is called. Used by broadcast / MP4-export mode to
   * capture narration into the final MP4.
   *
   * Idempotent: if already recording, no-op. Creates the context lazily
   * if needed (AudioContext is normally lazy-created on first synth).
   */
  startRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') return;
    const ctx = this.getContext();
    if (!this.mediaStreamDest) {
      this.mediaStreamDest = ctx.createMediaStreamDestination();
      this.gainNode?.connect(this.mediaStreamDest);
    }
    this.recordedChunks = [];
    // MediaRecorder default mimetype is webm/opus on Chromium — fine
    // for ffmpeg to re-encode to AAC in the final MP4 mux.
    this.mediaRecorder = new MediaRecorder(this.mediaStreamDest.stream);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.recordedChunks.push(event.data);
    };
    // Pump chunks every 250 ms so a long capture doesn't sit on one
    // monolithic Blob until stop().
    this.mediaRecorder.start(250);
  }

  /**
   * Stop the active recording and return the accumulated audio Blob.
   * Resolves to null if recording was never started.
   */
  async stopRecording(): Promise<Blob | null> {
    if (!this.mediaRecorder) return null;
    const recorder = this.mediaRecorder;
    if (recorder.state === 'inactive') return new Blob(this.recordedChunks);
    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: recorder.mimeType || 'audio/webm' });
        this.mediaRecorder = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }

  /**
   * Set callback fired when each sentence begins playing.
   * Receives the sentence text and extracted chess squares.
   */
  setSentenceStartCallback(cb: SentenceStartCallback | null): void {
    this.onSentenceStart = cb;
  }

  /**
   * Set callback fired when the first sentence of a new commentary entry
   * begins audio playback. This is the correct moment to advance the board.
   */
  setEntryStartCallback(cb: EntryStartCallback | null): void {
    this.onEntryStart = cb;
  }

  /**
   * Set callback fired when a sentence belonging to a known render-plan
   * segment begins audio playback. Receives the segment index and the
   * offset from markPlaybackStart() in ms.
   *
   * Used only in broadcast / MP4-export mode (Phase 2). The capture
   * pipeline reads these offsets back through __CHESS_EXPORT__.state()
   * and re-times the render plan so composed narration audio sits at
   * the exact paint moment.
   */
  setSegmentStartCallback(cb: SegmentStartCallback | null): void {
    this.onSegmentStart = cb;
  }

  /**
   * Mark the moment __CHESS_EXPORT__.start() was called. All subsequent
   * onSegmentStart offsets are measured from this point.
   *
   * No-op outside broadcast mode. Calling again with 0 disables segment
   * timing emission for the rest of the queue's lifetime (used by the
   * reset path).
   */
  markPlaybackStart(performanceNow: number): void {
    this.playbackStartMs = performanceNow;
    this._lastFiredSegmentMoveIndex = -1;
  }

  /**
   * Enqueue a full commentary entry with board-sync metadata.
   * Board advances only when this entry's first sentence starts playing.
   */
  enqueueEntry(text: string, options: {
    synthOptions?: TtsSynthesizeOptions;
    maxMoveIndex?: number;
    moves?: NarrationMove[];
    entryId: string;
  }): void {
    const cleanText = stripMarkdownForTts(text);
    const sentences = splitIntoSentences(cleanText);
    this._entryCount++;
    let firstSentenceOfEntry = true;
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) {
        // Parse annotation tags from this sentence — strip from display/TTS, extract for board
        const { clean: cleanSentence, annotations } = parseAnnotations(trimmed);
        if (!cleanSentence) continue; // Skip sentences that were only annotation tags
        this.queue.push({
          text: cleanSentence,
          spokenText: sanToSpoken(cleanSentence),
          synthOptions: { ...options.synthOptions },
          // Preserve the legacy sentence-square signal that drives board focus.
          squares: extractChessSquares(cleanSentence),
          annotations,
          entryId: options.entryId,
          maxMoveIndex: options.maxMoveIndex,
          moves: options.moves,
          // Only the first sentence of an entry is treated as the
          // "head" — that's where the board advances and where the
          // export pipeline records the segment paint offset.
          isEntryHead: firstSentenceOfEntry,
        });
        firstSentenceOfEntry = false;
      }
    }
    this.ensureProcessing();
  }

  /**
   * Add text to the narration queue. Starts playback if not already running.
   */
  enqueue(text: string, options?: TtsSynthesizeOptions): void {
    const cleanText = stripMarkdownForTts(text);
    const sentences = splitIntoSentences(cleanText);
    this._entryCount++;
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) {
        const { clean: cleanSentence, annotations } = parseAnnotations(trimmed);
        if (!cleanSentence) continue;
        this.queue.push({
          text: cleanSentence,
          spokenText: sanToSpoken(cleanSentence),
          synthOptions: { ...options },
          squares: extractChessSquares(cleanSentence),
          annotations,
        });
      }
    }
    this.ensureProcessing();
  }

  /**
   * Interrupt current playback and replace with new text.
   * Stops any playing audio, clears the queue, then enqueues the new text.
   */
  interruptAndPlay(text: string, options?: TtsSynthesizeOptions): void {
    this.generation++;
    this.queue = [];
    this._entryCount = 0;
    this._lastFiredEntryId = null;
    this.prefetchPromise = null;
    this.processingPromise = null;

    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
    this.playing = false;

    // Clear board highlights
    this.onSentenceStart?.('', [], EMPTY_ANNOTATIONS);

    this.enqueue(text, options);
  }

  pause(): void {
    this.paused = true;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
  }

  resume(): void {
    this.paused = false;
    if (!this.playing && this.queue.length > 0) {
      this.ensureProcessing();
    }
  }

  stop(): void {
    this.generation++;
    this.queue = [];
    this.paused = false;
    this._entryCount = 0;
    this._lastFiredEntryId = null;
    this.prefetchPromise = null;
    this.processingPromise = null;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
    this.playing = false;

    // Clear board highlights
    this.onSentenceStart?.('', [], EMPTY_ANNOTATIONS);
  }

  dispose(): void {
    this.stop();
    this.onSentenceStart = null;
    this.onEntryStart = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.gainNode = null;
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  get isActive(): boolean {
    return this.playing || this.queue.length > 0;
  }

  /** Returns a promise that resolves when all queued narration finishes playing. */
  waitUntilDone(): Promise<void> {
    if (!this.isActive) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const check = () => {
        if (!this.isActive) {
          resolve();
        } else {
          setTimeout(check, 250);
        }
      };
      check();
    });
  }

  get pendingSegments(): number {
    return this.queue.length;
  }

  get backlogEntries(): number {
    return this._entryCount;
  }

  /** Average dead air gap in ms (time between narration ending and next entry playing). */
  get avgDeadAirMs(): number {
    if (this._deadAirGaps.length === 0) return 0;
    return this._deadAirGaps.reduce((a, b) => a + b, 0) / this._deadAirGaps.length;
  }

  /** Most recent dead air gap in ms (0 if no data yet). */
  get lastDeadAirMs(): number {
    return this._deadAirGaps.length > 0 ? this._deadAirGaps[this._deadAirGaps.length - 1] : 0;
  }

  private ensureProcessing(): void {
    if (this.processingPromise || this.playing || this.paused || this.queue.length === 0) return;
    this.playing = true;
    const runGeneration = this.generation;
    const runPromise: Promise<void> = this.processQueue(runGeneration).finally(() => {
      if (this.processingPromise === runPromise) {
        this.processingPromise = null;
      }
    });
    this.processingPromise = runPromise;
  }

  private async processQueue(runGeneration: number): Promise<void> {
    while (runGeneration === this.generation && this.queue.length > 0 && !this.paused) {
      const entry = this.queue.shift()!;

      try {
        // Use prefetched audio if available, otherwise synthesize spoken text
        let audioData: ArrayBuffer;
        if (this.prefetchPromise) {
          audioData = await this.prefetchPromise;
          this.prefetchPromise = null;
        } else {
          audioData = await synthesize(entry.spokenText, entry.synthOptions);
        }

        if (runGeneration !== this.generation) break;

        // Start prefetching the next segment while playing current
        if (runGeneration === this.generation && this.queue.length > 0) {
          const next = this.queue[0];
          this.prefetchPromise = synthesize(next.spokenText, next.synthOptions);
        }

        // Fire entry-start callback when a new commentary entry begins playing
        if (entry.entryId && entry.entryId !== this._lastFiredEntryId) {
          this._lastFiredEntryId = entry.entryId;

          // Measure dead air: gap between queue going idle and this entry starting
          if (this._idleSince > 0) {
            const gap = performance.now() - this._idleSince;
            // Only count meaningful gaps (>500ms — ignore back-to-back entries)
            if (gap > 500) {
              this._deadAirGaps.push(gap);
              if (this._deadAirGaps.length > 10) this._deadAirGaps.shift();
              console.log(`[TTS] Dead air: ${(gap / 1000).toFixed(1)}s | avg: ${(this.avgDeadAirMs / 1000).toFixed(1)}s`);
            }
            this._idleSince = 0;
          }

          if (entry.maxMoveIndex !== undefined) {
            this.onEntryStart?.(entry.maxMoveIndex, entry.moves || [], entry.entryId!);
          }
        }

        // Fire sentence start callback right before playback
        this.onSentenceStart?.(entry.text, entry.squares, entry.annotations);

        // Fire segment-start callback when this sentence opens a new
        // commentary entry AND we're in broadcast mode (markPlaybackStart
        // has been called with a non-zero performance.now). Recorded
        // once per moveIndex; the commentary entry's first sentence wins.
        if (
          entry.isEntryHead
          && entry.maxMoveIndex !== undefined
          && this.playbackStartMs > 0
          && entry.maxMoveIndex !== this._lastFiredSegmentMoveIndex
        ) {
          this._lastFiredSegmentMoveIndex = entry.maxMoveIndex;
          this.onSegmentStart?.(
            entry.maxMoveIndex,
            performance.now() - this.playbackStartMs,
          );
        }

        // Play the audio
        await this.playAudioBuffer(audioData, runGeneration);
      } catch (err) {
        if (runGeneration !== this.generation) break;
        console.warn('[TTS Queue] Synthesis/playback error:', err);

        // Still fire entry-start callback on synthesis failure so the board
        // advances and commentary panel highlights/scrolls correctly.
        if (entry.entryId && entry.entryId !== this._lastFiredEntryId) {
          this._lastFiredEntryId = entry.entryId;
          if (entry.maxMoveIndex !== undefined) {
            this.onEntryStart?.(entry.maxMoveIndex, entry.moves || [], entry.entryId!);
          }
        }
      }
    }

    if (runGeneration !== this.generation) {
      return;
    }

    this.playing = false;
    this.prefetchPromise = null;
    if (this.queue.length === 0) {
      this._entryCount = 0;
      this._idleSince = performance.now();
      // Clear highlights when narration finishes
      this.onSentenceStart?.('', [], EMPTY_ANNOTATIONS);
    }
  }

  private async playAudioBuffer(data: ArrayBuffer, runGeneration: number): Promise<void> {
    const ctx = this.getContext();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audioBuffer = await ctx.decodeAudioData(data.slice(0));
    if (runGeneration !== this.generation) return;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode!);

    this.currentSource = source;

    return new Promise<void>((resolve) => {
      source.onended = () => {
        this.currentSource = null;
        resolve();
      };
      source.start(0);
    });
  }
}

/**
 * Strip markdown formatting so text reads naturally for TTS.
 */
function stripMarkdownForTts(text: string): string {
  return text
    .replace(/^>\s*/gm, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Active-queue registry (broadcast mode) ─────────────────────────
//
// CommentaryPanel creates an AudioNarrationQueue per session. The
// MP4-export pipeline needs to reach the active queue to call
// markPlaybackStart() / setSegmentStartCallback() / startRecording().
//
// Race: bridge.start() fires BEFORE startReplay flips replayMode, so
// TournamentProgress hasn't rendered CommentaryPanel yet → the queue
// isn't registered yet. To handle this, the registry supports
// "pending hooks": callers can `runWhenAudioNarrationQueueAvailable(fn)`
// and the fn runs either immediately (queue exists) or when register
// is next called.

let activeAudioNarrationQueue: AudioNarrationQueue | null = null;
const pendingHooks: ((queue: AudioNarrationQueue) => void)[] = [];

/**
 * Register the audio narration queue currently driving playback. Called
 * by CommentaryPanel on mount. Unregister with null on unmount.
 * Pending hooks queued via runWhenAudioNarrationQueueAvailable fire
 * on the first non-null register since they were added.
 */
export function registerAudioNarrationQueue(queue: AudioNarrationQueue | null): void {
  activeAudioNarrationQueue = queue;
  if (queue && pendingHooks.length > 0) {
    const hooks = pendingHooks.splice(0, pendingHooks.length);
    for (const hook of hooks) {
      try { hook(queue); } catch (err) { console.warn('[AudioQueue] pending hook failed:', err); }
    }
  }
}

/** Returns the active audio narration queue, if any. */
export function getActiveAudioNarrationQueue(): AudioNarrationQueue | null {
  return activeAudioNarrationQueue;
}

/**
 * Run `fn` against the active audio queue — immediately if one is
 * already registered, otherwise as soon as the next register() call
 * lands. Used by the MP4 broadcast bridge to install
 * markPlaybackStart + startRecording the moment CommentaryPanel
 * mounts, even when bridge.start() fires before TournamentProgress
 * has flipped to replay mode.
 */
export function runWhenAudioNarrationQueueAvailable(fn: (queue: AudioNarrationQueue) => void): void {
  if (activeAudioNarrationQueue) {
    fn(activeAudioNarrationQueue);
    return;
  }
  pendingHooks.push(fn);
}

/**
 * Split text into sentence-level chunks for progressive TTS.
 */
function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/);
  const result: string[] = [];
  let current = '';

  for (const part of parts) {
    if (current.length + part.length > 200) {
      if (current) result.push(current);
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current) result.push(current);

  return result;
}
