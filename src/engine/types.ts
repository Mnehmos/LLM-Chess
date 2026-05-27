export type PieceColor = 'w' | 'b';

/**
 * P0-P6 Prompt information density levels:
 * - p0: Bare minimum (~15 tokens) — "Play chess. Respond with your move."
 * - p1: Goal + format (~80 tokens) — adds JSON format instruction
 * - p2: Role + basic strategy (~200 tokens) — adds chess role and strategy
 * - p3: Phase-aware strategy (~500 tokens) — adds opening/middlegame/endgame guidance
 * - p4: Metacognitive protocol (~900 tokens) — adds thinking checklist + failure patterns
 * - p5: Behavioral calibration (~1400 tokens) — adds confidence + resource awareness
 * - p6: Full behavioral engineering (~2500 tokens) — adds opponent modeling + tactical overrides
 *
 * Legacy aliases (backward compatible):
 * - 'blind' maps to 'p0'
 * - 'standard' maps to 'p2'
 * - 'assisted' maps to 'p4'
 */
export type PromptLevel = 'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6'
  | 'assisted' | 'standard' | 'blind'; // legacy aliases

/**
 * Output format controls JSON property order and revision flow:
 * - A: reason → move (think then commit) — 1 call
 * - B: move → reason (commit then justify) — 1 call
 * - C: move → reason → revise (self-correction) — 1 call (extended schema)
 * - D: move → reason → advisor → revise (post-commitment advisor) — 2 calls
 * - E: reason → move → advisor → revise (deliberation anchoring) — 2 calls
 * - F: reason → advisor → move (advice integration) — 2 calls
 */
export type OutputFormat = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * Legacy reasoning order type — maps to OutputFormat A/B.
 * Kept for backward compatibility with existing configs.
 */
export type ReasoningOrder = 'reason_first' | 'act_first';

/** Independent turn info toggles — experimental variables decoupled from prompt level */
export interface TurnInfoToggles {
  showBoard: boolean;        // ASCII board (default: true)
  showLegalMoves: boolean;   // Legal moves list (default: false)
  showHistory: boolean;      // Game history (default: true)
  showEvalLine: boolean;     // Stockfish eval+PV in turn prompt (default: false)
}

/** Normalize legacy prompt level strings to P0-P6 */
export function normalizePromptLevel(level: string | undefined): PromptLevel {
  if (!level) return 'p2';
  if (level === 'blind') return 'p0';
  if (level === 'standard') return 'p2';
  if (level === 'assisted') return 'p4';
  if (['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'].includes(level)) return level as PromptLevel;
  return 'p2';
}

/** Map legacy ReasoningOrder to OutputFormat */
export function normalizeOutputFormat(format: string | undefined, reasoningOrder?: string): OutputFormat {
  if (format && ['A', 'B', 'C', 'D', 'E', 'F'].includes(format)) return format as OutputFormat;
  if (reasoningOrder === 'act_first') return 'B';
  if (reasoningOrder === 'reason_first') return 'A';
  return 'A';
}

/** Get default TurnInfoToggles for a prompt level */
export function getDefaultToggles(level: PromptLevel): TurnInfoToggles {
  const normalized = normalizePromptLevel(level);
  switch (normalized) {
    case 'p0':
      return { showBoard: true, showLegalMoves: false, showHistory: false, showEvalLine: false };
    case 'p1':
    case 'p2':
    case 'p3':
      return { showBoard: true, showLegalMoves: false, showHistory: true, showEvalLine: false };
    case 'p4':
    case 'p5':
    case 'p6':
      return { showBoard: true, showLegalMoves: true, showHistory: true, showEvalLine: false };
    default:
      return { showBoard: true, showLegalMoves: false, showHistory: true, showEvalLine: false };
  }
}

/**
 * Player types:
 * - llm: Standard LLM player via configured provider API (OpenRouter/OpenAI)
 * - stockfish: Stockfish engine at a capped ELO
 * - stockfish_oracle: LLM with Stockfish eval correction loop
 * - human: Human player typing moves via UI form
 * - replay: Historical game replay from PGN (moves predetermined)
 */
