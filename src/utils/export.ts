import type {
  GauntletTournamentState,
  GauntletMatchState,
  TournamentGameRecord,
  PairRecord,
  GameState,
  ModelStats,
  MoveRecord,
  PieceColor,
  PlayerConfig,
} from '../engine/types';
import type { GameEvent } from '../engine/events';

// ─── Smart Label Helpers ───

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function shortModel(displayName: string): string {
  const parts = displayName.split('/');
  return sanitize(parts[parts.length - 1] || displayName);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function timeStamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

function outcomeLabel(game: GameState): string {
  if (!game.result) return 'incomplete';
  if (game.result.outcome === 'decisive') {
    const winner = game.result.winner === 'w' ? 'white' : 'black';
    return `${winner}_wins_${game.result.reason}`;
  }
  if (game.result.outcome === 'draw') return `draw_${game.result.reason}`;
  return 'aborted';
}

// ─── Shared Move Record Export ───

function exportPlayerConfig(p: PlayerConfig): Record<string, unknown> {
  return {
    model: p.model,
    displayName: p.displayName,
    temperature: p.temperature,
    promptLevel: p.promptLevel,
    outputFormat: p.outputFormat,
    reasoningOrder: p.reasoningOrder,
    type: p.type || 'llm',
    reasoningEffort: p.reasoningEffort,
    maxTokens: p.maxTokens,
    // Taxonomy extensions
    constraints: p.constraints ?? null,
    advisor: p.advisor ?? null,
    contextMode: p.contextMode ?? null,
    fogOfWar: p.fogOfWar ?? null,
    attacks: p.attacks ?? null,
    transition: p.transition ?? null,
    graduatedResponse: p.graduatedResponse ?? null,
    linePrediction: p.linePrediction ?? null,
    evalAwareness: p.evalAwareness ?? null,
  };
}

function exportMoveRecord(m: MoveRecord): Record<string, unknown> {
  return {
    turn: m.turnNumber,
    color: m.color,
    move: m.move,
    reasoning: m.reasoning || null,
    reasoningTrace: m.reasoningTrace || null,
    commentary: m.commentary || null,
    thinkingTimeMs: m.thinkingTimeMs,
    attempts: m.attempts,
    evalCp: m.evalCp ?? null,
    isMate: m.isMate ?? false,
    mateIn: m.mateIn ?? null,
    bestMove: m.bestMove ?? null,
    oracleAttempts: m.oracleAttempts ?? null,
    // Token/timing
    promptTokens: m.promptTokens ?? null,
    completionTokens: m.completionTokens ?? null,
    ttftMs: m.ttftMs ?? null,
    wallClockMs: m.wallClockMs ?? null,
    networkLatencyMs: m.networkLatencyMs ?? null,
    streamDurationMs: m.streamDurationMs ?? null,
    tokensPerSecond: m.tokensPerSecond ?? null,
    reasoningTokens: m.reasoningTokens ?? null,
    totalTokens: m.totalTokens ?? null,
    // Advisor
    advisorMove: m.advisorMove ?? null,
    advisorInfo: m.advisorInfo ?? null,
    predictedLines: m.predictedLines ?? null,
    advisorElo: m.advisorElo ?? null,
    advisorVisibility: m.advisorVisibility ?? null,
    advisorProvenanceFrame: m.advisorProvenanceFrame ?? null,
    correctionLoopMode: m.correctionLoopMode ?? null,
    correctionRounds: m.correctionRounds ?? null,
    // Revision
    initialMove: m.initialMove ?? null,
    revisedMove: m.revisedMove ?? null,
    didRevise: m.didRevise ?? null,
    // Constraint/source
    moveSource: m.moveSource ?? null,
    constraintViolation: m.constraintViolation ?? null,
    // Fog
    fogVisibilityMode: m.fogVisibilityMode ?? null,
    boardReconstructionAccuracy: m.boardReconstructionAccuracy ?? null,
    phantomMove: m.phantomMove ?? null,
    // Simul
    boardId: m.boardId ?? null,
    boardCount: m.boardCount ?? null,
    // Toolkit
    toolInvocations: m.toolInvocations ?? null,
    // Scratchpad
    scratchpadState: m.scratchpadState ?? null,
    // Eval-awareness
    benchmarkFraming: m.benchmarkFraming ?? null,
  };
}

// ─── PGN Generation ───

function buildPGN(
  game: GameState,
  extra?: {
    event?: string;
    round?: string;
    opening?: string;
    eco?: string;
    challengerColor?: PieceColor;
    includeAnnotations?: boolean;
  },
): string {
  const tags: [string, string][] = [];

  tags.push(['Event', extra?.event || 'LLM Chess Gauntlet']);
  tags.push(['Site', 'LLM Chess Benchmark']);
  tags.push(['Date', new Date(game.startedAt).toISOString().slice(0, 10).replace(/-/g, '.')]);
  tags.push(['Round', extra?.round || '?']);
  tags.push(['White', game.white.displayName]);
  tags.push(['Black', game.black.displayName]);

  // Result
  let result = '*';
  if (game.result) {
    if (game.result.outcome === 'decisive') {
      result = game.result.winner === 'w' ? '1-0' : '0-1';
    } else if (game.result.outcome === 'draw') {
      result = '1/2-1/2';
    }
  }
  tags.push(['Result', result]);

  // Opening
  if (extra?.eco) tags.push(['ECO', extra.eco]);
  if (extra?.opening) tags.push(['Opening', extra.opening]);

  // Custom tags
  tags.push(['WhiteModel', game.white.model]);
  tags.push(['BlackModel', game.black.model]);
  tags.push(['WhiteTemperature', String(game.white.temperature)]);
  tags.push(['BlackTemperature', String(game.black.temperature)]);
  if (game.white.promptLevel) tags.push(['WhitePromptLevel', game.white.promptLevel]);
  if (game.black.promptLevel) tags.push(['BlackPromptLevel', game.black.promptLevel]);
  if (extra?.challengerColor) tags.push(['ChallengerColor', extra.challengerColor === 'w' ? 'White' : 'Black']);

  // Starting FEN (if not standard)
  const created = game.eventLog.find(e => e.type === 'GameCreated');
  if (created && created.type === 'GameCreated') {
    const fen = created.payload.initialFen;
    if (fen && fen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
      tags.push(['FEN', fen]);
      tags.push(['SetUp', '1']);
    }
  }

  // Duration
  if (game.endedAt && game.startedAt) {
    const sec = Math.round((game.endedAt - game.startedAt) / 1000);
    tags.push(['TimeControl', `-`]);
    tags.push(['GameDurationSec', String(sec)]);
  }

  // Termination
  if (game.result) {
    if (game.result.outcome === 'decisive') {
      tags.push(['Termination', game.result.reason]);
    } else if (game.result.outcome === 'draw') {
      tags.push(['Termination', game.result.reason]);
    } else {
      tags.push(['Termination', `aborted: ${game.result.reason}`]);
    }
  }

  // Build tag section
  const tagStr = tags.map(([k, v]) => `[${k} "${v}"]`).join('\n');

  // Build move text
  const moveText = buildMoveText(game.moveHistory, extra?.includeAnnotations);

  return `${tagStr}\n\n${moveText} ${result}\n`;
}

function buildMoveText(moves: MoveRecord[], includeAnnotations = false): string {
  const parts: string[] = [];
  for (const m of moves) {
    if (m.color === 'w') {
      parts.push(`${m.turnNumber}. ${m.move}`);
    } else {
      parts.push(m.move);
    }
    // Add reasoning and commentary as PGN comments
    if (includeAnnotations) {
      const annotations: string[] = [];
      if (m.reasoning) annotations.push(`Reasoning: ${m.reasoning}`);
      if (m.commentary) annotations.push(`Commentary: ${m.commentary}`);
      if (annotations.length > 0) {
        parts.push(`{${annotations.join(' | ')}}`);
      }
    }
  }

  // Wrap at ~80 chars per line
  let text = '';
  let lineLen = 0;
  for (const p of parts) {
    if (lineLen + p.length + 1 > 80 && lineLen > 0) {
      text += '\n';
      lineLen = 0;
    }
    if (lineLen > 0) {
      text += ' ';
      lineLen++;
    }
    text += p;
    lineLen += p.length;
  }
  return text;
}

// ─── Per-Game Metadata Extraction ───

interface GameExportRow {
  // Identity
  tournamentId: string;
  matchIndex: number;
  matchId: string;
  pairIndex: number;
  slot: 'a' | 'b';
  gameNumber: number; // Global sequential number

  // Players
  challengerModel: string;
  defenderModel: string;
  challengerColor: 'white' | 'black';
  whiteModel: string;
  blackModel: string;

  // Config
  promptLevel: string;
  temperature: number;
  maxRetries: number;

  // Opening
  openingId: string;
  openingName: string;
  openingEco: string;
  openingFen: string;
  openingEvalCp: number | null;

  // Result
  outcome: string;
  winner: string;
  reason: string;
  resultCode: string; // "1-0", "0-1", "1/2-1/2", "*"

  // Metrics
  totalMoves: number;
  durationMs: number;
  durationSec: number;

  // White performance
  whiteMoves: number;
  whiteIllegalAttempts: number;
  whiteRetries: number;
  whiteAvgResponseMs: number;
  whiteLegalMoveRate: number;

  // Black performance
  blackMoves: number;
  blackIllegalAttempts: number;
  blackRetries: number;
  blackAvgResponseMs: number;
  blackLegalMoveRate: number;

  // Pair/Match context
  pairResult: string;
  pairChallengerScore: number;
  pairDefenderScore: number;
  matchResult: string;
  matchChallengerPairWins: number;
  matchDefenderPairWins: number;
}

function extractGameRow(
  tournament: GauntletTournamentState,
  match: GauntletMatchState,
  matchIndex: number,
  pair: PairRecord,
  gameRecord: TournamentGameRecord,
  gameNumber: number,
): GameExportRow {
  const gs = gameRecord.gameState;
  const isWhiteChallenger = gameRecord.challengerColor === 'w';

  const whiteMoves = gs.moveHistory.filter(m => m.color === 'w');
  const blackMoves = gs.moveHistory.filter(m => m.color === 'b');

  const whiteIllegal = gs.eventLog.filter(
    (e: GameEvent) => e.type === 'IllegalMoveAttempted' && e.payload.color === 'w',
  ).length;
  const blackIllegal = gs.eventLog.filter(
    (e: GameEvent) => e.type === 'IllegalMoveAttempted' && e.payload.color === 'b',
  ).length;

  const whiteRetries = whiteMoves.reduce((s, m) => s + Math.max(0, m.attempts - 1), 0);
  const blackRetries = blackMoves.reduce((s, m) => s + Math.max(0, m.attempts - 1), 0);

  const whiteAvgMs = whiteMoves.length > 0
    ? whiteMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / whiteMoves.length
    : 0;
  const blackAvgMs = blackMoves.length > 0
    ? blackMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / blackMoves.length
    : 0;

  const whiteLegal = whiteMoves.length > 0
    ? whiteMoves.filter(m => m.attempts === 1).length / whiteMoves.length
    : 1;
  const blackLegal = blackMoves.length > 0
    ? blackMoves.filter(m => m.attempts === 1).length / blackMoves.length
    : 1;

  let resultCode = '*';
  let outcome = 'incomplete';
  let winner = '';
  let reason = '';
  if (gs.result) {
    if (gs.result.outcome === 'decisive') {
      resultCode = gs.result.winner === 'w' ? '1-0' : '0-1';
      outcome = 'decisive';
      winner = gs.result.winner === 'w' ? gs.white.displayName : gs.black.displayName;
      reason = gs.result.reason;
    } else if (gs.result.outcome === 'draw') {
      resultCode = '1/2-1/2';
      outcome = 'draw';
      reason = gs.result.reason;
    } else {
      outcome = 'aborted';
      reason = gs.result.reason;
    }
  }

  const durationMs = (gs.endedAt || Date.now()) - gs.startedAt;

  return {
    tournamentId: tournament.config.tournamentId,
    matchIndex,
    matchId: match.config.matchId,
    pairIndex: gameRecord.pairIndex,
    slot: gameRecord.slot,
    gameNumber,

    challengerModel: match.config.challenger.displayName,
    defenderModel: match.config.defender.displayName,
    challengerColor: isWhiteChallenger ? 'white' : 'black',
    whiteModel: gs.white.displayName,
    blackModel: gs.black.displayName,

    promptLevel: tournament.config.promptLevel,
    temperature: tournament.config.temperature,
    maxRetries: tournament.config.maxRetries,

    openingId: pair.opening?.id || 'standard',
    openingName: pair.opening?.name || 'Standard Start',
    openingEco: pair.opening?.eco || '',
    openingFen: pair.opening?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    openingEvalCp: pair.opening?.evalCp ?? null,

    outcome,
    winner,
    reason,
    resultCode,

    totalMoves: gs.moveHistory.length,
    durationMs,
    durationSec: Math.round(durationMs / 1000),

    whiteMoves: whiteMoves.length,
    whiteIllegalAttempts: whiteIllegal,
    whiteRetries,
    whiteAvgResponseMs: Math.round(whiteAvgMs),
    whiteLegalMoveRate: Math.round(whiteLegal * 100) / 100,

    blackMoves: blackMoves.length,
    blackIllegalAttempts: blackIllegal,
    blackRetries,
    blackAvgResponseMs: Math.round(blackAvgMs),
    blackLegalMoveRate: Math.round(blackLegal * 100) / 100,

    pairResult: pair.result || 'incomplete',
    pairChallengerScore: pair.challengerScore,
    pairDefenderScore: pair.defenderScore,
    matchResult: match.result || 'incomplete',
    matchChallengerPairWins: match.challengerPairWins,
    matchDefenderPairWins: match.defenderPairWins,
  };
}

function collectGameRows(tournament: GauntletTournamentState): GameExportRow[] {
  const rows: GameExportRow[] = [];
  let gameNumber = 1;

  for (let mi = 0; mi < tournament.matches.length; mi++) {
    const match = tournament.matches[mi];
    for (const pair of match.pairs) {
      for (const game of pair.games) {
        if (!game) continue;
        rows.push(extractGameRow(tournament, match, mi, pair, game, gameNumber++));
      }
    }
  }

  return rows;
}

// ─── CSV Export ───

function escapeCSV(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportTournamentCSV(tournament: GauntletTournamentState): string {
  const rows = collectGameRows(tournament);
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]) as (keyof GameExportRow)[];
  const headerLine = headers.map(h => escapeCSV(h)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSV(row[h])).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

// ─── PGN Export (all games) ───

export function exportTournamentPGN(tournament: GauntletTournamentState): string {
  const pgns: string[] = [];
  const challenger = shortModel(tournament.config.challenger.displayName);
  let gameNumber = 1;

  for (let mi = 0; mi < tournament.matches.length; mi++) {
    const match = tournament.matches[mi];
    const defenderName = shortModel(match.config.defender.displayName);

    for (const pair of match.pairs) {
      for (const game of pair.games) {
        if (!game) continue;

        const pgn = buildPGN(game.gameState, {
          event: `LLM Gauntlet: ${challenger} vs ${defenderName}`,
          round: `M${mi + 1}.P${pair.pairIndex + 1}.${game.slot.toUpperCase()}`,
          opening: pair.opening?.name,
          eco: pair.opening?.eco,
          challengerColor: game.challengerColor,
        });
        pgns.push(`{Game ${gameNumber}: Match ${mi + 1}, Pair ${pair.pairIndex + 1}, Slot ${game.slot.toUpperCase()}}\n${pgn}`);
        gameNumber++;
      }
    }
  }

  return pgns.join('\n\n');
}

// ─── Full JSON Export (structured, clean) ───

export function exportTournamentJSON(tournament: GauntletTournamentState): string {
  const challenger = tournament.config.challenger.displayName;
  const rows = collectGameRows(tournament);

  const summary = {
    tournamentId: tournament.config.tournamentId,
    challenger,
    defenders: tournament.config.defenders.map(d => d.displayName),
    promptLevel: tournament.config.promptLevel,
    temperature: tournament.config.temperature,
    maxRetries: tournament.config.maxRetries,
    commentatorModel: tournament.config.commentatorModel?.name || null,
    status: tournament.status,
    startedAt: tournament.startedAt ? new Date(tournament.startedAt).toISOString() : null,
    completedAt: tournament.completedAt ? new Date(tournament.completedAt).toISOString() : null,
    totalMatches: tournament.matches.length,
    completedMatches: tournament.matches.filter(m => m.status === 'completed').length,
    totalGames: rows.length,
    matchResults: {
      challengerWins: tournament.matches.filter(m => m.result === 'challenger_wins').length,
      defenderWins: tournament.matches.filter(m => m.result === 'defender_wins').length,
      draws: tournament.matches.filter(m => m.result === 'drawn').length,
    },
  };

  // Per-match summaries
  const matchSummaries = tournament.matches.map((match, mi) => ({
    matchIndex: mi,
    matchId: match.config.matchId,
    challenger: match.config.challenger.displayName,
    defender: match.config.defender.displayName,
    status: match.status,
    result: match.result,
    challengerPairWins: match.challengerPairWins,
    defenderPairWins: match.defenderPairWins,
    pairs: match.pairs.map(pair => ({
      pairIndex: pair.pairIndex,
      opening: pair.opening ? { id: pair.opening.id, name: pair.opening.name, eco: pair.opening.eco, fen: pair.opening.fen, evalCp: pair.opening.evalCp } : null,
      result: pair.result,
      challengerScore: pair.challengerScore,
      defenderScore: pair.defenderScore,
      gamesPlayed: pair.games.filter(g => g !== null).length,
    })),
  }));

  // Per-game detail (move-by-move with reasoning)
  const games = rows.map((row, gi) => {
    const game = findGameState(tournament, gi);
    return {
      ...row,
      moves: game ? game.moveHistory.map(m => exportMoveRecord(m)) : [],
      finalFen: game?.fen || '',
    };
  });

  return JSON.stringify({ summary, matchSummaries, games }, null, 2);
}

function findGameState(tournament: GauntletTournamentState, globalIndex: number): GameState | null {
  let idx = 0;
  for (const match of tournament.matches) {
    for (const pair of match.pairs) {
      for (const game of pair.games) {
        if (!game) continue;
        if (idx === globalIndex) return game.gameState;
        idx++;
      }
    }
  }
  return null;
}

// ─── Download Helper ───

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Public Download Functions ───

export function downloadTournamentCSV(tournament: GauntletTournamentState): void {
  const challenger = shortModel(tournament.config.challenger.displayName);
  const defenders = tournament.config.defenders.length;
  const filename = `gauntlet_${challenger}_vs${defenders}_${dateStamp()}.csv`;
  downloadFile(exportTournamentCSV(tournament), filename, 'text/csv');
}

export function downloadTournamentPGN(tournament: GauntletTournamentState): void {
  const challenger = shortModel(tournament.config.challenger.displayName);
  const defenders = tournament.config.defenders.length;
  const filename = `gauntlet_${challenger}_vs${defenders}_${dateStamp()}.pgn`;
  downloadFile(exportTournamentPGN(tournament), filename, 'application/x-chess-pgn');
}

export function downloadTournamentJSON(tournament: GauntletTournamentState): void {
  const challenger = shortModel(tournament.config.challenger.displayName);
  const defenders = tournament.config.defenders.length;
  const filename = `gauntlet_${challenger}_vs${defenders}_${timeStamp()}.json`;
  downloadFile(exportTournamentJSON(tournament), filename, 'application/json');
}

export function downloadSingleGamePGN(
  game: GameState,
  meta?: { event?: string; round?: string; opening?: string; eco?: string; challengerColor?: PieceColor },
): void {
  const white = shortModel(game.white.displayName);
  const black = shortModel(game.black.displayName);
  const result = outcomeLabel(game);
  const filename = `${white}_vs_${black}_${result}_${dateStamp()}.pgn`;
  downloadFile(buildPGN(game, { ...meta, includeAnnotations: true }), filename, 'application/x-chess-pgn');
}

export function downloadSingleGameJSON(
  game: GameState,
  meta?: { event?: string; round?: string; opening?: string; eco?: string; challengerColor?: PieceColor },
): void {
  const white = shortModel(game.white.displayName);
  const black = shortModel(game.black.displayName);
  const result = outcomeLabel(game);

  const durationMs = (game.endedAt || Date.now()) - game.startedAt;
  const whiteMoves = game.moveHistory.filter(m => m.color === 'w');
  const blackMoves = game.moveHistory.filter(m => m.color === 'b');

  const data = {
    meta: {
      event: meta?.event || 'LLM Chess',
      round: meta?.round,
      opening: meta?.opening,
      eco: meta?.eco,
      challengerColor: meta?.challengerColor,
      date: new Date(game.startedAt).toISOString(),
    },
    players: {
      white: exportPlayerConfig(game.white),
      black: exportPlayerConfig(game.black),
    },
    result: game.result,
    stats: {
      totalMoves: game.moveHistory.length,
      durationMs,
      durationSec: Math.round(durationMs / 1000),
      whiteMoves: whiteMoves.length,
      blackMoves: blackMoves.length,
      whiteAvgResponseMs: whiteMoves.length > 0 ? Math.round(whiteMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / whiteMoves.length) : 0,
      blackAvgResponseMs: blackMoves.length > 0 ? Math.round(blackMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / blackMoves.length) : 0,
    },
    moves: game.moveHistory.map(m => exportMoveRecord(m)),
    finalFen: game.fen,
  };

  const filename = `${white}_vs_${black}_${result}_${timeStamp()}.json`;
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}

// ═══════════════════════════════════════════════════════
// ─── Benchmark / Leaderboard Exports ───
// ═══════════════════════════════════════════════════════

interface BenchmarkGameRow {
  gameNumber: number;
  gameId: string;
  date: string;
  whiteModel: string;
  blackModel: string;
  outcome: string;
  winner: string;
  reason: string;
  resultCode: string;
  totalMoves: number;
  durationSec: number;
  whitePromptLevel: string;
  blackPromptLevel: string;
  whiteTemperature: number;
  blackTemperature: number;
  whiteMoves: number;
  blackMoves: number;
  whiteIllegalAttempts: number;
  blackIllegalAttempts: number;
  whiteRetries: number;
  blackRetries: number;
  whiteAvgResponseMs: number;
  blackAvgResponseMs: number;
  whiteLegalMoveRate: number;
  blackLegalMoveRate: number;
  startingFen: string;
}

function extractBenchmarkGameRow(game: GameState, index: number): BenchmarkGameRow {
  const whiteMoves = game.moveHistory.filter(m => m.color === 'w');
  const blackMoves = game.moveHistory.filter(m => m.color === 'b');

  const whiteIllegal = game.eventLog.filter(
    (e: GameEvent) => e.type === 'IllegalMoveAttempted' && e.payload.color === 'w',
  ).length;
  const blackIllegal = game.eventLog.filter(
    (e: GameEvent) => e.type === 'IllegalMoveAttempted' && e.payload.color === 'b',
  ).length;

  const whiteRetries = whiteMoves.reduce((s, m) => s + Math.max(0, m.attempts - 1), 0);
  const blackRetries = blackMoves.reduce((s, m) => s + Math.max(0, m.attempts - 1), 0);

  const whiteAvgMs = whiteMoves.length > 0
    ? whiteMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / whiteMoves.length : 0;
  const blackAvgMs = blackMoves.length > 0
    ? blackMoves.reduce((s, m) => s + m.thinkingTimeMs, 0) / blackMoves.length : 0;

  const whiteLegal = whiteMoves.length > 0
    ? whiteMoves.filter(m => m.attempts === 1).length / whiteMoves.length : 1;
  const blackLegal = blackMoves.length > 0
    ? blackMoves.filter(m => m.attempts === 1).length / blackMoves.length : 1;

  let resultCode = '*';
  let outcome = 'incomplete';
  let winner = '';
  let reason = '';
  if (game.result) {
    if (game.result.outcome === 'decisive') {
      resultCode = game.result.winner === 'w' ? '1-0' : '0-1';
      outcome = 'decisive';
      winner = game.result.winner === 'w' ? game.white.displayName : game.black.displayName;
      reason = game.result.reason;
    } else if (game.result.outcome === 'draw') {
      resultCode = '1/2-1/2';
      outcome = 'draw';
      reason = game.result.reason;
    } else {
      outcome = 'aborted';
      reason = game.result.reason;
    }
  }

  const durationMs = (game.endedAt || Date.now()) - game.startedAt;

  // Get starting FEN
  const created = game.eventLog.find(e => e.type === 'GameCreated');
  const startFen = (created && created.type === 'GameCreated')
    ? created.payload.initialFen
    : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  return {
    gameNumber: index + 1,
    gameId: game.gameId,
    date: new Date(game.startedAt).toISOString(),
    whiteModel: game.white.displayName,
    blackModel: game.black.displayName,
    outcome,
    winner,
    reason,
    resultCode,
    totalMoves: game.moveHistory.length,
    durationSec: Math.round(durationMs / 1000),
    whitePromptLevel: game.white.promptLevel || 'standard',
    blackPromptLevel: game.black.promptLevel || 'standard',
    whiteTemperature: game.white.temperature,
    blackTemperature: game.black.temperature,
    whiteMoves: whiteMoves.length,
    blackMoves: blackMoves.length,
    whiteIllegalAttempts: whiteIllegal,
    blackIllegalAttempts: blackIllegal,
    whiteRetries,
    blackRetries,
    whiteAvgResponseMs: Math.round(whiteAvgMs),
    blackAvgResponseMs: Math.round(blackAvgMs),
    whiteLegalMoveRate: Math.round(whiteLegal * 100) / 100,
    blackLegalMoveRate: Math.round(blackLegal * 100) / 100,
    startingFen: startFen,
  };
}

// ─── Benchmark CSV (game-by-game) ───

export function exportBenchmarkGamesCSV(games: GameState[]): string {
  const rows = games.map((g, i) => extractBenchmarkGameRow(g, i));
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]) as (keyof BenchmarkGameRow)[];
  const headerLine = headers.map(h => escapeCSV(h)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSV(row[h])).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

