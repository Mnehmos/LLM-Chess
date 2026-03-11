import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentaryEntry } from '../commentary/commentaryQueue';
import { AudioNarrationQueue, type NarrationMove } from '../tts/audio-queue';
import { checkTtsHealth, checkCloudTtsHealth, type TtsStatus, type TtsSynthesizeOptions } from '../tts/tts-client';
import { useSettingsStore } from '../store/settingsStore';
import { segmentChessMoves } from '../utils/chess-squares';
import type { BoardAnnotations } from '../utils/board-annotations';
import { registerNarrationGate, registerNarrationStop } from '../store/tournamentStore';

interface CommentaryPanelProps {
  entries: CommentaryEntry[];
  commentatorModelName?: string;
  /** Called when narration audio begins playing for an entry — passes its maxMoveIndex for board sync. */
  onNarrationStart?: (maxMoveIndex: number, moves: NarrationMove[]) => void;
  /** Called when sentence starts playing — passes highlighted squares and annotations for board. */
  onNarrationSquares?: (squares: string[], annotations: BoardAnnotations) => void;
  /** Shared ref for dead air measurement — CommentaryPanel writes, CommentaryQueue reads. */
  deadAirRef?: React.MutableRefObject<number>;
  /** Shared ref for audio backlog count — filler system reads it. */
  audioBacklogRef?: React.MutableRefObject<number>;
}

