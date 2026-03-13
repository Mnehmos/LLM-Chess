import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LichessPuzzle, PuzzleTurn } from '../commentary/puzzleBreak';
import { AudioNarrationQueue, type NarrationMove } from '../tts/audio-queue';
import { EMPTY_ANNOTATIONS, hasAnnotations, mergeAnnotations, parseAnnotations, type BoardAnnotations } from '../utils/board-annotations';
import { useSettingsStore, type TtsProvider } from '../store/settingsStore';

interface PuzzleBreakPanelProps {
  phase: 'hidden' | 'intro' | 'active';
  puzzle: LichessPuzzle | null;
  commentatorName: string;
  thinkingModelName: string;
  thinkingReasoningEffort: string;
  elapsedMs: number;
  introText: string;
  setupText: string;
  setupNarrated: boolean;
  outroText: string;
  outroNarrated: boolean;
  turnHistory: PuzzleTurn[];
  streamingText: string;
  thinkingText: string;
  streamingSide: 'w' | 'b' | null;
  isComplete: boolean;
  isLoading: boolean;
  error: string | null;
  onIntroComplete: () => void;
  onSetupComplete: () => void;
  onOutroComplete: () => void;
  onCommentaryComplete: () => void;
  onDismiss: () => void;
}

interface BoardSquare {
  symbol: string;
  isWhitePiece: boolean;
}

interface TtsSynthesizeOptions {
  provider?: TtsProvider;
  cloudApiKey?: string;
  cloudVoice?: string;
  voice?: string;
  port?: number;
}

const PIECE_SYMBOLS: Record<string, string> = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};

function fenToBoard(fen: string): BoardSquare[][] {
  const placement = fen.split(' ')[0];
  return placement.split('/').map((row) => {
    const squares: BoardSquare[] = [];
    for (const ch of row) {
      const empty = Number.parseInt(ch, 10);
      if (!Number.isNaN(empty)) {
        for (let i = 0; i < empty; i++) squares.push({ symbol: '', isWhitePiece: false });
      } else {
        squares.push({ symbol: PIECE_SYMBOLS[ch] ?? ch, isWhitePiece: ch === ch.toUpperCase() });
      }
    }
    return squares;
  });
}

function squareToCoords(square: string): { rank: number; file: number } | null {
  if (!square || square.length < 2) return null;
  return { rank: 8 - Number.parseInt(square[1], 10), file: square.charCodeAt(0) - 97 };
}

const SQ_SIZE = 58;
const BOARD_OFFSET = 22;

function sqToSvg(square: string): { x: number; y: number } {
  const coords = squareToCoords(square);
  if (!coords) return { x: 0, y: 0 };
  return {
    x: BOARD_OFFSET + coords.file * SQ_SIZE + SQ_SIZE / 2,
    y: coords.rank * SQ_SIZE + SQ_SIZE / 2,
  };
}

