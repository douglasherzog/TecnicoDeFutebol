import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Formation, Player, Position, TacticalApproach } from '../types';
import { createLineup } from '../engine/squadEngine';

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

function PlayerRow({ player, selected, onToggle }: { player: Player; selected: boolean; onToggle: () => void }) {
  const { sellPlayer, renewContract } = useGameStore();
  const [salary, setSalary] = useState(player.salary);
  const [years, setYears] = useState(Math.max(1, player.contractYears));
  const [showContract, setShowContract] = useState(false);

  const handleSale = () => {
    if (window.confirm(`Vender ${player.name} por aproximadamente $${Math.round(player.marketValue * 0.9).toLocaleString()}?`)) sellPlayer(player.id);
  };

  const handleRenewal = () => {
    if (renewContract(player.id, salary, years).success) setShowContract(false);
  };

  return (
    <tr className={`border-b border-gray-700/50 hover:bg-gray-800/50 ${selected ? 'bg-green-900/20' : ''}`}>
      <td className="px-3 py-2"><input type="checkbox" checked={selected} onChange={onToggle} className="accent-green-500 cursor-pointer" /></td>
      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-bold ${positionColors[player.position]}`}>{player.position}</span></td>
      <td className="px-3 py-2 text-white font-medium">{player.name}</td>
      <td className="px-3 py-2 text-center"><OverallBadge overall={player.overall} /></td>
      <td className="px-3 py-2 text-center text-gray-400">{player.potential}</td>
      <td className="px-3 py-2 text-center text-gray-400">{player.age}</td>
      <td className="px-3 py-2 text-center text-gray-400">{player.stamina}</td>
      <td className="px-3 py-2 text-center text-gray-400">{player.morale}</td>
      <td className="px-3 py-2 text-right text-gray-300">${player.salary.toLocaleString()}</td>
      <td className="px-3 py-2 text-right text-gray-300">${player.marketValue.toLocaleString()}</td>
      <td className="px-3 py-2 text-center text-gray-400">{player.contractYears}a</td>
      <td className="px-3 py-2 text-right">
        {showContract ? (
          <div className="flex items-center gap-1">
            <input aria-label={`Salário de ${player.name}`} type="number" value={salary} min={1} onChange={event => setSalary(Number(event.target.value))} className="w-20 bg-gray-900 border border-gray-600 rounded px-1 py-1 text-xs text-white" />
            <input aria-label={`Anos de contrato de ${player.name}`} type="number" value={years} min={1} max={5} onChange={event => setYears(Number(event.target.value))} className="w-10 bg-gray-900 border border-gray-600 rounded px-1 py-1 text-xs text-white" />
            <button onClick={handleRenewal} className="text-green-400 text-xs cursor-pointer">OK</button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 text-xs">
            <button onClick={() => setShowContract(true)} className="text-blue-400 hover:text-blue-300 cursor-pointer">Renovar</button>
            <button onClick={handleSale} className="text-red-400 hover:text-red-300 cursor-pointer">Vender</button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function SquadView() {
  const { getPlayerTeam, setLineup, setTactics } = useGameStore();
  const team = getPlayerTeam();
  const [formation, setFormation] = useState<Formation>(team?.tactics?.formation ?? '4-3-3');
  const [approach, setApproach] = useState<TacticalApproach>(team?.tactics?.approach ?? 'balanced');
  const [selectedIds, setSelectedIds] = useState<string[]>(team?.lineup ?? (team ? createLineup(team.squad, formation) : []));

  if (!team) return null;

  const togglePlayer = (playerId: string) => {
    setSelectedIds(current => current.includes(playerId)
      ? current.filter(id => id !== playerId)
      : current.length < 11 ? [...current, playerId] : current);
  };

  const applyTactics = () => {
    setTactics(formation, approach);
    setSelectedIds(createLineup(team.squad, formation));
  };

  const saveLineup = () => setLineup(selectedIds);

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

      <div className="bg-gray-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={formation} onChange={event => setFormation(event.target.value as Formation)} className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white">
          <option value="4-3-3">4-3-3</option>
          <option value="4-4-2">4-4-2</option>
          <option value="4-2-3-1">4-2-3-1</option>
        </select>
        <select value={approach} onChange={event => setApproach(event.target.value as TacticalApproach)} className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white">
          <option value="defensive">Defensiva</option>
          <option value="balanced">Equilibrada</option>
          <option value="attacking">Ofensiva</option>
        </select>
        <button onClick={applyTactics} className="bg-blue-600 hover:bg-blue-500 rounded px-3 py-2 text-white font-medium cursor-pointer">Aplicar tática</button>
        <div className="md:col-span-3 flex items-center justify-between text-sm">
          <span className={selectedIds.length === 11 ? 'text-green-400' : 'text-yellow-400'}>{selectedIds.length}/11 titulares selecionados</span>
          <button onClick={saveLineup} disabled={selectedIds.length !== 11} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded px-3 py-2 text-white font-medium cursor-pointer">Salvar escalação</button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700 bg-gray-700/30">
                <th className="px-3 py-2 text-left">Tit.</th>
                <th className="px-3 py-2 text-left">Pos</th>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-center">OVR</th>
                <th className="px-3 py-2 text-center">POT</th>
                <th className="px-3 py-2 text-center">Idade</th>
                <th className="px-3 py-2 text-center">Fís.</th>
                <th className="px-3 py-2 text-center">Moral</th>
                <th className="px-3 py-2 text-right">Salário</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Contr.</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedSquad.map(player => (
                <PlayerRow key={player.id} player={player} selected={selectedIds.includes(player.id)} onToggle={() => togglePlayer(player.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
