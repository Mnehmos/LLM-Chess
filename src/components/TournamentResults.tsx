import { useTournamentStore } from '../store/tournamentStore';
import { useState, useRef, useEffect } from 'react';
import type { GauntletMatchState, MatchResult } from '../engine/types';
import {
  downloadTournamentJSON,
  downloadTournamentCSV,
  downloadTournamentPGN,
} from '../utils/export';

export function TournamentResults() {
  const tournament = useTournamentStore(s => s.tournament);
  const clearTournament = useTournamentStore(s => s.clearTournament);
  const [showExport, setShowExport] = useState(false);
  const [renderTimestamp] = useState(() => Date.now());
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExport]);

  if (!tournament) return null;

  const challengerName = tournament.config.challenger.displayName.split('/').pop() || 'Challenger';

  const wins = tournament.matches.filter(m => m.result === 'challenger_wins').length;
  const losses = tournament.matches.filter(m => m.result === 'defender_wins').length;
  const draws = tournament.matches.filter(m => m.result === 'drawn').length;
  const incomplete = tournament.matches.filter(m => m.result === null).length;

  const totalGames = tournament.matches.reduce((sum, m) =>
    sum + m.pairs.reduce((ps, p) =>
      ps + (p.games[0] ? 1 : 0) + (p.games[1] ? 1 : 0), 0), 0);

  const durationMs = (tournament.completedAt || renderTimestamp) - (tournament.startedAt || renderTimestamp);
  const durationMin = Math.round(durationMs / 60000);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="bg-surface-1 rounded-lg p-6 text-center">
        <h2 className="text-xl font-bold text-text-primary mb-2">
          Gauntlet {tournament.status === 'completed' ? 'Complete' : 'Aborted'}
        </h2>
        <p className="text-3xl font-bold text-text-primary mb-1">
          {challengerName}
        </p>
        <div className="flex justify-center gap-6 text-lg mt-4">
          <div>
            <span className="text-success font-bold">{wins}</span>
            <span className="text-text-muted ml-1">W</span>
          </div>
          <div>
            <span className="text-error font-bold">{losses}</span>
            <span className="text-text-muted ml-1">L</span>
          </div>
          <div>
            <span className="text-text-secondary font-bold">{draws}</span>
            <span className="text-text-muted ml-1">D</span>
          </div>
          {incomplete > 0 && (
            <div>
              <span className="text-warning font-bold">{incomplete}</span>
              <span className="text-text-muted ml-1">Incomplete</span>
            </div>
          )}
        </div>
        <p className="text-sm text-text-muted mt-3">
          {totalGames} games played in {durationMin} minutes
        </p>
      </div>

      {/* Match breakdown */}
      <div className="bg-surface-1 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-text-secondary mb-3">Match Results</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-left border-b border-surface-2">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Opponent</th>
                <th className="py-2 pr-4">Result</th>
                <th className="py-2 pr-4">Pairs</th>
                <th className="py-2 pr-4">P1</th>
                <th className="py-2 pr-4">P2</th>
                <th className="py-2">P3</th>
              </tr>
            </thead>
            <tbody>
              {tournament.matches.map((match, i) => (
                <MatchRow
                  key={match.config.matchId}
                  match={match}
                  index={i}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Opening performance */}
      <OpeningPerformance matches={tournament.matches} />

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExport(!showExport)}
            className="px-6 py-2 bg-surface-2 text-text-primary rounded text-sm font-medium hover:bg-surface-3"
          >
            Export
          </button>
          {showExport && (
            <div className="absolute left-0 bottom-full mb-1 bg-surface-2 border border-surface-3 rounded shadow-lg z-20 min-w-[200px]">
              <button
                onClick={() => { downloadTournamentJSON(tournament); setShowExport(false); }}
                className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Full JSON (games + metadata)
              </button>
              <button
                onClick={() => { downloadTournamentCSV(tournament); setShowExport(false); }}
                className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Games CSV (spreadsheet)
              </button>
              <button
                onClick={() => { downloadTournamentPGN(tournament); setShowExport(false); }}
                className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface-3 transition-colors"
              >
                PGN (chess notation)
              </button>
            </div>
          )}
        </div>
        <button
          onClick={clearTournament}
          className="px-6 py-2 bg-error/20 text-error rounded text-sm font-medium hover:bg-error/30"
        >
          Clear Tournament
        </button>
      </div>
    </div>
  );
}