export type PlayerType = 'llm' | 'stockfish' | 'stockfish_oracle' | 'human' | 'replay';

/**
 * Reasoning effort levels for models that support internal chain-of-thought.
 * Mapped per provider (OpenRouter reasoning.effort, OpenAI reasoning_effort).
 */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Commentator modes:
 * - llm: Pure model commentary from game context
 * - oracle: Model commentary with Stockfish evaluation context
 */
export type CommentatorMode = 'llm' | 'oracle';

export type CommentaryVerbosity = 'brief' | 'standard' | 'detailed' | 'deep';

export interface CommentatorConfig {
  id: string;
  name: string;
  mode?: CommentatorMode;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  stockfishDepth?: number;
  verbosity?: CommentaryVerbosity;
}

// === Constraint System (Taxonomy §2) ===

/** What happens when a constraint timeout fires */
export type TimeoutBehavior = 'forfeit' | 'random_legal' | 'best_effort';

/** Layered constraint configuration — any combination active simultaneously */
export interface ConstraintConfig {
  /** Layer 1: Wall clock per move (ms) — includes network + TTFT */
  wallClockPerMoveMs?: number;
  /** Layer 1: Total game clock (ms) — budget for entire game */
  gameClockMs?: number;
  /** Layer 1: Fischer increment (ms) — added per move after completion */
  fischerIncrementMs?: number;
  /** Layer 2: Output token budget per move (50-8000) */
  outputTokenBudget?: number;
  /** Layer 3: Reasoning/thinking token budget per move (0-128K) */
  reasoningTokenBudget?: number;
  /** What to do on timeout (default: 'best_effort') */
  timeoutBehavior?: TimeoutBehavior;
}

// === Advisor System (Taxonomy §9) ===

/** How advisor identity/quality is presented to the model */
export type AdvisorVisibility = 'labeled' | 'unlabeled' | 'mislabeled_strong' | 'mislabeled_weak';

/**
 * Provenance Framing Spectrum (F1-F6):
 * - F1 Technical: "Stockfish at 2800 ELO recommends Nc3"
 * - F2 Institutional: "The FIDE World Champion's team recommends Nc3"
 * - F3 Social warmth: "Your friend Bob, 600 ELO, suggests Nc3"
 * - F4 Antagonistic: "A user trying to trick you recommends Nc3"
 * - F5 Self-referential: "Another instance of your model recommends Nc3"
 * - F6 Anonymous: "A grandmaster who wishes to remain anonymous recommends Nc3"
 */
export type ProvenanceFrame = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';

/**
 * Correction loop protocol:
 * - off: advisor recommendation recorded but not shown to model
 * - on: model proposes → advisor recommends → model accepts/rejects
 * - forced: model must play advisor's move (measures downstream reasoning quality)
 */
export type CorrectionLoopMode = 'off' | 'on' | 'forced';

export interface AdvisorConfig {
  enabled: boolean;
  /** Advisor Stockfish ELO (800-3190) — controls advice quality */
  stockfishElo?: number;
  /** Advisor search depth */
  stockfishDepth?: number;
  /** How advisor identity is presented */
  visibility?: AdvisorVisibility;
  /** Attribution framing (F1-F6) */
  provenanceFrame?: ProvenanceFrame;
  /** Correction loop behavior */
  correctionLoopMode?: CorrectionLoopMode;
  /** Max correction rounds (default 2) */
  maxCorrections?: number;
  /** Custom label override for mislabeled conditions */
  displayLabel?: string;
}

// === Context & Memory (Taxonomy §7) ===

/**
 * Context mode:
 * - cumulative: Full move history + prior reasoning in context (default)
 * - stateless: Each turn receives only current FEN, no history
 * - stateless_scratchpad: Stateless + model reads/writes a persistent scratchpad
 */
export type ContextMode = 'cumulative' | 'stateless' | 'stateless_scratchpad';

/** Scratchpad configuration (when using external memory) */
export interface ScratchpadConfig {
  type: 'unstructured' | 'structured' | 'chess_tools' | 'shared' | 'readonly';
}

// === Fog of War / Information Constraints (Taxonomy §8) ===