function AnnotationOverlay({ annotations }: { annotations: BoardAnnotations }) {
  const totalW = BOARD_OFFSET + 8 * SQ_SIZE;
  const totalH = 8 * SQ_SIZE;
  return (
    <svg
      className="absolute top-2 left-2 pointer-events-none"
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
    >
      {annotations.highlights.map((highlight, i) => {
        const coords = squareToCoords(highlight.square);
        if (!coords) return null;
        return (
          <rect
            key={`hl-${i}`}
            x={BOARD_OFFSET + coords.file * SQ_SIZE}
            y={coords.rank * SQ_SIZE}
            width={SQ_SIZE}
            height={SQ_SIZE}
            fill={highlight.color}
          />
        );
      })}
      {annotations.circles.map((circle, i) => {
        const { x, y } = sqToSvg(circle.square);
        return <circle key={`ci-${i}`} cx={x} cy={y} r={SQ_SIZE * 0.4} fill="none" stroke={circle.color} strokeWidth={2.5} />;
      })}
      {annotations.arrows.map((arrow, i) => {
        const from = sqToSvg(arrow.from);
        const to = sqToSvg(arrow.to);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;
        const shorten = SQ_SIZE * 0.35;
        const ex = to.x - (dx / len) * shorten;
        const ey = to.y - (dy / len) * shorten;
        const sx = from.x + (dx / len) * (SQ_SIZE * 0.25);
        const sy = from.y + (dy / len) * (SQ_SIZE * 0.25);
        return (
          <g key={`ar-${i}`}>
            <defs>
              <marker id={`puzzle-arrow-${i}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={arrow.color} />
              </marker>
            </defs>
            <line
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke={arrow.color}
              strokeWidth={5}
              strokeLinecap="round"
              markerEnd={`url(#puzzle-arrow-${i})`}
              opacity={0.85}
            />
          </g>
        );
      })}
    </svg>
  );
}

function PuzzleBoard({ fen, lastMoveUci, annotations }: { fen: string; lastMoveUci: string; annotations: BoardAnnotations }) {
  const board = fenToBoard(fen);
  const lastFrom = lastMoveUci ? squareToCoords(lastMoveUci.slice(0, 2)) : null;
  const lastTo = lastMoveUci ? squareToCoords(lastMoveUci.slice(2, 4)) : null;
  const squareStyle = { width: `${SQ_SIZE}px`, height: `${SQ_SIZE}px`, fontSize: `${Math.round(SQ_SIZE * 0.72)}px` };
  const fileLabelStyle = { width: `${SQ_SIZE}px` };
  const rankLabelStyle = { width: `${BOARD_OFFSET}px` };

  return (
    <div className="relative flex flex-col font-mono text-sm leading-none select-none bg-surface-2 rounded-xl p-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      {board.map((row, rankIndex) => (
        <div key={rankIndex} className="flex">
          <span className="text-text-muted text-xs flex items-center justify-center" style={rankLabelStyle}>{8 - rankIndex}</span>
          {row.map((square, fileIndex) => {
            const isLight = (rankIndex + fileIndex) % 2 === 0;
            const isLastFrom = lastFrom?.rank === rankIndex && lastFrom?.file === fileIndex;
            const isLastTo = lastTo?.rank === rankIndex && lastTo?.file === fileIndex;
            const pieceColor = square.symbol
              ? square.isWhitePiece
                ? 'text-amber-50 [text-shadow:0_0_2px_rgba(0,0,0,0.9),0_0_4px_rgba(0,0,0,0.6)]'
                : 'text-gray-900 [text-shadow:0_0_2px_rgba(255,255,255,0.5),0_0_4px_rgba(255,255,255,0.3)]'
              : '';
            let squareBg = isLight ? 'bg-board-light' : 'bg-board-dark';
            if (isLastTo) squareBg = 'bg-yellow-400/70';
            else if (isLastFrom) squareBg = 'bg-yellow-400/30';
            return (
              <div
                key={fileIndex}
                className={`flex items-center justify-center transition-colors duration-500 ${squareBg} ${pieceColor}`}
                style={squareStyle}
              >
                {square.symbol}
              </div>
            );
          })}
        </div>
      ))}
      <AnnotationOverlay annotations={annotations} />
      <div className="flex" style={{ marginLeft: `${BOARD_OFFSET}px` }}>
        {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => (
          <div key={file} className="text-center text-xs text-text-muted" style={fileLabelStyle}>{file}</div>
        ))}
      </div>
    </div>
  );
}

function buildMoveAnnotations(uci: string, side: 'w' | 'b' | null): BoardAnnotations {
  if (!uci || uci.length < 4) return EMPTY_ANNOTATIONS;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  return {
    arrows: [
      {
        from,
        to,
        color: side === 'b' ? 'rgba(255, 145, 0, 0.82)' : 'rgba(0, 200, 83, 0.78)',
      },
    ],
    highlights: [
      { square: from, color: side === 'b' ? 'rgba(255, 145, 0, 0.22)' : 'rgba(0, 200, 83, 0.2)' },
      { square: to, color: 'rgba(255, 214, 0, 0.6)' },
    ],
    circles: [],
  };
}

function buildSquareMentionAnnotations(squares: string[]): BoardAnnotations {
  if (!squares.length) return EMPTY_ANNOTATIONS;
  return {
    arrows: [],
    highlights: squares.map((square) => ({ square, color: 'rgba(255, 214, 0, 0.42)' })),
    circles: [],
  };
}

