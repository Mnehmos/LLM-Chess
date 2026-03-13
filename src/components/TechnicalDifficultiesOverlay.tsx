import { useEffect, useState, useCallback } from 'react';

// ─── Board helpers ─────────────────────────────────────────────────────────────

type BoardPos = Record<string, string>;

function initBoard(): BoardPos {
  return {
    a8:'♜',b8:'♞',c8:'♝',d8:'♛',e8:'♚',f8:'♝',g8:'♞',h8:'♜',
    a7:'♟',b7:'♟',c7:'♟',d7:'♟',e7:'♟',f7:'♟',g7:'♟',h7:'♟',
    a2:'♙',b2:'♙',c2:'♙',d2:'♙',e2:'♙',f2:'♙',g2:'♙',h2:'♙',
    a1:'♖',b1:'♘',c1:'♗',d1:'♕',e1:'♔',f1:'♗',g1:'♘',h1:'♖',
  };
}

function mv(b: BoardPos, from: string, to: string): BoardPos {
  const n = { ...b };
  n[to] = n[from];
  delete n[from];
  return n;
}

// ─── Opening definitions ───────────────────────────────────────────────────────

interface Frame {
  board: BoardPos;
  move: string;
  annotation: string;
  highlights: string[];
}

interface Opening {
  name: string;
  eco: string;
  emoji: string;
  tagline: string;
  frames: Frame[];
}

function buildSicilian(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'e2','e4');
  const b2 = mv(b1,'c7','c5');
  const b3 = mv(b2,'g1','f3');
  const b4 = mv(b3,'d7','d6');
  const b5 = mv(b4,'d2','d4');
  const b6 = mv(b5,'c5','d4');
  const b7 = mv(b6,'f3','d4');
  const b8 = mv(b7,'a7','a6');
  return {
    name: 'Sicilian Defense', eco: 'B90', emoji: '🐉',
    tagline: "Black's sharpest weapon against 1.e4",
    frames: [
      { board: b0, move: '—',       annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. e4',   annotation: 'White occupies the center', highlights: ['e4'] },
      { board: b2, move: '1... c5', annotation: 'The Sicilian! Fights for d4 asymmetrically', highlights: ['c5'] },
      { board: b3, move: '2. Nf3',  annotation: 'Knight develops, targets d4 & e5', highlights: ['f3'] },
      { board: b4, move: '2... d6', annotation: 'Najdorf setup — flexible defense', highlights: ['d6'] },
      { board: b5, move: '3. d4',   annotation: 'White strikes the center!', highlights: ['d4'] },
      { board: b6, move: '3... cxd4', annotation: 'Black captures, opening the c-file', highlights: ['d4'] },
      { board: b7, move: '4. Nxd4', annotation: 'Knight recaptures, dominates center', highlights: ['d4'] },
      { board: b8, move: '4... a6', annotation: 'Najdorf! Prevents Bb5, prepares ...b5', highlights: ['a6'] },
    ],
  };
}

function buildQueensGambit(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'d2','d4');
  const b2 = mv(b1,'d7','d5');
  const b3 = mv(b2,'c2','c4');
  const b4 = mv(b3,'e7','e6');
  const b5 = mv(b4,'b1','c3');
  const b6 = mv(b5,'g8','f6');
  const b7 = mv(b6,'g1','f3');
  const b8 = mv(b7,'f8','e7');
  return {
    name: "Queen's Gambit", eco: 'D06–D69', emoji: '♛',
    tagline: 'The classic d4 opening — positional mastery',
    frames: [
      { board: b0, move: '—',       annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. d4',   annotation: "The Queen's pawn opening", highlights: ['d4'] },
      { board: b2, move: '1... d5', annotation: 'Black matches in the center', highlights: ['d5'] },
      { board: b3, move: '2. c4',   annotation: 'The Gambit! Offering the c-pawn', highlights: ['c4'] },
      { board: b4, move: '2... e6', annotation: 'QGD: Solid, supports d5', highlights: ['e6'] },
      { board: b5, move: '3. Nc3',  annotation: 'Attacking the d5 pawn', highlights: ['c3'] },
      { board: b6, move: '3... Nf6', annotation: 'Developing the kingside knight', highlights: ['f6'] },
      { board: b7, move: '4. Nf3',  annotation: 'Classical development', highlights: ['f3'] },
      { board: b8, move: '4... Be7', annotation: 'Orthodox Defense — solid & precise', highlights: ['e7'] },
    ],
  };
}