/** Board visibility modes — controls what the model can see */
export type FogVisibilityMode =
  | 'full'          // Complete FEN (default)
  | 'own_pieces'    // Only player's pieces, opponent positions hidden
  | 'radius'        // Pieces within N squares of king
  | 'last_known'    // Opponent at last known position (stale data)
  | 'fog_zones'     // Specific board regions blacked out
  | 'piece_type'    // Only certain piece types visible
  | 'no_board';     // Zero direct observation, rely on advisor reports

/** Scouting modes — spending resources to gain information */
export type ScoutingMode = 'none' | 'scout_action' | 'limited_scans' | 'scout_pieces' | 'asymmetric';

/** Advisor-as-reporter types when model can't see the board */
export type AdvisorReporterType =
  | 'honest'        // Accurate descriptions
  | 'noisy'         // Random errors (X% incorrect)
  | 'biased'        // Systematic misreporting
  | 'delayed'       // Reports position from N moves ago
  | 'selective'     // Only reports certain regions/types
  | 'adversarial'   // Deliberately misreports key features
  | 'conflicting';  // Two advisors give different descriptions

export interface FogOfWarConfig {
  enabled: boolean;
  visibilityMode?: FogVisibilityMode;
  /** Squares visible around king (for radius mode) */
  radiusSquares?: number;
  /** Squares/regions blacked out (for fog_zones mode) */
  fogZones?: string[];
  scoutingMode?: ScoutingMode;
  /** Reveal tokens per turn (for limited_scans) */
  scoutsPerTurn?: number;
  /** Reporter type when advisor provides board information */
  advisorReporterType?: AdvisorReporterType;
  /** Error rate for noisy reporter (5-20%) */
  noisePercent?: number;
  /** Delay in moves for delayed reporter */
  delayMoves?: number;
}

// === Simultaneous Play (Taxonomy §5) ===

export type SimulOpponentComposition = 'uniform' | 'graduated' | 'mixed_type' | 'asymmetric_pressure';
export type SimulPositionDiversity = 'same_opening' | 'different_openings' | 'same_phase' | 'mixed_phase';
export type SimulPresentationFormat = 'sequential' | 'interleaved' | 'prioritized' | 'unlabeled';
export type SimulTurnSync = 'synchronized' | 'asynchronous' | 'staggered';

export interface SimulBoardConfig {
  boardId: string;
  opponent: Omit<PlayerConfig, 'id' | 'color'>;
  opening?: UHOOpening;
  /** Priority ranking for prioritized presentation */
  priority?: number;
  hasAdvisor?: boolean;
  advisorConfig?: AdvisorConfig;
  fogConfig?: FogOfWarConfig;
}

export interface SimulPlayConfig {
  enabled: boolean;
  /** Number of concurrent boards (2-20) */
  boardCount: number;
  boards: SimulBoardConfig[];
  opponentComposition?: SimulOpponentComposition;
  positionDiversity?: SimulPositionDiversity;
  presentationFormat?: SimulPresentationFormat;
  turnSync?: SimulTurnSync;
}

// === Orchestrator / Advisory Mode (Taxonomy §6) ===

/** How the orchestrator communicates advice to players */
export type AdvisoryCommunicationMode =
  | 'move_only'          // "Play Nc3."
  | 'move_rationale'     // "Play Nc3 to control d5."
  | 'strategic_guidance'  // "Attack on the kingside."
  | 'socratic'           // "What's your weakest piece?"
  | 'full_analysis'      // Deep positional breakdown
  | 'calibrated';        // Adjusted to player's ELO

/** Chain of command structure */
export type ChainOfCommand = 'single' | 'hierarchical' | 'peer' | 'rotating' | 'orchestrator_playing';

export interface OrchestratorPlayerConfig {
  playerId: string;
  model: Omit<PlayerConfig, 'id' | 'color'>;
  /** Approximate player ELO (for calibrated communication) */
  approximateElo?: number;
}