function MatchRow({ match, index }: {
  match: GauntletMatchState;
  index: number;
}) {
  const defenderName = match.config.defender.displayName.split('/').pop() || 'Defender';

  const resultLabel = (r: MatchResult | null) => {
    if (!r) return <span className="text-text-muted">--</span>;
    if (r === 'challenger_wins') return <span className="text-success font-medium">Win</span>;
    if (r === 'defender_wins') return <span className="text-error font-medium">Loss</span>;
    return <span className="text-text-muted">Draw</span>;
  };

  const pairLabel = (pair: typeof match.pairs[0]) => {
    if (pair.result === null && pair.games[0] === null && pair.games[1] === null) {
      return <span className="text-text-muted">--</span>;
    }
    if (pair.result === null) return <span className="text-purple-light">...</span>;
    const label = `${pair.challengerScore}-${pair.defenderScore}`;
    if (pair.result === 'challenger') return <span className="text-success">{label}</span>;
    if (pair.result === 'defender') return <span className="text-error">{label}</span>;
    return <span className="text-text-muted">{label}</span>;
  };

  return (
    <tr className="border-b border-surface-2/50">
      <td className="py-2 pr-4 text-text-muted">{index + 1}</td>
      <td className="py-2 pr-4 text-text-primary">{defenderName}</td>
      <td className="py-2 pr-4">{resultLabel(match.result)}</td>
      <td className="py-2 pr-4 text-text-secondary">
        {match.challengerPairWins}-{match.defenderPairWins}
      </td>
      <td className="py-2 pr-4">{pairLabel(match.pairs[0])}</td>
      <td className="py-2 pr-4">{pairLabel(match.pairs[1])}</td>
      <td className="py-2">{pairLabel(match.pairs[2])}</td>
    </tr>
  );
}

function OpeningPerformance({ matches }: { matches: GauntletMatchState[] }) {
  const openingMap = new Map<string, {
    name: string;
    gamesPlayed: number;
    challengerWins: number;
    defenderWins: number;
    draws: number;
  }>();

  for (const match of matches) {
    for (const pair of match.pairs) {
      if (!pair.opening) continue;
      const key = pair.opening.id;
      if (!openingMap.has(key)) {
        openingMap.set(key, {
          name: pair.opening.name || pair.opening.eco || key,
          gamesPlayed: 0,
          challengerWins: 0,
          defenderWins: 0,
          draws: 0,
        });
      }
      const stats = openingMap.get(key)!;
      for (const game of pair.games) {
        if (!game?.gameState.result) continue;
        stats.gamesPlayed++;
        const r = game.gameState.result;
        if (r.outcome === 'decisive') {
          if (r.winner === game.challengerColor) stats.challengerWins++;
          else stats.defenderWins++;
        } else if (r.outcome === 'draw') {
          stats.draws++;
        }
      }
    }
  }

  if (openingMap.size === 0) return null;

  const entries = [...openingMap.values()].sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  return (
    <div className="bg-surface-1 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text-secondary mb-3">Opening Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-left border-b border-surface-2">
              <th className="py-2 pr-4">Opening</th>
              <th className="py-2 pr-4">Games</th>
              <th className="py-2 pr-4">C Wins</th>
              <th className="py-2 pr-4">D Wins</th>
              <th className="py-2">Draws</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-b border-surface-2/50">
                <td className="py-2 pr-4 text-text-primary">{e.name}</td>
                <td className="py-2 pr-4 text-text-secondary">{e.gamesPlayed}</td>
                <td className="py-2 pr-4 text-success">{e.challengerWins}</td>
                <td className="py-2 pr-4 text-error">{e.defenderWins}</td>
                <td className="py-2 text-text-muted">{e.draws}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