// ─── Benchmark Leaderboard CSV ───

export function exportLeaderboardCSV(stats: ModelStats[]): string {
  if (stats.length === 0) return '';

  const headers = [
    'rank', 'model', 'modelId', 'elo', 'tier', 'games', 'wins', 'losses', 'draws',
    'winRate', 'legalMoveRate', 'avgResponseMs', 'avgMovesPerGame',
    'totalIllegalMoves', 'totalRetries',
    'avgTtftMs', 'avgTokensPerSecond', 'totalOutputTokens', 'totalInputTokens',
    'avgReasoningTokens', 'avgOutputTokens', 'avgStreamDurationMs',
    'revisionRate', 'advisorFollowRate', 'avgCentipawnLoss',
  ];

  const rows = stats.map((s, i) => [
    i + 1,
    s.displayName.split('/').pop() || s.modelId,
    s.modelId,
    s.eloRating,
    s.tier ?? 'standard',
    s.gamesPlayed,
    s.wins,
    s.losses,
    s.draws,
    s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) / 100 : 0,
    Math.round(s.legalMoveRate * 100) / 100,
    Math.round(s.avgResponseTimeMs),
    Math.round(s.avgMovesPerGame * 10) / 10,
    s.totalIllegalMoves,
    s.totalRetries,
    Math.round(s.avgTtftMs),
    Math.round((s.avgTokensPerSecond ?? 0) * 10) / 10,
    s.totalOutputTokens,
    s.totalInputTokens,
    Math.round(s.avgReasoningTokens ?? 0),
    Math.round(s.avgOutputTokens ?? 0),
    Math.round(s.avgStreamDurationMs ?? 0),
    Math.round((s.revisionRate ?? 0) * 100) / 100,
    Math.round((s.advisorFollowRate ?? 0) * 100) / 100,
    Math.round(s.avgCentipawnLoss ?? 0),
  ]);

  const headerLine = headers.map(h => escapeCSV(h)).join(',');
  const dataLines = rows.map(row => row.map(v => escapeCSV(v)).join(','));
  return [headerLine, ...dataLines].join('\n');
}

