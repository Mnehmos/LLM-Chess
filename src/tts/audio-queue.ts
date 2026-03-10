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
}

export type SentenceStartCallback = (text: string, squares: string[], annotations: BoardAnnotations) => void;
export type EntryStartCallback = (maxMoveIndex: number, moves: NarrationMove[], entryId: string) => void;

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
  private paused = false;
  private interrupted = false;
  private volume = 0.8;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private prefetchPromise: Promise<ArrayBuffer> | null = null;
  private onSentenceStart: SentenceStartCallback | null = null;
  private onEntryStart: EntryStartCallback | null = null;
  /** Tracks which entryId we last fired onEntryStart for. */
  private _lastFiredEntryId: string | null = null;

  /** Number of commentary entries waiting or being played. */
  private _entryCount = 0;

  /** Timestamp when the queue last went idle (finished all playback). */
  private _idleSince: number = 0;
  /** Rolling window of dead air gaps (ms) — last 10. */
  private _deadAirGaps: number[] = [];

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
          squares: extractChessSquares(cleanSentence),
          annotations,
          entryId: options.entryId,
          maxMoveIndex: options.maxMoveIndex,
          moves: options.moves,
        });
      }
    }
    if (!this.playing) {
      void this.processQueue();
    }
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
    if (!this.playing) {
      void this.processQueue();
    }
  }

  /**
   * Interrupt current playback and replace with new text.
   * Stops any playing audio, clears the queue, then enqueues the new text.
   */
  interruptAndPlay(text: string, options?: TtsSynthesizeOptions): void {
    this.interrupted = true;
    this.queue = [];
    this._entryCount = 0;
    this._lastFiredEntryId = null;
    this.prefetchPromise = null;

    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
    this.playing = false;
    this.interrupted = false;

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
      void this.processQueue();
    }
  }

  stop(): void {
    this.queue = [];
    this.paused = false;
    this.interrupted = true;
    this._entryCount = 0;
    this._lastFiredEntryId = null;
    this.prefetchPromise = null;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }
    this.playing = false;
    this.interrupted = false;

    // Clear board highlights
    this.onSentenceStart?.('', [], EMPTY_ANNOTATIONS);
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

  private async processQueue(): Promise<void> {
    this.playing = true;

    while (this.queue.length > 0 && !this.paused && !this.interrupted) {
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

        // Check for interrupt after synthesis
        if (this.interrupted) break;

        // Start prefetching the next segment while playing current
        if (this.queue.length > 0 && !this.interrupted) {
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

        // Play the audio
        await this.playAudioBuffer(audioData);
      } catch (err) {
        if (this.interrupted) break;
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

    this.playing = false;
    this.prefetchPromise = null;
    if (this.queue.length === 0) {
      this._entryCount = 0;
      this._idleSince = performance.now();
      // Clear highlights when narration finishes
      this.onSentenceStart?.('', [], EMPTY_ANNOTATIONS);
    }
  }

  private async playAudioBuffer(data: ArrayBuffer): Promise<void> {
    const ctx = this.getContext();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audioBuffer = await ctx.decodeAudioData(data.slice(0));
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