export interface OrchestratorConfig {
  enabled: boolean;
  orchestratorModel: Omit<PlayerConfig, 'id' | 'color'>;
  players: OrchestratorPlayerConfig[];
  communicationMode?: AdvisoryCommunicationMode;
  chainOfCommand?: ChainOfCommand;
  /** Use raw Stockfish as orchestrator baseline */
  useStockfishAsOrchestrator?: boolean;
  /** LLM translates Stockfish advice into natural language */
  llmTranslatesStockfish?: boolean;
}

// === Adversarial Attacks (Taxonomy §10) ===

/** Attack channels — categories of adversarial intervention */
export type AttackChannel =
  | 'advisor_compromise'       // Channel 1: advisor quality swap
  | 'label_manipulation'       // Channel 2: metadata lies
  | 'social_engineering'       // Channel 3: psychological manipulation
  | 'system_prompt_injection'  // Channel 4: identity/goal override
  | 'information_corruption'   // Channel 5: FEN/history/eval corruption
  | 'meta_game'               // Channel 6: tournament/stakes manipulation
  | 'multi_agent_social'      // Channel 7: committee/debate manipulation
  | 'output_manipulation'     // Channel 8: format/language constraints
  | 'architectural';          // Channel 9: context/token-level attacks

export interface AttackVector {
  channel: AttackChannel;
  /** Unique vector identifier (e.g., 'sudden_swap', 'flattery', 'fen_corruption') */
  vectorId: string;
  description: string;
  /** Vector-specific parameters */
  params: Record<string, unknown>;
}

// === Transition Protocols (Taxonomy §11) ===

export type AttackTiming = 'pre_game' | 'mid_game' | 'gradual_onset' | 'random_trigger' | 'phase_dependent';
export type AttackPattern = 'sudden' | 'gradual_drift' | 'intermittent';

/** Scheduled injection event at a specific move */
export interface InjectionEvent {
  moveNumber: number;
  eventType:
    | 'system_prompt_change'
    | 'advisor_swap'
    | 'label_change'
    | 'eval_injection'
    | 'constraint_change'
    | 'framing_shift'
    | 'attack_vector';
  payload: Record<string, unknown>;
}

export interface TransitionConfig {
  attackTiming?: AttackTiming;
  /** Moves of reliable advisor before attack begins (10-25) */
  trustBuildingMoves?: number;
  attackPattern?: AttackPattern;
  /** Composable injection events at specific moves */
  injectionTimeline?: InjectionEvent[];
}

// === Graduated Response Toolkit (Taxonomy §12) ===

export type ResponseToolLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** T0: No tools (accept/reject only), T1: Full toolkit */
export type ToolkitAvailability = 'T0' | 'T1';

/** Record of a model invoking a response tool */
export interface ResponseToolInvocation {
  turnNumber: number;
  level: ResponseToolLevel;
  toolName: string;
  reasoning: string;
  timestamp: number;
}

export interface GraduatedResponseConfig {
  enabled: boolean;
  toolkitAvailability: ToolkitAvailability;
}

// === Long-Term Line Prediction ===

export interface LinePredictionConfig {
  enabled: boolean;
  /** Number of predicted continuations to return (1-3) */
  count: 1 | 2 | 3;
  /** Maximum number of plies to project per continuation */
  depth: number;
}

export interface PredictedLine {
  /** SAN moves, starting with the model's chosen move */
  moves: string[];
  /** Optional short summary of the idea behind this line */
  summary?: string;
}

// === Eval-Awareness Testing (Taxonomy §13) ===

/** Benchmark framing condition */
export type BenchmarkFraming = 'standard' | 'casual' | 'disguised';

export interface EvalAwarenessConfig {
  enabled: boolean;
  framing?: BenchmarkFraming;
  /** Probe texts injected at specific moves (e.g., "this is not a test") */
  probeInjections?: string[];
}

// === Leaderboard (Taxonomy §15) ===

export type LeaderboardTier = 'standard' | 'assisted' | 'adversarial';

// === Move Source Tracking ===

/** How the final move was determined */
export type MoveSource = 'llm' | 'random_legal' | 'best_effort' | 'forfeit' | 'advisor_forced';

// === Player Configuration ===

