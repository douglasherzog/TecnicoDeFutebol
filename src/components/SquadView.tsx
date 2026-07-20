import { useGameStore } from '../store/gameStore';
import type { Player, Position } from '../types';

const positionColors: Record<Position, string> = {
  GOL: 'bg-yellow-500/20 text-yellow-400',
  ZAG: 'bg-blue-500/20 text-blue-400',
  LAT: 'bg-cyan-500/20 text-cyan-400',
  VOL: 'bg-orange-500/20 text-orange-400',
  MEI: 'bg-green-500/20 text-green-400',
  ATA: 'bg-red-500/20 text-red-400',
};

function OverallBadge({ overall }: { overall: number }) {
  let color = 'text-gray-400';
  if (overall >= 75) color = 'text-green-400';
  else if (overall >= 60) color = 'text-yellow-400';
  else if (overall >= 45) color = 'text-orange-400';
  else color = 'text-red-400';

  return <span className={`font-bold text-lg ${color}`}>{overall}</span>;
}

function PlayerRow({ player }: { player: Player }) {
  return (
    <tr className="border-b border-gray-700/50 hover:bg-gray-800/50">
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${positionColors[player.position]}`}>
          {player.position}
        </span>
      </td>
      <td className="px-3 py-2 text-white font-medium">{player.name}</td>
      <td className="px-3 py-2 text-center"><OverallBadge overall={player.overall} /></td>
      <td className="px-3 py-2 text-center text-gray-400">{player.potential}</td>
      <td className="px-3 py-2 text-center text-gray-400">{player.age}</td>
      <td className="px-3 py-2 text-right text-gray-300">${player.salary.toLocaleString()}</td>
      <td className="px-3 py-2 text-right text-gray-300">${player.marketValue.toLocaleString()}</td>
      <td className="px-3 py-2 text-center text-gray-400">{player.contractYears}a</td>
    </tr>
  );
}

export function SquadView() {
  const { getPlayerTeam } = useGameStore();
  const team = getPlayerTeam();

  if (!team) return null;

  const sortedSquad = [...team.squad].sort((a, b) => {
    const posOrder: Position[] = ['GOL', 'ZAG', 'LAT', 'VOL', 'MEI', 'ATA'];
    const posComp = posOrder.indexOf(a.position) - posOrder.indexOf(b.position);
    if (posComp !== 0) return posComp;
    return b.overall - a.overall;
  });

  const avgOverall = Math.round(team.squad.reduce((s, p) => s + p.overall, 0) / team.squad.length);
  const totalSalaries = team.squad.reduce((s, p) => s + p.salary, 0);

  // Count by position
  const posCounts: Record<Position, number> = { GOL: 0, ZAG: 0, LAT: 0, VOL: 0, MEI: 0, ATA: 0 };
  team.squad.forEach(p => posCounts[p.position]++);

  return (
    <div className="space-y-4">
      {/* Squad Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">Jogadores</p>
          <p className="text-2xl font-bold text-white">{team.squad.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">Overall Médio</p>
          <p className="text-2xl font-bold text-white">{avgOverall}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">Folha Salarial</p>
          <p className="text-2xl font-bold text-white">${(totalSalaries / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400">Posições</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {Object.entries(posCounts).map(([pos, count]) => (
              <span key={pos} className={`text-xs px-1.5 py-0.5 rounded ${positionColors[pos as Position]}`}>
                {pos}:{count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Squad Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700 bg-gray-700/30">
                <th className="px-3 py-2 text-left">Pos</th>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-center">OVR</th>
                <th className="px-3 py-2 text-center">POT</th>
                <th className="px-3 py-2 text-center">Idade</th>
                <th className="px-3 py-2 text-right">Salário</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Contr.</th>
              </tr>
            </thead>
            <tbody>
              {sortedSquad.map(player => (
                <PlayerRow key={player.id} player={player} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