function buildRuyLopez(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'e2','e4');
  const b2 = mv(b1,'e7','e5');
  const b3 = mv(b2,'g1','f3');
  const b4 = mv(b3,'b8','c6');
  const b5 = mv(b4,'f1','b5');
  const b6 = mv(b5,'a7','a6');
  const b7 = mv(b6,'b5','a4');
  const b8 = mv(b7,'g8','f6');
  return {
    name: 'Ruy López', eco: 'C60–C99', emoji: '🏰',
    tagline: 'The Spanish Opening — classical chess at its finest',
    frames: [
      { board: b0, move: '—',       annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. e4',   annotation: 'King pawn opening', highlights: ['e4'] },
      { board: b2, move: '1... e5', annotation: 'Black mirrors — Open Game!', highlights: ['e5'] },
      { board: b3, move: '2. Nf3',  annotation: 'Attacking the e5 pawn immediately', highlights: ['f3'] },
      { board: b4, move: '2... Nc6', annotation: 'Defending e5 with the knight', highlights: ['c6'] },
      { board: b5, move: '3. Bb5',  annotation: 'The Spanish Bishop! Indirectly targets e5', highlights: ['b5'] },
      { board: b6, move: '3... a6', annotation: 'Morphy Defense: "Challenge that bishop!"', highlights: ['a6'] },
      { board: b7, move: '4. Ba4',  annotation: 'Bishop retreats, maintains pressure', highlights: ['a4'] },
      { board: b8, move: '4... Nf6', annotation: 'Counter-attacking e4!', highlights: ['f6'] },
    ],
  };
}

function buildScholarsMate(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'e2','e4');
  const b2 = mv(b1,'e7','e5');
  const b3 = mv(b2,'f1','c4');
  const b4 = mv(b3,'b8','c6');
  const b5 = mv(b4,'d1','h5');
  const b6 = mv(b5,'g8','f6');
  const b7 = mv(b6,'h5','f7');
  return {
    name: "Scholar's Mate", eco: 'C20', emoji: '💀',
    tagline: 'The infamous 4-move checkmate — beware!',
    frames: [
      { board: b0, move: '—',           annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. e4',       annotation: 'Setting the trap begins...', highlights: ['e4'] },
      { board: b2, move: '1... e5',     annotation: "Black has no idea what's coming", highlights: ['e5'] },
      { board: b3, move: '2. Bc4',      annotation: 'Bishop eyes f7 — the weakest square!', highlights: ['c4','f7'] },
      { board: b4, move: '2... Nc6',    annotation: 'Developing... but missing the threat', highlights: ['c6'] },
      { board: b5, move: '3. Qh5',      annotation: '⚠️ THREAT: Qxf7# — Do you see it?', highlights: ['h5','f7'] },
      { board: b6, move: '3... Nf6??',  annotation: '💀 Blunder! Forgets about Qxf7', highlights: ['f6'] },
      { board: b7, move: '4. Qxf7#',   annotation: '☠️ CHECKMATE! The king cannot escape', highlights: ['f7','e8'] },
    ],
  };
}

function buildKingsIndian(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'d2','d4');
  const b2 = mv(b1,'g8','f6');
  const b3 = mv(b2,'c2','c4');
  const b4 = mv(b3,'g7','g6');
  const b5 = mv(b4,'b1','c3');
  const b6 = mv(b5,'f8','g7');
  const b7 = mv(b6,'e2','e4');
  // O-O: move king e8->g8, rook h8->f8
  const b8 = { ...b7 };
  b8['g8'] = '♚'; b8['f8'] = '♜';
  delete b8['e8']; delete b8['h8'];
  return {
    name: "King's Indian Defense", eco: 'E60–E99', emoji: '👑',
    tagline: 'Hypermodern: Let White build the center, then destroy it',
    frames: [
      { board: b0, move: '—',        annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. d4',    annotation: 'White plays for center control', highlights: ['d4'] },
      { board: b2, move: '1... Nf6', annotation: 'Black develops — hypermodern approach', highlights: ['f6'] },
      { board: b3, move: '2. c4',    annotation: 'Building a big pawn center', highlights: ['c4'] },
      { board: b4, move: '2... g6',  annotation: 'Fianchetto setup begins!', highlights: ['g6'] },
      { board: b5, move: '3. Nc3',   annotation: 'Reinforcing the center', highlights: ['c3'] },
      { board: b6, move: '3... Bg7', annotation: 'The Indian Bishop — powerful diagonal!', highlights: ['g7'] },
      { board: b7, move: '4. e4',    annotation: 'White completes the massive pawn center', highlights: ['e4'] },
      { board: b8, move: '4... O-O', annotation: 'King safety! Counter-attack coming with ...d6, ...e5', highlights: ['g8'] },
    ],
  };
}

