import { useGameStore } from '../store/gameStore';
import type { Match } from '../types';

function MatchCard({ match, playerTeamId }: { match: Match; playerTeamId: string | null }) {
  const { getTeamById } = useGameStore();
  const homeTeam = getTeamById(match.homeTeamId);
  const awayTeam = getTeamById(match.awayTeamId);

  if (!homeTeam || !awayTeam) return null;

  const isPlayerMatch = match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${isPlayerMatch ? 'bg-yellow-900/20 border border-yellow-500/30' : 'bg-gray-800'}`}>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <span className={`text-sm ${match.homeTeamId === playerTeamId ? 'text-yellow-400 font-bold' : 'text-white'}`}>
          {homeTeam.shortName}
        </span>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: homeTeam.colors.primary }} />
      </div>

      <div className="px-4 text-center min-w-[60px]">
        <span className="text-white font-bold text-lg">
          {match.homeGoals} - {match.awayGoals}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: awayTeam.colors.primary }} />
        <span className={`text-sm ${match.awayTeamId === playerTeamId ? 'text-yellow-400 font-bold' : 'text-white'}`}>
          {awayTeam.shortName}
        </span>
      </div>
    </div>
  );
}

export function MatchResults() {
  const { lastRoundResults, playerTeamId, divisions } = useGameStore();

  if (lastRoundResults.length === 0) return null;

  // Group results by division
  const resultsByDivision: Record<number, Match[]> = { 1: [], 2: [], 3: [] };
  for (const match of lastRoundResults) {
    for (const div of divisions) {
      if (div.teams.some(t => t.id === match.homeTeamId)) {
        resultsByDivision[div.id].push(match);
        break;
      }
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white">Resultados da Última Rodada</h3>
      {Object.entries(resultsByDivision).map(([divId, matches]) => {
        if (matches.length === 0) return null;
        const division = divisions.find(d => d.id === Number(divId));
        return (
          <div key={divId} className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              {division?.name}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {matches.map(match => (
                <MatchCard key={match.id} match={match} playerTeamId={playerTeamId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
