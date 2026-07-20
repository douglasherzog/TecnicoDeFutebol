import { Trophy, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export function EndSeason() {
  const { phase, divisions, playerTeamId, season, endSeason, getTeamById } = useGameStore();

  if (phase !== 'end-season') return null;

  const div1 = divisions.find(d => d.id === 1)!;
  const div2 = divisions.find(d => d.id === 2)!;
  const div3 = divisions.find(d => d.id === 3)!;

  const champion = div1.teams.find(t => t.id === div1.standings[0].teamId)!;
  const international = div1.standings.slice(0, 4).map(s => getTeamById(s.teamId)!);
  const div1Relegated = div1.standings.slice(-4).map(s => getTeamById(s.teamId)!);
  const div2Promoted = div2.standings.slice(0, 4).map(s => getTeamById(s.teamId)!);
  const div2Relegated = div2.standings.slice(-4).map(s => getTeamById(s.teamId)!);
  const div3Promoted = div3.standings.slice(0, 4).map(s => getTeamById(s.teamId)!);

  const playerTeam = getTeamById(playerTeamId!);
  const playerDivision = divisions.find(d => d.teams.some(t => t.id === playerTeamId));
  const playerPosition = playerDivision!.standings.findIndex(s => s.teamId === playerTeamId) + 1;

  let playerStatus = '';
  if (playerDivision?.id === 1 && playerPosition <= 4) playerStatus = 'Classificado para o Torneio Internacional!';
  else if (playerDivision?.id === 1 && playerPosition > 14) playerStatus = 'Rebaixado para a Segunda Divisão';
  else if (playerDivision?.id === 2 && playerPosition <= 4) playerStatus = 'Promovido para a Primeira Divisão!';
  else if (playerDivision?.id === 2 && playerPosition > 14) playerStatus = 'Rebaixado para a Terceira Divisão';
  else if (playerDivision?.id === 3 && playerPosition <= 4) playerStatus = 'Promovido para a Segunda Divisão!';
  else playerStatus = 'Permanece na mesma divisão';

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">Fim da Temporada {season}</h1>
          <p className="text-gray-400 mt-2">Confira o resumo completo</p>
        </div>

        {/* Player Result */}
        <div className="bg-gradient-to-r from-yellow-900/30 to-yellow-800/10 border border-yellow-500/30 rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-yellow-400 mb-2">Seu Time: {playerTeam?.name}</h2>
          <p className="text-3xl font-bold text-white">{playerPosition}º lugar</p>
          <p className="text-gray-300 mt-1">{playerDivision?.name}</p>
          <p className="text-lg font-semibold text-yellow-300 mt-3">{playerStatus}</p>
        </div>

        {/* Champion */}
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Campeão Nacional</h2>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full"
              style={{ backgroundColor: champion.colors.primary }}
            />
            <span className="text-white text-lg font-semibold">{champion.name}</span>
          </div>
        </div>

        {/* International */}
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Torneio Internacional</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {international.map(team => (
              <TeamBadge key={team.id} team={team} playerTeamId={playerTeamId} />
            ))}
          </div>
        </div>

        {/* Promotions & Relegations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-green-400" />
              <h2 className="text-lg font-bold text-white">Promovidos à 1ª Divisão</h2>
            </div>
            <div className="space-y-2">
              {div2Promoted.map(team => (
                <TeamBadge key={team.id} team={team} playerTeamId={playerTeamId} />
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingDown className="w-6 h-6 text-red-400" />
              <h2 className="text-lg font-bold text-white">Rebaixados da 1ª Divisão</h2>
            </div>
            <div className="space-y-2">
              {div1Relegated.map(team => (
                <TeamBadge key={team.id} team={team} playerTeamId={playerTeamId} />
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-green-400" />
              <h2 className="text-lg font-bold text-white">Promovidos à 2ª Divisão</h2>
            </div>
            <div className="space-y-2">
              {div3Promoted.map(team => (
                <TeamBadge key={team.id} team={team} playerTeamId={playerTeamId} />
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingDown className="w-6 h-6 text-red-400" />
              <h2 className="text-lg font-bold text-white">Rebaixados da 2ª Divisão</h2>
            </div>
            <div className="space-y-2">
              {div2Relegated.map(team => (
                <TeamBadge key={team.id} team={team} playerTeamId={playerTeamId} />
              ))}
            </div>
          </div>
        </div>

        {/* Next Season Button */}
        <div className="text-center pt-4">
          <button
            onClick={endSeason}
            className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-lg transition cursor-pointer"
          >
            Próxima Temporada
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamBadge({ team, playerTeamId }: { team: { id: string; name: string; colors: { primary: string; secondary: string } }; playerTeamId: string | null }) {
  const isPlayer = team.id === playerTeamId;
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${isPlayer ? 'bg-yellow-900/30 border border-yellow-500/30' : 'bg-gray-700/50'}`}>
      <div className="w-6 h-6 rounded-full" style={{ backgroundColor: team.colors.primary }} />
      <span className={`text-sm ${isPlayer ? 'text-yellow-400 font-bold' : 'text-white'}`}>{team.name}</span>
    </div>
  );
}