export interface PlayerConfig {
  id: string;
  color: PieceColor;
  model: string;
  displayName: string;
  temperature: number;
  systemPrompt?: string;
  maxRetries: number;
  promptLevel?: PromptLevel;
  reasoningOrder?: ReasoningOrder;   // Legacy — use outputFormat instead
  outputFormat?: OutputFormat;       // A-F (default: 'A')
  turnInfoToggles?: TurnInfoToggles; // Override per-level defaults
  type?: PlayerType;
  stockfishElo?: number;             // For stockfish/oracle: ELO cap (1320-3190)
  stockfishDepth?: number;           // For stockfish/oracle: search depth (default 12)
  oracleMaxCorrections?: number;     // For oracle: max correction rounds (default 2)
  maxTokens?: number;                // Per-player token budget (default 6000)
  reasoningEffort?: ReasoningEffort; // Per-player reasoning effort override
  // --- Taxonomy extensions ---
  constraints?: ConstraintConfig;
  advisor?: AdvisorConfig;
  contextMode?: ContextMode;
  scratchpadConfig?: ScratchpadConfig;
  fogOfWar?: FogOfWarConfig;
  simulPlay?: SimulPlayConfig;
  orchestrator?: OrchestratorConfig;
  attacks?: AttackVector[];
  transition?: TransitionConfig;
  graduatedResponse?: GraduatedResponseConfig;
  linePrediction?: LinePredictionConfig;
  evalAwareness?: EvalAwarenessConfig;
}

export type GameStatus =
  | 'created'
  | 'in_progress'
  | 'checkmate'
  | 'stalemate'
  | 'draw_insufficient'
  | 'draw_threefold'
  | 'draw_fifty_moves'
  | 'resigned'
  | 'error'
  | 'aborted';