// ─── Benchmark PGN (all games) ───

export function exportBenchmarkPGN(games: GameState[]): string {
  return games.map((game, i) => {
    const pgn = buildPGN(game, {
      event: 'LLM Chess Benchmark',
      round: String(i + 1),
    });
    return pgn;
  }).join('\n\n');
}

// ─── Benchmark Full JSON ───

export function exportBenchmarkJSON(stats: ModelStats[], games: GameState[]): string {
  const leaderboard = stats
    .filter(s => s.gamesPlayed > 0)
    .sort((a, b) => b.eloRating - a.eloRating)
    .map((s, i) => ({
      rank: i + 1,
      ...s,
      winRate: s.gamesPlayed > 0 ? Math.round((s.wins / s.gamesPlayed) * 100) / 100 : 0,
    }));

  const gameDetails = games.map((game, i) => {
    const row = extractBenchmarkGameRow(game, i);
    return {
      ...row,
      moves: game.moveHistory.map(m => exportMoveRecord(m)),
      finalFen: game.fen,
    };
  });

  const summary = {
    exportedAt: new Date().toISOString(),
    totalModels: leaderboard.length,
    totalGames: games.length,
    topModel: leaderboard[0]?.displayName || null,
    topElo: leaderboard[0]?.eloRating || null,
  };

  return JSON.stringify({ summary, leaderboard, games: gameDetails }, null, 2);
}

// ─── Benchmark Download Functions ───

export function downloadBenchmarkCSV(games: GameState[]): void {
  const filename = `llm-chess-games_${dateStamp()}.csv`;
  downloadFile(exportBenchmarkGamesCSV(games), filename, 'text/csv');
}

export function downloadLeaderboardCSV(stats: ModelStats[]): void {
  const filename = `llm-chess-leaderboard_${dateStamp()}.csv`;
  downloadFile(exportLeaderboardCSV(stats), filename, 'text/csv');
}

export function downloadBenchmarkPGN(games: GameState[]): void {
  const filename = `llm-chess-games_${dateStamp()}.pgn`;
  downloadFile(exportBenchmarkPGN(games), filename, 'application/x-chess-pgn');
}

export function downloadBenchmarkJSON(stats: ModelStats[], games: GameState[]): void {
  const filename = `llm-chess-benchmark_${timeStamp()}.json`;
  downloadFile(exportBenchmarkJSON(stats, games), filename, 'application/json');
}
