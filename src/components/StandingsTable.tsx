import { useGameStore } from '../store/gameStore';
import type { Division } from '../types';

function DivisionTable({ division, playerTeamId }: { division: Division; playerTeamId: string | null }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <h3 className="text-lg font-semibold text-white px-4 py-3 bg-gray-700 border-b border-gray-600">
        {division.name}
        <span className="text-sm text-gray-400 ml-2">
          (Rodada {division.currentRound}/{division.rounds.length})
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-center">J</th>
              <th className="px-3 py-2 text-center">V</th>
              <th className="px-3 py-2 text-center">E</th>
              <th className="px-3 py-2 text-center">D</th>
              <th className="px-3 py-2 text-center">GP</th>
              <th className="px-3 py-2 text-center">GC</th>
              <th className="px-3 py-2 text-center">SG</th>
              <th className="px-3 py-2 text-center font-bold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {division.standings.map((standing, index) => {
              const team = division.teams.find(t => t.id === standing.teamId)!;
              const isPlayer = standing.teamId === playerTeamId;
              const position = index + 1;

              let rowBg = '';
              if (division.id === 1 && position <= 4) rowBg = 'bg-blue-900/30';
              else if (division.id === 1 && position > 14) rowBg = 'bg-red-900/30';
              else if (division.id === 2 && position <= 4) rowBg = 'bg-green-900/30';
              else if (division.id === 2 && position > 14) rowBg = 'bg-red-900/30';
              else if (division.id === 3 && position <= 4) rowBg = 'bg-green-900/30';

              return (
                <tr
                  key={standing.teamId}
                  className={`border-b border-gray-700/50 ${rowBg} ${isPlayer ? 'ring-1 ring-yellow-500/50 bg-yellow-900/20' : ''}`}
                >
                  <td className="px-3 py-2 text-gray-400 font-mono">{position}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: team.colors.primary }}
                      />
                      <span className={`${isPlayer ? 'text-yellow-400 font-bold' : 'text-white'}`}>
                        {team.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-300">{standing.played}</td>
                  <td className="px-3 py-2 text-center text-gray-300">{standing.won}</td>
                  <td className="px-3 py-2 text-center text-gray-300">{standing.drawn}</td>
                  <td className="px-3 py-2 text-center text-gray-300">{standing.lost}</td>
                  <td className="px-3 py-2 text-center text-gray-300">{standing.goalsFor}</td>
                  <td className="px-3 py-2 text-center text-gray-300">{standing.goalsAgainst}</td>
                  <td className="px-3 py-2 text-center text-gray-300">
                    {standing.goalsFor - standing.goalsAgainst}
                  </td>
                  <td className="px-3 py-2 text-center text-white font-bold">{standing.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-gray-500 flex gap-4 flex-wrap">
        {division.id === 1 && (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Torneio Internacional
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Rebaixamento
            </span>
          </>
        )}
        {division.id === 2 && (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Promoção
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Rebaixamento
            </span>
          </>
        )}
        {division.id === 3 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Promoção
          </span>
        )}
      </div>
    </div>
  );
}

export function StandingsTable() {
  const { divisions, playerTeamId } = useGameStore();

  return (
    <div className="space-y-6">
      {divisions.map(division => (
        <DivisionTable key={division.id} division={division} playerTeamId={playerTeamId} />
      ))}
    </div>
  );
}
