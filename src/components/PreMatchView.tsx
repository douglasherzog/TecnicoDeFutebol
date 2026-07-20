import { useGameStore } from '../store/gameStore';
import { Play } from 'lucide-react';

const APPROACH_LABELS: Record<string, string> = {
  defensive: 'Defensiva',
  balanced: 'Equilibrada',
  attacking: 'Ofensiva',
};

export function PreMatchView() {
  const { phase, preMatchAnalysis, playerTeamId, getTeamById, beginLiveMatch } = useGameStore();

  if (phase !== 'pre-match' || !preMatchAnalysis) return null;

  const playerDiv = useGameStore.getState().divisions.find(d => d.teams.some(t => t.id === playerTeamId));
  const round = playerDiv?.rounds[playerDiv.currentRound];
  const playerMatch = round?.matches.find(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId);
  if (!playerMatch) return null;

  const homeTeam = getTeamById(playerMatch.homeTeamId);
  const awayTeam = getTeamById(playerMatch.awayTeamId);
  if (!homeTeam || !awayTeam) return null;

  const isHome = playerTeamId === homeTeam.id;
  const playerTeamName = isHome ? homeTeam.name : awayTeam.name;

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400 text-sm">Rodada {playerDiv!.currentRound + 1} • {playerDiv!.name}</p>
          <h2 className="text-2xl font-bold text-white mt-2">{homeTeam.shortName} × {awayTeam.shortName}</h2>
          <p className="text-gray-500 text-sm mt-1">{homeTeam.name} (mandante) vs {awayTeam.name} (visitante)</p>
        </div>

        {/* Strength comparison */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-white font-semibold mb-4">Análise Pré-Partida</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm">{homeTeam.name}</p>
              <p className="text-3xl font-bold text-white">{preMatchAnalysis.homeStrength}</p>
              <p className="text-xs text-gray-500">Força</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm">{awayTeam.name}</p>
              <p className="text-3xl font-bold text-white">{preMatchAnalysis.awayStrength}</p>
              <p className="text-xs text-gray-500">Força</p>
            </div>
          </div>

          {/* Win probability bar */}
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-1">Probabilidade de resultado</p>
            <div className="flex h-6 rounded-lg overflow-hidden text-xs font-semibold text-center items-center justify-center">
              <div className="bg-green-600 text-white flex items-center justify-center" style={{ width: `${preMatchAnalysis.homeWinProb}%` }}>
                {preMatchAnalysis.homeWinProb > 10 ? `${preMatchAnalysis.homeWinProb}%` : ''}
              </div>
              <div className="bg-gray-600 text-white flex items-center justify-center" style={{ width: `${preMatchAnalysis.drawProb}%` }}>
                {preMatchAnalysis.drawProb > 10 ? `${preMatchAnalysis.drawProb}%` : ''}
              </div>
              <div className="bg-blue-600 text-white flex items-center justify-center" style={{ width: `${preMatchAnalysis.awayWinProb}%` }}>
                {preMatchAnalysis.awayWinProb > 10 ? `${preMatchAnalysis.awayWinProb}%` : ''}
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Vitória {homeTeam.shortName}</span>
              <span>Empate</span>
              <span>Vitória {awayTeam.shortName}</span>
            </div>
          </div>

          {/* Expected goals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">Gols esperados</p>
              <p className="text-xl font-bold text-yellow-400">{preMatchAnalysis.expectedGoalsHome}</p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">Gols esperados</p>
              <p className="text-xl font-bold text-yellow-400">{preMatchAnalysis.expectedGoalsAway}</p>
            </div>
          </div>

          {/* Recent form */}
          {preMatchAnalysis.recentForm.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-1">Forma recente do {playerTeamName}</p>
              <div className="flex gap-1">
                {preMatchAnalysis.recentForm.flatMap(f => f.results).map((result, i) => (
                  <span
                    key={i}
                    className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded ${
                      result === 'W' ? 'bg-green-600 text-white' :
                      result === 'D' ? 'bg-gray-500 text-white' :
                      'bg-red-600 text-white'
                    }`}
                  >
                    {result === 'W' ? 'V' : result === 'D' ? 'E' : 'D'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tactics */}
          <div className="mt-4 flex justify-between text-sm">
            <div>
              <span className="text-gray-400">Tática {homeTeam.shortName}: </span>
              <span className="text-white">{homeTeam.tactics?.formation ?? '4-3-3'} • {APPROACH_LABELS[homeTeam.tactics?.approach ?? 'balanced']}</span>
            </div>
            <div>
              <span className="text-gray-400">Tática {awayTeam.shortName}: </span>
              <span className="text-white">{awayTeam.tactics?.formation ?? '4-3-3'} • {APPROACH_LABELS[awayTeam.tactics?.approach ?? 'balanced']}</span>
            </div>
          </div>
        </div>

        <button
          onClick={beginLiveMatch}
          className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded-lg transition cursor-pointer text-lg"
        >
          <Play className="w-5 h-5" />
          Iniciar Partida
        </button>
      </div>
    </div>
  );
}