function CommentaryWithChip({ text, san }: { text: string; san: string }) {
  const moveTagRe = /\[move\s+[a-h][1-8]\s+[a-h][1-8](?:\s+[qrbn])?\s*\]/gi;
  const stripped = text.replace(/\[(?:arrow|highlight|circle)\s+[^\]]+\]/gi, '');
  const parts: Array<{ type: 'text' | 'chip'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let replaced = false;
  moveTagRe.lastIndex = 0;
  while ((match = moveTagRe.exec(stripped)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: stripped.slice(lastIndex, match.index) });
    parts.push({ type: 'chip', content: replaced ? match[0] : san });
    replaced = true;
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < stripped.length) parts.push({ type: 'text', content: stripped.slice(lastIndex) });
  if (parts.length === 0) parts.push({ type: 'text', content: stripped });

  return (
    <>
      {parts.map((part, i) => part.type === 'text' ? (
        <span key={i} className="whitespace-pre-wrap">{part.content}</span>
      ) : (
        <span
          key={i}
          className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold align-baseline"
        >
          {'\u265F'} {part.content}
        </span>
      ))}
    </>
  );
}

function sideLabel(side: 'w' | 'b' | null): string {
  if (side === 'w') return 'White';
  if (side === 'b') return 'Black';
  return 'Host';
}