function buildFrench(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'e2','e4');
  const b2 = mv(b1,'e7','e6');
  const b3 = mv(b2,'d2','d4');
  const b4 = mv(b3,'d7','d5');
  const b5 = mv(b4,'b1','c3');
  const b6 = mv(b5,'g8','f6');
  const b7 = mv(b6,'c1','g5');
  const b8 = mv(b7,'f8','e7');
  return {
    name: 'French Defense', eco: 'C00–C19', emoji: '🥐',
    tagline: 'Solid and counter-punching — the French way',
    frames: [
      { board: b0, move: '—',        annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. e4',    annotation: 'Open game — White takes center', highlights: ['e4'] },
      { board: b2, move: '1... e6',  annotation: 'The French! Solid first step', highlights: ['e6'] },
      { board: b3, move: '2. d4',    annotation: 'White builds a strong pawn center', highlights: ['d4'] },
      { board: b4, move: '2... d5',  annotation: 'Black challenges! The French tension', highlights: ['d5'] },
      { board: b5, move: '3. Nc3',   annotation: 'Classical variation — defending e4', highlights: ['c3'] },
      { board: b6, move: '3... Nf6', annotation: 'Attacking the e4 pawn again', highlights: ['f6'] },
      { board: b7, move: '4. Bg5',   annotation: 'Pin! Pressure on the Nf6', highlights: ['g5','f6'] },
      { board: b8, move: '4... Be7', annotation: 'Unpinning — Classical French confirmed', highlights: ['e7'] },
    ],
  };
}

function buildCaro(): Opening {
  const b0 = initBoard();
  const b1 = mv(b0,'e2','e4');
  const b2 = mv(b1,'c7','c6');
  const b3 = mv(b2,'d2','d4');
  const b4 = mv(b3,'d7','d5');
  const b5 = mv(b4,'b1','c3');
  const b6 = mv(b5,'d5','e4');
  const b7 = mv(b6,'c3','e4');
  const b8 = mv(b7,'c8','f5');
  return {
    name: 'Caro-Kann Defense', eco: 'B10–B19', emoji: '🛡️',
    tagline: "Solid as a rock — Karpov's favorite",
    frames: [
      { board: b0, move: '—',          annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. e4',      annotation: 'White opens with the king pawn', highlights: ['e4'] },
      { board: b2, move: '1... c6',    annotation: 'The Caro-Kann! Preparing ...d5 with support', highlights: ['c6'] },
      { board: b3, move: '2. d4',      annotation: 'White stakes out the center', highlights: ['d4'] },
      { board: b4, move: '2... d5',    annotation: 'The thematic challenge — now!', highlights: ['d5'] },
      { board: b5, move: '3. Nc3',     annotation: 'Classical: defending the e4 pawn', highlights: ['c3'] },
      { board: b6, move: '3... dxe4',  annotation: 'Black captures, entering the Classical main line', highlights: ['e4'] },
      { board: b7, move: '4. Nxe4',   annotation: 'Knight recaptures centrally', highlights: ['e4'] },
      { board: b8, move: '4... Bf5',   annotation: 'Classical! Bishop develops outside the pawn chain', highlights: ['f5'] },
    ],
  };
}

function buildEnPassant(): Opening {
  // A fun "explainer" about en passant using a simple scenario
  const b0 = initBoard();
  const b1 = mv(b0,'e2','e4');
  const b2 = mv(b1,'c7','c5');
  const b3 = mv(b2,'e4','e5');
  const b4 = mv(b3,'d7','d5'); // d7->d5, two-square advance beside e5
  // En passant: e5 pawn captures d5 pawn by moving to d6
  const b5 = { ...b4 };
  b5['d6'] = '♙';
  delete b5['e5'];
  delete b5['d5']; // captured pawn removed
  return {
    name: 'En Passant', eco: '—', emoji: '👻',
    tagline: "The ghost capture — the most mysterious rule in chess",
    frames: [
      { board: b0, move: '—',          annotation: 'Starting position', highlights: [] },
      { board: b1, move: '1. e4',      annotation: "White's e-pawn advances two squares", highlights: ['e4'] },
      { board: b2, move: '1... c5',    annotation: 'Black plays the Sicilian', highlights: ['c5'] },
      { board: b3, move: '2. e5',      annotation: 'White pushes forward!', highlights: ['e5'] },
      { board: b4, move: '2... d5',    annotation: '🎯 Black plays d5 — two squares, passing e6!', highlights: ['d5','e5'] },
      { board: b5, move: 'exd6 e.p.', annotation: '👻 EN PASSANT! White captures the d5 pawn diagonally — the pawn vanishes!', highlights: ['d6','d5'] },
    ],
  };
}

// ─── All openings ──────────────────────────────────────────────────────────────

const OPENINGS: Opening[] = [
  buildSicilian(),
  buildQueensGambit(),
  buildRuyLopez(),
  buildScholarsMate(),
  buildKingsIndian(),
  buildFrench(),
  buildCaro(),
  buildEnPassant(),
];

// ─── Chaos scene constants ─────────────────────────────────────────────────────

const CHESS_PIECES = ['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟'];

const BUG_MESSAGES = [
  'A knight is currently debugging the runtime.',
  'The rook has found a critical vulnerability.',
  'Our pawns are writing unit tests.',
  'The bishop blessed the code. It did not help.',
  'Queen to stack overflow... checkmate.',
  'Stockfish eval: ∞ bugs detected.',
  'LLM refused to make a legal move. Again.',
  'Attempting move e4. Error: engine on fire.',
  'Infinite retry loop encountered. Restarting...',
  'isCheckmate hardcoded to false. Investigating.',
  'Knight attempted O(n!) move generation. Fired.',
  'Pawns staging a coup. Estimated fix: 2 sprints.',
];

interface FallingPiece {
  id: number; piece: string; x: number; delay: number; duration: number; size: number;
}

function generatePieces(count: number): FallingPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    piece: CHESS_PIECES[Math.floor(i * 7919 % CHESS_PIECES.length)],
    x: (i * 6271) % 100,
    delay: (i * 1373) % 6,
    duration: 4 + ((i * 997) % 5),
    size: 20 + ((i * 1231) % 32),
  }));
}

