import { useGameStore } from '../store/gameStore';

export function CupView() {
  const { cup, getTeamById, playerTeamId } = useGameStore();

  if (!cup) return null;

  const champion = cup.championId ? getTeamById(cup.championId) : undefined;
  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-xl font-bold text-white">{cup.name}</h3>
        <p className="text-sm text-gray-400 mt-1">{champion ? `Campeão: ${champion.name}` : `Fase atual: ${cup.rounds[cup.currentRound]?.name ?? 'Encerrada'}`}</p>
      </div>
      {cup.rounds.map(round => (
        <section key={round.name} className="bg-gray-800 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-400 mb-3">{round.name}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {round.matches.map(match => {
              const home = getTeamById(match.homeTeamId);
              const away = getTeamById(match.awayTeamId);
              const playerMatch = match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId;
              return <div key={match.id} className={`p-3 rounded ${playerMatch ? 'bg-yellow-900/20 border border-yellow-500/30' : 'bg-gray-900/60'}`}><span className="text-white">{home?.shortName} {match.played ? `${match.homeGoals} × ${match.awayGoals}` : '×'} {away?.shortName}</span></div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
