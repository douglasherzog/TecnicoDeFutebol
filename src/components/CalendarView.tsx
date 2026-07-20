import { useGameStore } from '../store/gameStore';

export function CalendarView() {
  const { getPlayerDivision, playerTeamId } = useGameStore();
  const division = getPlayerDivision();

  if (!division) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xl font-bold text-white">Calendário da Liga</h3>
      <div className="space-y-2">
        {division.rounds.map(round => {
          const playerMatch = round.matches.find(match => match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId);
          if (!playerMatch) return null;
          const homeTeam = division.teams.find(team => team.id === playerMatch.homeTeamId);
          const awayTeam = division.teams.find(team => team.id === playerMatch.awayTeamId);
          const current = round.number === division.currentRound + 1;

          return (
            <div key={round.number} className={`flex items-center justify-between rounded-lg p-4 ${current ? 'border border-yellow-500/50 bg-yellow-900/20' : 'bg-gray-800'}`}>
              <span className="text-sm text-gray-400">Rodada {round.number}</span>
              <span className="font-medium text-white">{homeTeam?.shortName} {playerMatch.played ? `${playerMatch.homeGoals} × ${playerMatch.awayGoals}` : '×'} {awayTeam?.shortName}</span>
              <span className={playerMatch.played ? 'text-green-400 text-xs' : current ? 'text-yellow-400 text-xs' : 'text-gray-500 text-xs'}>{playerMatch.played ? 'Encerrada' : current ? 'Próxima' : 'Agendada'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
