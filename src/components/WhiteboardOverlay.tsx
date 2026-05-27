/**
 * WhiteboardOverlay — full-frame educational slate that replaces the
 * board view during whiteboard scenes.
 *
 * Rendering is dispatch-by-kind on the WhiteboardScene discriminator:
 *   - 'bullets':         heading + bullet list
 *   - 'pawn_structure':  8x8 grid with only pawns
 *   - 'move_tree':       branching SAN tree with labels
 *   - 'arrow_diagram':   sparse pieces + annotated arrows
 *
 * Visual: dark Oracle Trust Calibration aesthetic. Big text, generous
 * spacing, designed for video readability under YouTube re-encode.
 *
 * Gated upstream by:
 *   - URL `?whiteboard=1` (BroadcastConfig.whiteboard)
 *   - The current narration ply matching scene.ply
 */

import type {
  WhiteboardScene,
  WhiteboardBulletsScene,
  WhiteboardPawnStructureScene,
  WhiteboardMoveTreeScene,
  WhiteboardArrowDiagramScene,
} from '../episodes/types';

interface WhiteboardOverlayProps {
  scene: WhiteboardScene;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

export function WhiteboardOverlay({ scene }: WhiteboardOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-0/95 backdrop-blur-md p-12 animate-[fadeIn_300ms_ease-in]">
      <header className="w-full max-w-5xl mb-8">
        <div className="text-text-muted text-sm uppercase tracking-widest mb-2">
          Whiteboard
        </div>
        <h2 className="text-4xl font-bold text-text-primary">{scene.heading}</h2>
      </header>
      <div className="flex-1 w-full max-w-5xl overflow-hidden flex items-start justify-center">
        {renderSceneContent(scene)}
      </div>
    </div>
  );
}

function renderSceneContent(scene: WhiteboardScene): JSX.Element {
  switch (scene.kind) {
    case 'bullets':
      return <BulletsContent scene={scene} />;
    case 'pawn_structure':
      return <PawnStructureContent scene={scene} />;
    case 'move_tree':
      return <MoveTreeContent scene={scene} />;
    case 'arrow_diagram':
      return <ArrowDiagramContent scene={scene} />;
  }
}

function BulletsContent({ scene }: { scene: WhiteboardBulletsScene }) {
  return (
    <ul className="space-y-6 text-2xl text-text-primary leading-relaxed list-none">
      {scene.bullets.map((bullet, i) => (
        <li key={i} className="flex gap-4">
          <span className="text-purple-accent font-bold shrink-0">{i + 1}.</span>
          <span>{bullet}</span>
        </li>
      ))}
    </ul>
  );
}

function PawnStructureContent({ scene }: { scene: WhiteboardPawnStructureScene }) {
  const whiteSet = new Set(scene.whitePawns.map((s) => s.toLowerCase()));
  const blackSet = new Set(scene.blackPawns.map((s) => s.toLowerCase()));
  return (
    <div className="flex flex-col items-center">
      <div className="grid grid-cols-[auto_repeat(8,4rem)]">
        <div />
        {FILES.map((f) => (
          <div key={f} className="h-6 text-text-muted text-sm flex items-end justify-center">
            {f}
          </div>
        ))}
        {RANKS.map((rank, ri) => (
          <>
            <div key={`r${rank}`} className="w-6 flex items-center justify-end pr-2 text-text-muted text-sm">
              {rank}
            </div>
            {FILES.map((file, fi) => {
              const sq = `${file}${rank}`;
              const isLight = (ri + fi) % 2 === 0;
              const wp = whiteSet.has(sq);
              const bp = blackSet.has(sq);
              return (
                <div
                  key={sq}
                  className={`w-16 h-16 flex items-center justify-center text-4xl select-none ${
                    isLight ? 'bg-board-light' : 'bg-board-dark'
                  }`}
                >
                  {wp ? PIECE_UNICODE.wP : bp ? PIECE_UNICODE.bP : ''}
                </div>
              );
            })}
          </>
        ))}
      </div>
      {scene.caption && (
        <div className="mt-6 text-xl text-text-secondary text-center max-w-2xl">
          {scene.caption}
        </div>
      )}
    </div>
  );
}

function MoveTreeContent({ scene }: { scene: WhiteboardMoveTreeScene }) {
  return (
    <div className="flex flex-col items-start gap-6 w-full">
      <div className="text-xl text-text-muted">{scene.root}</div>
      <div className="grid grid-cols-1 gap-4 w-full">
        {scene.branches.map((branch, i) => (
          <div
            key={i}
            className="flex items-start gap-6 p-5 rounded-lg bg-surface-1/60 ring-1 ring-surface-2"
          >
            <div className="text-3xl font-bold text-purple-accent w-12 shrink-0">
              {String.fromCharCode(65 + i)}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <div className="text-xl text-text-primary font-semibold">
                {branch.label}
              </div>
              <div className="text-lg text-text-secondary font-mono">
                {branch.moves.join(' ')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrowDiagramContent({ scene }: { scene: WhiteboardArrowDiagramScene }) {
  const pieceMap = new Map<string, string>();
  for (const p of scene.pieces ?? []) {
    pieceMap.set(p.square.toLowerCase(), p.piece);
  }
  const cellSize = 64;
  const boardPx = cellSize * 8;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: boardPx, height: boardPx }}>
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
          {RANKS.flatMap((rank, ri) =>
            FILES.map((file, fi) => {
              const sq = `${file}${rank}`;
              const isLight = (ri + fi) % 2 === 0;
              const piece = pieceMap.get(sq);
              return (
                <div
                  key={sq}
                  className={`flex items-center justify-center text-4xl ${
                    isLight ? 'bg-board-light' : 'bg-board-dark'
                  }`}
                >
                  {piece ? PIECE_UNICODE[piece] : ''}
                </div>
              );
            }),
          )}
        </div>
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox={`0 0 ${boardPx} ${boardPx}`}
        >
          <defs>
            {scene.arrows.map((a, i) => (
              <marker
                key={i}
                id={`wb-arrow-${i}`}
                markerWidth="4"
                markerHeight="4"
                refX="2.5"
                refY="2"
                orient="auto"
              >
                <path d="M0,0 L4,2 L0,4 Z" fill={a.color ?? 'rgba(0,200,83,0.85)'} />
              </marker>
            ))}
          </defs>
          {scene.arrows.map((a, i) => {
            const from = squareToPixel(a.from, cellSize);
            const to = squareToPixel(a.to, cellSize);
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={a.color ?? 'rgba(0,200,83,0.85)'}
                  strokeWidth={5}
                  strokeLinecap="round"
                  markerEnd={`url(#wb-arrow-${i})`}
                />
                {a.label && (
                  <text
                    x={mx}
                    y={my - 8}
                    fill="#ffffff"
                    fontSize="14"
                    fontWeight="bold"
                    textAnchor="middle"
                    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
                  >
                    {a.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {scene.caption && (
        <div className="mt-6 text-xl text-text-secondary text-center max-w-2xl">
          {scene.caption}
        </div>
      )}
    </div>
  );
}

function squareToPixel(square: string, cellSize: number): { x: number; y: number } {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1], 10);
  return {
    x: file * cellSize + cellSize / 2,
    y: (8 - rank) * cellSize + cellSize / 2,
  };
}