export function CommentaryPanel({ entries, commentatorModelName, onNarrationStart, onNarrationSquares, deadAirRef, audioBacklogRef }: CommentaryPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioQueueRef = useRef<AudioNarrationQueue | null>(null);
  const narratedIdsRef = useRef<Set<string>>(new Set());
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const entryRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const ttsEnabled = useSettingsStore(s => s.ttsEnabled);
  const ttsProvider = useSettingsStore(s => s.ttsProvider);
  const ttsCloudApiKey = useSettingsStore(s => s.ttsCloudApiKey);
  const ttsCloudVoice = useSettingsStore(s => s.ttsCloudVoice);
  const ttsVoice = useSettingsStore(s => s.ttsVoice);
  const ttsVolume = useSettingsStore(s => s.ttsVolume);
  const ttsPort = useSettingsStore(s => s.ttsPort);
  const setTtsEnabled = useSettingsStore(s => s.setTtsEnabled);
  const [ttsStatus, setTtsStatus] = useState<TtsStatus | null>(null);

  // Build synth options from current settings
  const synthOptions: TtsSynthesizeOptions = {
    provider: ttsProvider,
    cloudApiKey: ttsCloudApiKey,
    cloudVoice: ttsCloudVoice,
    voice: ttsVoice,
    port: ttsPort,
  };

  // Initialize audio queue and register narration gate
  useEffect(() => {
    if (!audioQueueRef.current) {
      audioQueueRef.current = new AudioNarrationQueue();
    }
    audioQueueRef.current.setVolume(ttsVolume);
    // Register narration gate so game completion waits for audio to finish
    registerNarrationGate(() => audioQueueRef.current?.waitUntilDone() ?? Promise.resolve());
    // Register stop callback so aborting/skipping kills audio immediately
    registerNarrationStop(() => audioQueueRef.current?.stop());
    return () => {
      // Stop any playing audio when component unmounts or effect re-runs
      audioQueueRef.current?.stop();
      registerNarrationGate(null);
      registerNarrationStop(null);
    };
  }, [ttsVolume]);

  // Wire sentence-start callback for board highlights
  useEffect(() => {
    if (!audioQueueRef.current) return;
    audioQueueRef.current.setSentenceStartCallback((_text, squares, annotations) => {
      onNarrationSquares?.(squares, annotations);
      // Clear active entry indicator when narration finishes (empty text = queue idle)
      if (!_text) setActiveEntryId(null);
    });
  }, [onNarrationSquares]);

  // Wire entry-start callback for board advancement (fires when audio actually plays)
  useEffect(() => {
    if (!audioQueueRef.current) return;
    audioQueueRef.current.setEntryStartCallback((maxMoveIndex, moves, entryId) => {
      onNarrationStart?.(maxMoveIndex, moves);
      // Track active narration entry and scroll to it
      setActiveEntryId(entryId);
      const el = entryRefsMap.current.get(entryId);
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Update shared refs for commentary queue self-tuning
      if (audioQueueRef.current) {
        if (deadAirRef) deadAirRef.current = audioQueueRef.current.avgDeadAirMs;
        if (audioBacklogRef) audioBacklogRef.current = audioQueueRef.current.backlogEntries;
      }
    });
  }, [onNarrationStart, deadAirRef, audioBacklogRef]);

  // Check TTS health when enabled
  useEffect(() => {
    if (!ttsEnabled) return;
    if (ttsProvider === 'local') {
      void checkTtsHealth(ttsPort).then(setTtsStatus);
    } else {
      void checkCloudTtsHealth(ttsProvider, ttsCloudApiKey).then(setTtsStatus);
    }
  }, [ttsEnabled, ttsProvider, ttsCloudApiKey, ttsPort]);

  // Auto-narrate completed commentary entries sequentially (no interrupts)
  // Board advancement happens via the entryStart callback when audio actually plays.
  useEffect(() => {
    if (!ttsEnabled || !audioQueueRef.current) return;

    for (const entry of entries) {
      // Skip entries still streaming, already narrated, or error messages
      if (entry.streaming || !entry.text || narratedIdsRef.current.has(entry.id)) continue;
      if (entry.text.startsWith('(')) continue; // Skip error placeholders

      narratedIdsRef.current.add(entry.id);
      console.log(`[TTS] Auto-narrating entry ${entry.id}: "${entry.text.slice(0, 60)}..."`);

      // Build move arrows from entry's structured move data
      const narrationMoves: NarrationMove[] = entry.moves
        .filter(m => m.from && m.to)
        .map(m => ({ from: m.from!, to: m.to!, color: m.color }));

      audioQueueRef.current.enqueueEntry(entry.rawText || entry.text, {
        synthOptions,
        maxMoveIndex: entry.maxMoveIndex,
        moves: narrationMoves,
        entryId: entry.id,
      });
    }
  }, [entries, ttsEnabled, ttsProvider, ttsCloudApiKey, ttsCloudVoice, ttsVoice, ttsPort]);

  // Stop narration when TTS is disabled
  useEffect(() => {
    if (!ttsEnabled && audioQueueRef.current) {
      audioQueueRef.current.stop();
    }
  }, [ttsEnabled]);

  const handleNarrate = useCallback((text: string) => {
    if (!audioQueueRef.current) return;
    audioQueueRef.current.enqueue(text, synthOptions);
  }, [ttsProvider, ttsCloudApiKey, ttsCloudVoice, ttsVoice, ttsPort]);

  // Auto-scroll: when TTS is off, scroll to bottom on new entries.
  // When TTS is on, the entry-start callback scrolls to the active entry.
  useEffect(() => {
    if (!ttsEnabled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, ttsEnabled]);

  if (!commentatorModelName) {
    return (
      <div className="p-4 bg-surface-1 rounded-lg h-full flex flex-col">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Commentator</h3>
        <p className="text-xs text-text-muted flex-1 flex items-center justify-center">
          Select a commentator model to enable live analysis
        </p>
      </div>
    );
  }

  const displayName = commentatorModelName.split('/').pop();
  const providerLabel = ttsProvider === 'local' ? 'local' : ttsProvider === 'qwen-cloud' ? 'qwen' : 'openai';

  function exportCommentary() {
    const lines: string[] = [];
    for (const entry of entries) {
      if (!entry.text || entry.text.startsWith('(')) continue;
      if (entry.isFiller) {
        lines.push('[Commentary]');
      } else {
        const moveLabels = entry.moves.map(m => `Move ${m.moveNumber}. ${m.move} (${m.color === 'w' ? 'White' : 'Black'})`).join(', ');
        lines.push(moveLabels || '[Commentary]');
      }
      lines.push(entry.text);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'commentary.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 bg-surface-1 rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary">Commentator</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={ttsEnabled ? 'Disable TTS narration' : 'Enable TTS narration'}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              ttsEnabled
                ? 'bg-purple-accent text-white'
                : 'bg-surface-2 text-text-muted hover:text-text-primary'
            }`}
          >
            {ttsEnabled ? `TTS ON (${providerLabel})` : 'TTS'}
          </button>
          {ttsEnabled && ttsStatus && !ttsStatus.running && (
            <span className="text-[10px] text-warning">
              {ttsProvider === 'local' ? 'server offline' : 'API error'}
            </span>
          )}
          {ttsEnabled && ttsStatus?.running && (
            <span className="text-[10px] text-green-400">ready</span>
          )}
          {entries.length > 0 && (
            <button
              type="button"
              onClick={exportCommentary}
              title="Export commentary as text file"
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
            >
              Export
            </button>
          )}
          <span className="text-xs text-text-muted">{displayName}</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {entries.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">Waiting for first move...</p>
        )}
        {entries.map((entry) => {
          const isActive = ttsEnabled && activeEntryId === entry.id;
          return (
            <div
              key={entry.id}
              ref={(el) => {
                if (el) entryRefsMap.current.set(entry.id, el);
                else entryRefsMap.current.delete(entry.id);
              }}
              className={`text-sm transition-all duration-300 rounded px-2 py-1 -mx-2 ${
                entry.isFiller && !isActive ? 'opacity-80' : ''
              } ${isActive ? 'bg-purple-accent/15 border-l-2 border-purple-accent' : 'border-l-2 border-transparent'}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-accent animate-pulse shrink-0" />
                )}
                {entry.isFiller ? (
                  <span className="text-[10px] text-text-muted italic">commentary</span>
                ) : (
                  entry.moves.map((m, j) => (
                    <span key={j} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${m.color === 'w' ? 'bg-white' : 'bg-gray-600'}`} />
                      <span className="text-xs font-mono text-purple-light">
                        {m.moveNumber}. {m.move}
                      </span>
                    </span>
                  ))
                )}
                {entry.streaming && (
                  <span className="w-1 h-1 rounded-full bg-purple-accent animate-pulse" />
                )}
                {ttsEnabled && !entry.streaming && entry.text && (
                  <button
                    type="button"
                    onClick={() => handleNarrate(entry.text)}
                    title="Replay narration"
                    className="text-[10px] text-text-muted hover:text-purple-light transition-colors ml-auto"
                  >
                    [speak]
                  </button>
                )}
              </div>
              <div className={`text-xs leading-relaxed pl-3.5 ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
                {entry.text
                  ? <RichCommentaryText text={entry.text} />
                  : entry.streaming
                    ? <span className="text-text-muted italic">{entry.isFiller ? 'thinking...' : 'analyzing...'}</span>
                    : null
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Render commentary text with chess moves highlighted in amber (matching board highlights). */
function RichCommentaryText({ text }: { text: string }) {
  const segments = segmentChessMoves(text);

  return (
    <span>
      {segments.map((seg, i) =>
        seg.isChessMove ? (
          <span key={i} className="font-bold text-amber-300">{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