const FALLING_PIECES = generatePieces(28);

// ─── Scene list ────────────────────────────────────────────────────────────────

interface Scene { type: 'chaos' | 'opening'; label: string; emoji: string; }

const SCENES: Scene[] = [
  { type: 'chaos', label: 'Technical Difficulties', emoji: '📺' },
  ...OPENINGS.map(o => ({ type: 'opening' as const, label: o.name, emoji: o.emoji })),
];

// ─── Mini board ───────────────────────────────────────────────────────────────

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = [8,7,6,5,4,3,2,1];
const SQ = 28;

function MiniBoard({ board, highlights }: { board: BoardPos; highlights: string[] }) {
  return (
    <div style={{
      display: 'inline-block',
      border: '2px solid rgba(124,58,237,0.5)',
      borderRadius: '4px',
      overflow: 'hidden',
      boxShadow: '0 0 20px rgba(124,58,237,0.2)',
    }}>
      {RANKS.map(rank => (
        <div key={rank} style={{ display: 'flex' }}>
          {FILES.map((file, fi) => {
            const sq = `${file}${rank}`;
            const isLight = (fi + rank) % 2 === 0;
            const isHighlighted = highlights.includes(sq);
            const piece = board[sq];
            return (
              <div
                key={sq}
                style={{
                  width: SQ,
                  height: SQ,
                  background: isHighlighted
                    ? 'rgba(124,58,237,0.75)'
                    : isLight ? '#f0d9b5' : '#b58863',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${Math.round(SQ * 0.72)}px`,
                  lineHeight: 1,
                  userSelect: 'none',
                  transition: 'background 0.25s',
                  color: piece && '♚♛♜♝♞♟'.includes(piece) ? '#1a1a1a' : '#ffffff',
                  textShadow: piece && '♚♛♜♝♞♟'.includes(piece)
                    ? '0 1px 2px rgba(255,255,255,0.4)'
                    : '0 1px 2px rgba(0,0,0,0.6)',
                }}
              >
                {piece}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

export function TechnicalDifficultiesOverlay({ onClose }: { onClose: () => void }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  const scene = SCENES[sceneIndex];
  const opening = scene.type === 'opening' ? OPENINGS[sceneIndex - 1] : null;
  const frame = opening ? opening.frames[frameIndex] : null;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Cycle bug messages in chaos scene
  useEffect(() => {
    if (scene.type !== 'chaos') return;
    const id = setInterval(() => setMsgIndex(i => (i + 1) % BUG_MESSAGES.length), 3200);
    return () => clearInterval(id);
  }, [scene.type]);

  // Auto-advance frames in opening scenes, then rotate to next scene after the last frame
  useEffect(() => {
    if (!opening) return;
    setFrameIndex(0);
    const total = opening.frames.length;
    let current = 0;
    const id = setInterval(() => {
      current += 1;
      if (current >= total) {
        // Finished this opening — move to next scene
        setSceneIndex(i => (i + 1) % SCENES.length);
      } else {
        setFrameIndex(current);
      }
    }, 2200);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex]);

  // Auto-rotate chaos scene after a fixed duration
  useEffect(() => {
    if (scene.type !== 'chaos') return;
    const id = setTimeout(() => {
      setSceneIndex(i => (i + 1) % SCENES.length);
      setFrameIndex(0);
    }, BUG_MESSAGES.length * 3200);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex]);

  const nextScene = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSceneIndex(i => (i + 1) % SCENES.length);
    setFrameIndex(0);
  }, []);

  const goToScene = useCallback((i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSceneIndex(i);
    setFrameIndex(0);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 40%, #0d1a0d 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        cursor: 'pointer',
      }}
    >
      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.13) 2px, rgba(0,0,0,0.13) 4px)',
        pointerEvents: 'none', zIndex: 1,
      }} />

      {/* Falling pieces background */}
      {FALLING_PIECES.map(p => (
        <span key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`,
          top: '-60px',
          fontSize: `${p.size}px`,
          opacity: scene.type === 'chaos' ? 0.13 : 0.04,
          animation: `techDiffFall ${p.duration}s linear ${p.delay}s infinite`,
          userSelect: 'none',
          pointerEvents: 'none',
          zIndex: 0,
          transition: 'opacity 0.5s',
        }}>
          {p.piece}
        </span>
      ))}

      {/* Main card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 2,
          textAlign: 'center',
          padding: '2rem 2.5rem',
          maxWidth: '760px',
          width: '100%',
        }}
      >
        {/* Live badge */}
        <div style={{
          display: 'inline-block',
          background: 'rgba(124,58,237,0.2)', border: '2px solid rgba(124,58,237,0.5)',
          borderRadius: '8px', padding: '0.35rem 1.1rem', marginBottom: '1.75rem',
          fontSize: '0.72rem', letterSpacing: '0.2em', color: '#a78bfa', textTransform: 'uppercase',
        }}>
          ◉ Live Stream
        </div>

        {/* Scene content */}
        <div key={sceneIndex} style={{ animation: 'techDiffFadeIn 0.35s ease' }}>
          {scene.type === 'chaos'
            ? <ChaosScene msgIndex={msgIndex} />
            : opening && frame
              ? <OpeningScene opening={opening} frame={frame} frameIndex={frameIndex} totalFrames={opening.frames.length} />
              : null
          }
        </div>

        {/* Scene switcher bar */}
        <div style={{
          marginTop: '2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
          flexWrap: 'wrap',
        }}>
          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            {SCENES.map((s, i) => (
              <div
                key={i}
                title={s.label}
                onClick={e => goToScene(i, e)}
                style={{
                  width: i === sceneIndex ? 22 : 7,
                  height: 7,
                  borderRadius: '4px',
                  background: i === sceneIndex ? '#7c3aed' : 'rgba(255,255,255,0.18)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>

          <button
            onClick={nextScene}
            style={{
              background: 'rgba(124,58,237,0.25)',
              border: '1px solid rgba(124,58,237,0.5)',
              color: '#c4b5fd',
              padding: '0.4rem 1.1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              transition: 'background 0.2s',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.25)')}
          >
            {SCENES[(sceneIndex + 1) % SCENES.length].emoji} Switch Scene
          </button>
        </div>

        <p style={{ color: '#334155', fontSize: '0.78rem', marginTop: '1.25rem' }}>
          Click outside to dismiss
        </p>
      </div>

      <style>{`
        @keyframes techDiffFall {
          0%   { transform: translateY(-60px); opacity: 0; }
          10%  { opacity: 0.13; }
          90%  { opacity: 0.13; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
        @keyframes techDiffBob {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes techDiffSlide {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes techDiffFadeMsg {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes techDiffFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes techDiffGlow {
          0%, 100% { text-shadow: 0 0 30px rgba(124,58,237,0.7); }
          50%       { text-shadow: 0 0 60px rgba(167,139,250,1); }
        }
      `}</style>
    </div>
  );
}

// ─── Chaos scene ──────────────────────────────────────────────────────────────

function ChaosScene({ msgIndex }: { msgIndex: number }) {
  return (
    <>
      <div style={{
        fontSize: '96px', lineHeight: 1, marginBottom: '1.5rem',
        animation: 'techDiffBob 2s ease-in-out infinite',
        filter: 'drop-shadow(0 0 28px rgba(124,58,237,0.65))',
      }}>♔</div>

      <h1 style={{
        fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, color: '#ffffff',
        letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '0.75rem',
        animation: 'techDiffGlow 3s ease-in-out infinite',
      }}>
        Technical Difficulties
      </h1>

      <p style={{ fontSize: '1.2rem', color: '#94a3b8', marginBottom: '2.25rem', fontWeight: 500 }}>
        We'll be right back after fixing our bugs.
      </p>

      <div style={{
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(124,58,237,0.3)',
        borderRadius: '12px', padding: '1rem 1.5rem', marginBottom: '2.25rem',
        minHeight: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p key={msgIndex} style={{
          color: '#c4b5fd', fontSize: '0.95rem', fontFamily: 'monospace',
          animation: 'techDiffFadeMsg 0.4s ease', margin: 0,
        }}>
          <span style={{ color: '#7c3aed', marginRight: '0.5rem' }}>{'>'}</span>
          {BUG_MESSAGES[msgIndex]}
        </p>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.07)', borderRadius: '999px',
        height: '6px', width: '100%', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #7c3aed, #a78bfa, #7c3aed)',
          backgroundSize: '200% 100%',
          animation: 'techDiffSlide 1.8s linear infinite',
          borderRadius: '999px',
        }} />
      </div>
    </>
  );
}

// ─── Opening scene ────────────────────────────────────────────────────────────

function OpeningScene({ opening, frame, frameIndex, totalFrames }: {
  opening: Opening;
  frame: Frame;
  frameIndex: number;
  totalFrames: number;
}) {
  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '2.25rem' }}>{opening.emoji}</span>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', fontWeight: 900, color: '#ffffff',
            letterSpacing: '-0.02em', margin: 0,
            textShadow: '0 0 30px rgba(124,58,237,0.6)',
          }}>
            {opening.name}
          </h1>
          <span style={{
            fontSize: '0.68rem',
            background: 'rgba(124,58,237,0.25)',
            border: '1px solid rgba(124,58,237,0.4)',
            color: '#a78bfa', padding: '0.2rem 0.55rem', borderRadius: '4px',
            letterSpacing: '0.08em', whiteSpace: 'nowrap',
          }}>
            {opening.eco}
          </span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>{opening.tagline}</p>
      </div>

      {/* Board + annotation */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
        <div>
          <MiniBoard board={frame.board} highlights={frame.highlights} />
          {/* Frame dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
            {Array.from({ length: totalFrames }).map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === frameIndex ? '#7c3aed' : i < frameIndex ? '#5b21b6' : 'rgba(255,255,255,0.12)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        </div>

        {/* Annotation box */}
        <div style={{
          minWidth: '200px', maxWidth: '260px',
          background: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          textAlign: 'left',
          alignSelf: 'flex-start',
        }}>
          <div style={{
            fontSize: '1.6rem', fontFamily: 'monospace', fontWeight: 700,
            color: '#ffffff', marginBottom: '0.75rem',
            textShadow: '0 0 12px rgba(124,58,237,0.5)',
          }}>
            {frame.move}
          </div>
          <p key={frameIndex} style={{
            color: '#c4b5fd', fontSize: '0.88rem', lineHeight: 1.55,
            animation: 'techDiffFadeMsg 0.35s ease', margin: 0,
          }}>
            {frame.annotation}
          </p>
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(124,58,237,0.15)' }}>
            <span style={{ fontSize: '0.72rem', color: '#475569', fontFamily: 'monospace' }}>
              {frameIndex === 0 ? 'start' : `move ${frameIndex}`} / {totalFrames - 1}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        background: 'rgba(255,255,255,0.07)', borderRadius: '999px',
        height: '4px', width: '100%', overflow: 'hidden', marginTop: '1.5rem',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
          borderRadius: '999px',
          width: `${(frameIndex / Math.max(1, totalFrames - 1)) * 100}%`,
          transition: 'width 0.35s ease',
        }} />
      </div>
    </>
  );
}