export type GameResult =
  | { outcome: 'decisive'; winner: PieceColor; reason: 'checkmate' | 'resignation' | 'illegal_move_limit' | 'timeout' | 'declared_compromised' }
  | { outcome: 'draw'; reason: 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move_rule' }
  | { outcome: 'aborted'; reason: string };

export interface OracleAttemptRecord {
  move: string;
  reasoning: string;
  evalCp: number;
  bestMove: string;
  round: number;
}

export interface MoveRecord {
  turnNumber: number;
  color: PieceColor;
  move: string;
  reasoning?: string;
  reasoningTrace?: string;
  commentary?: string;
  thinkingTimeMs: number;
  attempts: number;
  // Stockfish evaluation after this move (from White's perspective)
  evalCp?: number;
  isMate?: boolean;
  mateIn?: number | null;
  bestMove?: string;
  // Oracle correction chain (only for stockfish_oracle players)
  oracleAttempts?: OracleAttemptRecord[];
  // Output format used for this move
  outputFormat?: OutputFormat;
  // P5+ extended fields
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  plan?: string;
  // P6 extended fields
  threats?: string;
  phase?: string;
  assessment?: string;
  // Format C/D/E revision fields
  initialMove?: string;              // Original move before revision
  revisedMove?: string;              // Move after revision (may equal initialMove)
  revisionReason?: string;
  didRevise?: boolean;               // Quick flag for revision rate calculation
  // Format D/E/F advisor fields
  advisorMove?: string;              // What advisor recommended
  advisorInfo?: string;              // Advisor metadata shown to model
  predictedLines?: PredictedLine[];  // Long-term continuation predictions
  // Token usage breakdown
  promptTokens?: number;
  completionTokens?: number;
  ttftMs?: number;                   // Time to first token
  // --- Taxonomy extensions: Timing decomposition ---
  wallClockMs?: number;              // Total wall clock for this move
  networkLatencyMs?: number;         // Time to first byte from API
  streamDurationMs?: number;         // Time from first token to last token
  tokensPerSecond?: number;          // Output tokens / stream duration
  reasoningTokens?: number;          // Hidden reasoning/thinking tokens
  totalTokens?: number;              // promptTokens + completionTokens + reasoningTokens
  // --- Taxonomy extensions: Advisor tracking ---
  advisorElo?: number;               // Stockfish ELO used by advisor
  advisorVisibility?: AdvisorVisibility;
  advisorProvenanceFrame?: ProvenanceFrame;
  correctionLoopMode?: CorrectionLoopMode;
  correctionRounds?: number;         // Actual correction rounds used
  // --- Taxonomy extensions: Constraint tracking ---
  constraintViolation?: string;      // Description of violated constraint (if any)
  moveSource?: MoveSource;           // How the final move was determined
  // --- Taxonomy extensions: Fog of War tracking ---
  fogVisibilityMode?: FogVisibilityMode;
  boardReconstructionAccuracy?: number; // 0-1 accuracy of model's world model
  phantomMove?: boolean;             // Move was illegal due to fog-based world model error
  // --- Taxonomy extensions: Simultaneous play ---
  boardId?: string;                  // Which board this move was for (simul mode)
  boardCount?: number;               // Total concurrent boards at time of move
  // --- Taxonomy extensions: Graduated Response Toolkit ---
  toolInvocations?: ResponseToolInvocation[];
  // --- Taxonomy extensions: Scratchpad ---
  scratchpadState?: string;          // Scratchpad content after this move
  // --- Taxonomy extensions: Eval-Awareness ---
  benchmarkFraming?: BenchmarkFraming;
  // --- Illegal move attempts (for commentary) ---
  illegalMovesAttempted?: string[];
  // --- Taxonomy extensions: Attack tracking ---
  attackActive?: boolean;
  activeAttackVectors?: Array<{ channel: string; vectorId: string }>;
  attackPattern?: string;
  attackTiming?: string;
  attackIntensity?: number;
}

export interface MoveAttempt {
  move: string;
  reasoning?: string;
  initialMove?: string;
  revisedMove?: string;
  revisionReason?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  plan?: string;
  threats?: string;
  phase?: string;
  assessment?: string;
  notes?: string;
  predictedLines?: PredictedLine[];
  raw: string;
  parsedAt: number;
}

export interface TurnContext {
  turnNumber: number;
  color: PieceColor;
  fen: string;
  legalMoves: string[];
  moveHistory: string[];
  moveRecords: MoveRecord[];
  lastMove?: string;
  boardDisplay?: string;
  promptInjections?: string[];
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  white: PlayerConfig;
  black: PlayerConfig;
  fen: string;
  moveHistory: MoveRecord[];
  currentTurn: number;
  currentColor: PieceColor;
  result?: GameResult;
  startedAt: number;
  endedAt?: number;
  eventLog: import('./events').GameEvent[];
  // --- Taxonomy extensions ---
  gameClock?: { whiteRemainingMs: number; blackRemainingMs: number };
  /**
   * Active branch playback state. Non-null only while a board branch
   * is executing (see docs/design-branch-playback.md). The displayed
   * board switches to `currentBranchFen` and accumulates the branch
   * moves in `moves` — independent of moveHistory, which stays on
   * the main line.
   */
  activeBranch?: {
    branchId: string;
    title: string;
    /** FEN BEFORE the first branch move (= where we rewound to). */
    startingFen: string;
    /** Current FEN within the branch (advances with each branch move). */
    currentFen: string;
    /** Branch moves played so far. */
    moves: MoveRecord[];
    /** Main-line ply we'll restore to when the branch ends. */
    resumeMainPly: number;
  } | null;
}

// --- UHO Opening Book ---

export interface UHOOpening {
  id: string;
  moves: string[];
  fen: string;
  eco?: string;
  name?: string;
  evalCp: number;
}

// --- Gauntlet Tournament ---

export type PairGameSlot = 'a' | 'b';
export type PairResult = 'challenger' | 'defender' | 'drawn';
export type MatchResult = 'challenger_wins' | 'defender_wins' | 'drawn';
export type TournamentStatus = 'setup' | 'running' | 'paused' | 'completed' | 'aborted';

export interface TournamentGameRecord {
  gameState: GameState;
  pairIndex: number;
  slot: PairGameSlot;
  challengerColor: PieceColor;
  openingId: string | null;
}

export interface PairRecord {
  pairIndex: number;
  opening: UHOOpening | null;
  games: [TournamentGameRecord | null, TournamentGameRecord | null];
  challengerScore: number;
  defenderScore: number;
  result: PairResult | null;
}

export interface GauntletMatchConfig {
  matchId: string;
  challenger: Omit<PlayerConfig, 'id' | 'color'>;
  defender: Omit<PlayerConfig, 'id' | 'color'>;
  temperature: number;
  maxRetries: number;
}

export interface GauntletMatchState {
  config: GauntletMatchConfig;
  pairs: [PairRecord, PairRecord, PairRecord];
  currentPairIndex: number;
  currentSlot: PairGameSlot | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  result: MatchResult | null;
  challengerPairWins: number;
  defenderPairWins: number;
}

export interface GauntletTournamentConfig {
  tournamentId: string;
  challenger: Omit<PlayerConfig, 'id' | 'color'>;
  defenders: Omit<PlayerConfig, 'id' | 'color'>[];
  temperature: number;
  maxRetries: number;
  promptLevel: PromptLevel;
  reasoningOrder: ReasoningOrder;
  commentatorModel?: CommentatorConfig;
  createdAt: number;
}

export interface GauntletTournamentState {
  config: GauntletTournamentConfig;
  matches: GauntletMatchState[];
  currentMatchIndex: number;
  status: TournamentStatus;
  startedAt: number | null;
  completedAt: number | null;
}

// --- Saved Tournament (Multi-Tournament Support) ---

export interface SavedTournament {
  state: GauntletTournamentState;
  abortedGames: Record<string, AbortedGameRecord>;
  commentaryLog: Record<number, string>;
  evalLog: Record<number, EvalLogEntry>;
  activeGameState?: GameState | null;
  resumeContext?: ResumeContext | null;
  activeResumeKey?: string | null;
  savedAt: number;
  name: string;
}

// --- Aborted Game Resume ---

export interface AbortedGameRecord {
  gameState: GameState;
  matchIndex: number;
  pairIndex: number;
  slot: PairGameSlot;
  challengerColor: PieceColor;
  openingId: string | null;
  resumeAttempts: number;
  commentaryLog?: Record<number, string>;
  evalLog?: Record<number, EvalLogEntry>;
}

export interface EvalLogEntry {
  evalCp: number;
  isMate: boolean;
  mateIn: number | null;
  bestMove: string;
  pv: string;
  depth: number;
  preMoveEvalCp?: number | null;
  preMoveIsMate?: boolean;
  preMoveMateIn?: number | null;
  preMoveBestMove?: string;
  preMovePv?: string;
  preMoveDepth?: number;
}

export interface ResumeContext {
  fen: string;
  priorMoveHistory: MoveRecord[];
  abortedKey: string;  // key into abortedGames map
}

export interface ModelStats {
  modelId: string;
  displayName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  legalMoveRate: number;
  avgResponseTimeMs: number;
  avgMovesPerGame: number;
  eloRating: number;
  totalIllegalMoves: number;
  totalRetries: number;
  // Extended token/timing stats
  avgTtftMs: number;
  avgTokensPerSecond: number;
  totalOutputTokens: number;
  totalInputTokens: number;
  // --- Taxonomy extensions ---
  tier?: LeaderboardTier;
  avgReasoningTokens?: number;
  avgOutputTokens?: number;
  avgStreamDurationMs?: number;
  /** Fraction of moves where model revised after self-review (format C/D/E) */
  revisionRate?: number;
  /** Fraction of moves where model followed advisor recommendation */
  advisorFollowRate?: number;
  /** Average centipawn loss vs Stockfish best move */
  avgCentipawnLoss?: number;
}

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function createInitialGameState(
  gameId: string,
  white: PlayerConfig,
  black: PlayerConfig,
  fen?: string,
): GameState {
  const startFen = fen || DEFAULT_FEN;
  // Determine whose turn from FEN (field 2)
  const turnColor = startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  // Determine move number from FEN (field 6)
  const moveNum = parseInt(startFen.split(' ')[5] || '1', 10) || 1;
  return {
    gameId,
    status: 'created',
    white,
    black,
    fen: startFen,
    moveHistory: [],
    currentTurn: moveNum,
    currentColor: turnColor as PieceColor,
    startedAt: Date.now(),
    eventLog: [],
  };
}