export function PuzzleBreakPanel({
  phase,
  puzzle,
  commentatorName,
  thinkingModelName,
  thinkingReasoningEffort,
  elapsedMs,
  introText,
  setupText,
  setupNarrated,
  outroText,
  outroNarrated,
  turnHistory,
  streamingText,
  thinkingText,
  streamingSide,
  isComplete,
  isLoading,
  error,
  onIntroComplete,
  onSetupComplete,
  onOutroComplete,
  onCommentaryComplete,
  onDismiss,
}: PuzzleBreakPanelProps) {
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsProvider = useSettingsStore((s) => s.ttsProvider);
  const ttsCloudApiKey = useSettingsStore((s) => s.ttsCloudApiKey);
  const ttsCloudVoice = useSettingsStore((s) => s.ttsCloudVoice);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsVolume = useSettingsStore((s) => s.ttsVolume);
  const ttsPort = useSettingsStore((s) => s.ttsPort);

  const synthOptions = useMemo<TtsSynthesizeOptions>(() => ({
    provider: ttsProvider,
    cloudApiKey: ttsCloudApiKey,
    cloudVoice: ttsCloudVoice,
    voice: ttsVoice,
    port: ttsPort,
  }), [ttsCloudApiKey, ttsCloudVoice, ttsPort, ttsProvider, ttsVoice]);

  const narratorShort = commentatorName.split('/').pop() ?? commentatorName;
  const elapsedSec = Math.round(elapsedMs / 1000);
  const turnLogRef = useRef<HTMLDivElement>(null);
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const introCardRef = useRef<HTMLDivElement>(null);
  const setupCardRef = useRef<HTMLDivElement>(null);
  const outroCardRef = useRef<HTMLDivElement>(null);
  const turnCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const audioQueueRef = useRef<AudioNarrationQueue | null>(null);
  const narratedIdsRef = useRef<Set<string>>(new Set());
  const introQueuedRef = useRef(false);
  const introCompleteRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const outroCompleteRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const phaseRef = useRef(phase);
  const activeNarrationEntryRef = useRef<string | null>(null);
  const onIntroCompleteRef = useRef(onIntroComplete);
  const onSetupCompleteRef = useRef(onSetupComplete);
  const onOutroCompleteRef = useRef(onOutroComplete);
  const [revealedPlyIndex, setRevealedPlyIndex] = useState(-1);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [activeSentenceText, setActiveSentenceText] = useState('');
  const [narrationAnnotations, setNarrationAnnotations] = useState<BoardAnnotations>(EMPTY_ANNOTATIONS);

  phaseRef.current = phase;
  onIntroCompleteRef.current = onIntroComplete;
  onSetupCompleteRef.current = onSetupComplete;
  onOutroCompleteRef.current = onOutroComplete;

  useEffect(() => {
    setupCompleteRef.current = setupNarrated;
  }, [setupNarrated]);

  useEffect(() => {
    outroCompleteRef.current = outroNarrated;
  }, [outroNarrated]);

  const completeIntro = () => {
    if (introCompleteRef.current) return;
    introCompleteRef.current = true;
    onIntroCompleteRef.current();
  };

  const completeSetup = () => {
    if (setupCompleteRef.current) return;
    setupCompleteRef.current = true;
    onSetupCompleteRef.current();
  };

  const completeOutro = () => {
    if (outroCompleteRef.current) return;
    outroCompleteRef.current = true;
    onOutroCompleteRef.current();
  };

  const completeNarratedEntry = (entryId: string | null) => {
    if (entryId === 'puzzle-intro' && phaseRef.current === 'intro') {
      completeIntro();
      return;
    }
    if (phaseRef.current !== 'active') return;
    if (entryId === 'puzzle-setup') {
      completeSetup();
      return;
    }
    if (entryId === 'puzzle-outro') {
      completeOutro();
    }
  };

  useEffect(() => {
    if (!audioQueueRef.current) {
      audioQueueRef.current = new AudioNarrationQueue();
    }
    audioQueueRef.current.setVolume(ttsVolume);
    audioQueueRef.current.setSentenceStartCallback((text, squares, annotations) => {
      if (!text) {
        const finishedEntryId = activeNarrationEntryRef.current;
        activeNarrationEntryRef.current = null;
        setActiveEntryId(null);
        setActiveSentenceText('');
        setNarrationAnnotations(EMPTY_ANNOTATIONS);
        completeNarratedEntry(finishedEntryId);
        return;
      }
      setActiveSentenceText(text);
      const squareAnnotations = buildSquareMentionAnnotations(squares);
      setNarrationAnnotations(
        hasAnnotations(annotations)
          ? mergeAnnotations(squareAnnotations, annotations)
          : squareAnnotations,
      );
    });
    audioQueueRef.current.setEntryStartCallback((maxMoveIndex, _moves, entryId) => {
      if (activeNarrationEntryRef.current && activeNarrationEntryRef.current !== entryId) {
        completeNarratedEntry(activeNarrationEntryRef.current);
      }
      activeNarrationEntryRef.current = entryId;
      setActiveEntryId(entryId);
      if (maxMoveIndex >= 0) {
        setRevealedPlyIndex((prev) => Math.max(prev, maxMoveIndex));
      }
    });
    return () => {
      audioQueueRef.current?.stop();
    };
  }, [ttsVolume]);

  useEffect(() => {
    if (phase !== 'hidden') return;
    audioQueueRef.current?.stop();
    narratedIdsRef.current.clear();
    introQueuedRef.current = false;
    introCompleteRef.current = false;
    setupCompleteRef.current = false;
    outroCompleteRef.current = false;
    completionNotifiedRef.current = false;
    activeNarrationEntryRef.current = null;
    setRevealedPlyIndex(-1);
    setActiveEntryId(null);
    setActiveSentenceText('');
    setNarrationAnnotations(EMPTY_ANNOTATIONS);
  }, [phase, puzzle?.id]);

  useEffect(() => {
    if (phase === 'hidden' || !introText || introCompleteRef.current) return;
    if (!ttsEnabled) {
      completeIntro();
      return;
    }
    if (!audioQueueRef.current || introQueuedRef.current) return;
    introQueuedRef.current = true;
    narratedIdsRef.current.add('puzzle-intro');
    audioQueueRef.current.enqueueEntry(introText, {
      synthOptions,
      maxMoveIndex: -1,
      moves: [],
      entryId: 'puzzle-intro',
    });
  }, [introText, onIntroComplete, phase, synthOptions, ttsEnabled]);

  useEffect(() => {
    if (phase !== 'active') return;
    if (!setupText) return;
    if (setupCompleteRef.current) return;
    if (!ttsEnabled) {
      completeSetup();
      return;
    }
    if (!audioQueueRef.current || narratedIdsRef.current.has('puzzle-setup')) return;
    narratedIdsRef.current.add('puzzle-setup');
    audioQueueRef.current.enqueueEntry(setupText, {
      synthOptions,
      maxMoveIndex: -1,
      moves: [],
      entryId: 'puzzle-setup',
    });
  }, [completeSetup, phase, setupText, synthOptions, ttsEnabled]);

  useEffect(() => {
    if (phase !== 'active') return;
    if (!ttsEnabled) {
      setRevealedPlyIndex(turnHistory.length - 1);
      return;
    }
    if (!audioQueueRef.current) return;
    for (let i = 0; i < turnHistory.length; i++) {
      const entryId = `puzzle-turn-${i}`;
      if (narratedIdsRef.current.has(entryId)) continue;
      const turn = turnHistory[i];
      narratedIdsRef.current.add(entryId);
      const moves: NarrationMove[] = turn.uci
        ? [{ from: turn.uci.slice(0, 2), to: turn.uci.slice(2, 4), color: turn.side }]
        : [];
      audioQueueRef.current.enqueueEntry(turn.rawCommentary || turn.commentary, {
        synthOptions,
        maxMoveIndex: i,
        moves,
        entryId,
      });
    }
  }, [phase, setupNarrated, synthOptions, ttsEnabled, turnHistory]);

  useEffect(() => {
    if (phase !== 'active' || !outroText) return;
    if (outroCompleteRef.current) return;
    if (!ttsEnabled) {
      completeOutro();
      return;
    }
    if (!audioQueueRef.current || narratedIdsRef.current.has('puzzle-outro')) return;
    narratedIdsRef.current.add('puzzle-outro');
    audioQueueRef.current.enqueueEntry(outroText, {
      synthOptions,
      maxMoveIndex: Math.max(0, turnHistory.length - 1),
      moves: [],
      entryId: 'puzzle-outro',
    });
  }, [outroText, phase, synthOptions, ttsEnabled, turnHistory.length]);

  useEffect(() => {
    const el = thinkingScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinkingText]);

  const visibleTurns = useMemo(() => {
    if (phase !== 'active') return [];
    const count = ttsEnabled ? Math.max(0, revealedPlyIndex + 1) : turnHistory.length;
    return turnHistory.slice(0, count);
  }, [phase, revealedPlyIndex, ttsEnabled, turnHistory]);

  const displayFen = visibleTurns.length > 0 ? visibleTurns[visibleTurns.length - 1].fenAfter : (puzzle?.fen ?? '');
  const displayLastMoveUci = visibleTurns.length > 0 ? visibleTurns[visibleTurns.length - 1].uci : '';
  const setupSide = (puzzle?.fen?.split(' ')[1] === 'b' ? 'b' : 'w') as 'w' | 'b';
  const parsedSetupAnnotations = setupText
    ? parseAnnotations(setupText, { fen: puzzle?.fen, sideToMove: setupSide }).annotations
    : EMPTY_ANNOTATIONS;
  const setupMoveUci = turnHistory[0]?.uci || puzzle?.solution?.[0] || '';
  const setupAnnotations = hasAnnotations(parsedSetupAnnotations)
    ? mergeAnnotations(buildMoveAnnotations(setupMoveUci, setupSide), parsedSetupAnnotations)
    : buildMoveAnnotations(setupMoveUci, setupSide);
  const latestVisibleAnnotations = visibleTurns.length > 0 ? visibleTurns[visibleTurns.length - 1].annotations : EMPTY_ANNOTATIONS;
  const streamingAnnotations = streamingText
    ? parseAnnotations(streamingText, { fen: displayFen, sideToMove: streamingSide ?? undefined }).annotations
    : null;
  const showSetupAnnotations = !!setupText && revealedPlyIndex < 0;
  const activeEntryFallbackAnnotations = useMemo(() => {
    if (!activeEntryId) return EMPTY_ANNOTATIONS;
    if (activeEntryId === 'puzzle-setup') return setupAnnotations;
    if (activeEntryId === 'puzzle-outro') return latestVisibleAnnotations;
    if (activeEntryId.startsWith('puzzle-turn-')) {
      const index = Number.parseInt(activeEntryId.slice('puzzle-turn-'.length), 10);
      const turn = Number.isNaN(index) ? null : turnHistory[index];
      if (!turn) return EMPTY_ANNOTATIONS;
      return hasAnnotations(turn.annotations)
        ? turn.annotations
        : buildMoveAnnotations(turn.uci, turn.side);
    }
    return EMPTY_ANNOTATIONS;
  }, [activeEntryId, latestVisibleAnnotations, setupAnnotations, turnHistory]);
  const effectiveNarrationAnnotations = activeEntryId
    ? (hasAnnotations(narrationAnnotations)
      ? mergeAnnotations(activeEntryFallbackAnnotations, narrationAnnotations)
      : activeEntryFallbackAnnotations)
    : EMPTY_ANNOTATIONS;
  const activeAnnotations = ttsEnabled
    ? (activeEntryId
      ? effectiveNarrationAnnotations
      : (showSetupAnnotations ? setupAnnotations : latestVisibleAnnotations))
    : (streamingAnnotations ?? (showSetupAnnotations ? setupAnnotations : latestVisibleAnnotations));
  const displayComplete = isComplete && (!ttsEnabled || revealedPlyIndex >= turnHistory.length - 1);
  const outroReady = !isComplete || (!!outroText && outroNarrated);
  const outroMissingFallbackReady = displayComplete && !outroText && !streamingText && !thinkingText;
  const hasAudioQueue = !!audioQueueRef.current;
  const showLeadIn = visibleTurns.length === 0 && !!setupText && !displayComplete;
  const showThinkingOnly = !!thinkingText && !streamingText && !displayComplete;
  const showOutroCard = !!outroText && displayComplete;
  const showIntroCard = (phase === 'intro' || !introCompleteRef.current) && (!!introText || isLoading || !!thinkingText);
  const turnLogAnchorKey = `${activeEntryId ?? ''}|${turnHistory.length}|${revealedPlyIndex}|${!!setupText}|${!!outroText}|${showIntroCard}`;

  useLayoutEffect(() => {
    const container = turnLogRef.current;
    const target =
      activeEntryId === 'puzzle-intro' ? introCardRef.current
      : activeEntryId === 'puzzle-setup' ? setupCardRef.current
      : activeEntryId === 'puzzle-outro' ? outroCardRef.current
      : (activeEntryId ? turnCardRefs.current[activeEntryId] ?? null : null);
    if (!container || !target) return;

    const frame = window.requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const currentTop = container.scrollTop;
      const relativeTop = targetRect.top - containerRect.top + currentTop;
      const centeredTop = relativeTop - (container.clientHeight / 2) + (target.clientHeight / 2);
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextTop = Math.max(0, Math.min(centeredTop, maxTop));
      const distance = Math.abs(nextTop - currentTop);

      container.scrollTo({
        top: nextTop,
        behavior: distance > 24 ? 'smooth' : 'auto',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [turnLogAnchorKey, activeEntryId, activeSentenceText]);

  useEffect(() => {
    if (!displayComplete || !outroReady || completionNotifiedRef.current) return;
    if (!ttsEnabled || !hasAudioQueue) {
      completionNotifiedRef.current = true;
      onCommentaryComplete();
      return;
    }
    const audioQueue = audioQueueRef.current;
    if (!audioQueue) return;
    let cancelled = false;
    void audioQueue.waitUntilDone().then(() => {
      if (cancelled || completionNotifiedRef.current || phaseRef.current !== 'active') return;
      completionNotifiedRef.current = true;
      onCommentaryComplete();
    });
    return () => {
      cancelled = true;
    };
  }, [displayComplete, hasAudioQueue, onCommentaryComplete, outroReady, ttsEnabled]);

  useEffect(() => {
    if (!outroMissingFallbackReady || completionNotifiedRef.current) return;
    if (!ttsEnabled || !hasAudioQueue) {
      const timer = window.setTimeout(() => {
        if (completionNotifiedRef.current || phaseRef.current !== 'active') return;
        completionNotifiedRef.current = true;
        onCommentaryComplete();
      }, 1500);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void audioQueueRef.current?.waitUntilDone().then(() => {
        if (cancelled || completionNotifiedRef.current || phaseRef.current !== 'active') return;
        completionNotifiedRef.current = true;
        onCommentaryComplete();
      });
    }, 1500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasAudioQueue, onCommentaryComplete, outroMissingFallbackReady, ttsEnabled]);

  if (phase === 'hidden') return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-0/92 backdrop-blur-md">
      <div className="bg-surface-1 border border-amber-500/30 rounded-2xl shadow-2xl w-[min(96vw,1680px)] h-[min(92vh,1040px)] mx-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-amber-400 tracking-[0.22em] uppercase">Puzzle Break</span>
            <span className="text-base text-text-muted">
              While <span className="text-text-secondary font-medium">{thinkingModelName}</span> thinks on{' '}
              <span className="text-amber-300">{thinkingReasoningEffort}</span> reasoning... {elapsedSec}s
            </span>
          </div>
          <button type="button" onClick={onDismiss} className="text-base text-text-muted hover:text-text-primary transition-colors">
            Skip -&gt;
          </button>
        </div>

        <div className="grid grid-cols-[720px_minmax(0,1fr)] gap-8 p-6 flex-1 min-h-0 items-stretch overflow-hidden">
          <div className="flex h-full flex-col justify-start flex-shrink-0">
            {displayFen ? (
              <div>
                <PuzzleBoard fen={displayFen} lastMoveUci={displayLastMoveUci} annotations={activeAnnotations} />
                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  {puzzle && (
                    <>
                      <span className="text-base bg-surface-2 text-text-muted px-3 py-1 rounded-full">{`\u2605 ${puzzle.rating}`}</span>
                      {puzzle.themes.slice(0, 3).map((theme) => (
                        <span key={theme} className="text-base bg-purple-dim text-purple-light px-3 py-1 rounded-full capitalize">{theme}</span>
                      ))}
                    </>
                  )}
                  {turnHistory.length > 0 && (
                    <span className="text-base text-amber-400/80 ml-auto">{visibleTurns.length}/{puzzle?.solution.length ?? 0}</span>
                  )}
                  {displayComplete && (
                    <span className="text-base text-green-400 font-bold ml-1">Solved</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-[408px] h-[408px] bg-surface-2 rounded-xl flex items-center justify-center">
                <span className="text-text-muted text-lg">Loading puzzle...</span>
              </div>
            )}
          </div>

          <div className="flex h-full max-h-full flex-col gap-3 min-w-0 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-base text-text-muted">Hosted by</span>
              <span className="text-base font-medium text-purple-light">{narratorShort}</span>
              {isLoading && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
              {(streamingText || thinkingText) && !displayComplete && (
                <span className="text-sm text-amber-400/70 ml-auto animate-pulse">live analysis...</span>
              )}
            </div>

            <div ref={turnLogRef} className="flex-1 min-h-0 max-h-full overflow-y-auto flex flex-col gap-2 pr-1">
              {showIntroCard && (
                <div ref={introCardRef} className={`rounded-xl p-3 text-base text-text-secondary leading-relaxed border ${activeEntryId === 'puzzle-intro' ? 'bg-purple-accent/16 border-purple-accent/35 shadow-[0_0_0_1px_rgba(168,85,247,0.18)]' : 'bg-purple-accent/12 border-purple-accent/25'}`}>
                  <div className="text-sm text-purple-light/70 mb-1 font-medium">Host intro</div>
                  {introText ? (
                    <p className="whitespace-pre-wrap">{introText}</p>
                  ) : (
                    <p className="text-text-muted italic">Setting up the break...</p>
                  )}
                  {activeEntryId === 'puzzle-intro' && activeSentenceText && (
                    <p className="mt-2 rounded-lg bg-surface-0/45 px-3 py-2 text-sm text-amber-200/90 border border-amber-400/20">
                      {activeSentenceText}
                    </p>
                  )}
                </div>
              )}

              {isLoading && turnHistory.length === 0 && !showIntroCard && (
                <span className="text-text-muted italic text-xs">Fetching puzzle...</span>
              )}
              {error && <span className="text-error text-xs">{error}</span>}

              {showLeadIn && (
                <div ref={setupCardRef} className={`rounded-xl p-3 text-base text-text-secondary leading-relaxed border ${activeEntryId === 'puzzle-setup' ? 'bg-purple-accent/16 border-purple-accent/35 shadow-[0_0_0_1px_rgba(168,85,247,0.18)]' : 'bg-purple-accent/12 border-purple-accent/25'}`}>
                  <div className="text-sm text-purple-light/70 mb-1 font-medium">Position setup</div>
                  <p className="whitespace-pre-wrap">
                    <CommentaryWithChip text={setupText} san="..." />
                  </p>
                  {activeEntryId === 'puzzle-setup' && activeSentenceText && (
                    <p className="mt-2 rounded-lg bg-surface-0/45 px-3 py-2 text-sm text-amber-200/90 border border-amber-400/20">
                      {activeSentenceText}
                    </p>
                  )}
                </div>
              )}

              {visibleTurns.map((turn, index) => {
                const entryId = `puzzle-turn-${index}`;
                const isActiveTurn = activeEntryId === entryId;
                return (
                  <div
                    key={entryId}
                    ref={(node) => {
                      turnCardRefs.current[entryId] = node;
                    }}
                    className={`rounded-xl p-3 text-base leading-relaxed border ${isActiveTurn ? 'bg-purple-accent/18 border-purple-accent/35 shadow-[0_0_0_1px_rgba(168,85,247,0.18)]' : 'bg-surface-2/70 border-transparent'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-sm text-purple-light/70 font-medium">{sideLabel(turn.side)}</div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-base font-mono font-bold">
                        {'\u265F'} {turn.san}
                      </span>
                    </div>
                    {turn.commentary && (
                      <p className="text-text-secondary leading-relaxed whitespace-pre-wrap">
                        <CommentaryWithChip text={turn.rawCommentary || turn.commentary} san={turn.san} />
                      </p>
                    )}
                    {isActiveTurn && activeSentenceText && (
                      <p className="mt-2 rounded-lg bg-surface-0/45 px-3 py-2 text-sm text-amber-200/90 border border-amber-400/20">
                        {activeSentenceText}
                      </p>
                    )}
                  </div>
                );
              })}

              {showThinkingOnly && (
                <div className="bg-surface-2/50 border border-border/30 rounded-xl p-3 text-base text-text-secondary leading-relaxed">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-sm text-purple-light/70 font-medium">{sideLabel(streamingSide)}</div>
                    <span className="text-sm text-amber-400/70 animate-pulse">building the first line...</span>
                  </div>
                  <div ref={thinkingScrollRef} className="h-[96px] bg-surface-0/60 border border-border/40 rounded-lg px-3 py-2 overflow-y-auto">
                    <span className="text-sm text-amber-400/60 mr-1 select-none">{String.fromCodePoint(0x1F9E0)}</span>
                    <span className="text-sm text-text-muted/70 leading-snug whitespace-pre-wrap font-mono">{thinkingText}</span>
                  </div>
                </div>
              )}

              {streamingText && !displayComplete && (
                <div className="bg-surface-2/50 border border-border/30 rounded-xl p-3 text-base text-text-secondary leading-relaxed">
                  <div className="text-sm text-purple-light/70 mb-1 font-medium">{sideLabel(streamingSide)}</div>
                  {thinkingText && (
                    <div ref={thinkingScrollRef} className="h-[78px] bg-surface-0/60 border border-border/40 rounded-lg px-3 py-2 overflow-y-auto mb-2">
                      <span className="text-sm text-amber-400/60 mr-1 select-none">{String.fromCodePoint(0x1F9E0)}</span>
                      <span className="text-sm text-text-muted/70 leading-snug whitespace-pre-wrap font-mono">{thinkingText}</span>
                    </div>
                  )}
                  <CommentaryWithChip text={streamingText} san="..." />
                  <span className="inline-block w-0.5 h-4 bg-purple-accent animate-pulse ml-0.5 align-bottom" />
                </div>
              )}

              {displayComplete && (
                <div className="text-center text-base text-green-400/80 py-1">Puzzle complete</div>
              )}

              {showOutroCard && (
                <div ref={outroCardRef} className={`rounded-xl p-3 text-base text-text-secondary leading-relaxed border ${activeEntryId === 'puzzle-outro' ? 'bg-purple-accent/16 border-purple-accent/35 shadow-[0_0_0_1px_rgba(168,85,247,0.18)]' : 'bg-surface-2/60 border-border/30'}`}>
                  <div className="text-sm text-purple-light/70 mb-1 font-medium">Wrap-up</div>
                  <p className="whitespace-pre-wrap">
                    <CommentaryWithChip text={outroText} san="..." />
                  </p>
                  {activeEntryId === 'puzzle-outro' && activeSentenceText && (
                    <p className="mt-2 rounded-lg bg-surface-0/45 px-3 py-2 text-sm text-amber-200/90 border border-amber-400/20">
                      {activeSentenceText}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-sm text-text-muted text-right mt-auto">
              Puzzle by <a href="https://lichess.org" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary underline">Lichess.org</a> - Creative Commons
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
