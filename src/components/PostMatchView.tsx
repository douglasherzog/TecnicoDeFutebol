import { useGameStore } from '../store/gameStore';
import { Flag, Star, TrendingUp, TrendingDown } from 'lucide-react';
import type { PlayerRating } from '../types';

const APPROACH_LABELS: Record<string, string> = {
  defensive: 'Defensiva',
  balanced: 'Equilibrada',
  attacking: 'Ofensiva',
};

function ratingColor(rating: number): string {
  if (rating >= 8) return 'text-green-400';
  if (rating >= 6.5) return 'text-yellow-400';
  if (rating >= 5) return 'text-gray-300';
  return 'text-red-400';
}

function PlayerRatingRow({ rating }: { rating: PlayerRating }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-700/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-8">{rating.position}</span>
        <span className="text-sm text-white">{rating.name}</span>
        {rating.goals > 0 && <span className="text-xs text-green-400">⚽ {rating.goals}</span>}
        {rating.saves > 0 && <span className="text-xs text-blue-400">🧤 {rating.saves}</span>}
        {rating.cards > 0 && <span className="text-xs text-yellow-500">🟨 {rating.cards}</span>}
      </div>
      <span className={`text-sm font-bold ${ratingColor(rating.rating)}`}>{rating.rating.toFixed(1)}</span>
    </div>
  );
}

export function PostMatchView() {
  const { phase, postMatchReport, playerTeamId, getTeamById, closePostMatch } = useGameStore();

  if (phase !== 'post-match' || !postMatchReport) return null;

  const homeTeam = getTeamById(postMatchReport.match.homeTeamId);
  const awayTeam = getTeamById(postMatchReport.match.awayTeamId);
  if (!homeTeam || !awayTeam) return null;

  const homeGoals = postMatchReport.match.homeGoals ?? 0;
  const awayGoals = postMatchReport.match.awayGoals ?? 0;
  const playerIsHome = playerTeamId === homeTeam.id;
  const playerGoals = playerIsHome ? homeGoals : awayGoals;
  const opponentGoals = playerIsHome ? awayGoals : homeGoals;
  const playerWon = playerGoals > opponentGoals;
  const playerDrew = playerGoals === opponentGoals;

  const { homeStats, awayStats, manOfTheMatch } = postMatchReport;

  const statRows = [
    { label: 'Posse de bola', home: `${homeStats.possession}%`, away: `${awayStats.possession}%` },
    { label: 'Finalizações', home: homeStats.shots, away: awayStats.shots },
    { label: 'No alvo', home: homeStats.onTarget, away: awayStats.onTarget },
    { label: 'xG', home: homeStats.xg.toFixed(2), away: awayStats.xg.toFixed(2) },
    { label: 'Faltas', home: homeStats.fouls, away: awayStats.fouls },
    { label: 'Cartões', home: homeStats.cards, away: awayStats.cards },
  ];

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Result header */}
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            {playerWon ? <TrendingUp className="w-5 h-5 text-green-400" /> :
             playerDrew ? <span className="w-5 h-5 text-gray-400">=</span> :
             <TrendingDown className="w-5 h-5 text-red-400" />}
            <span className={`font-semibold ${playerWon ? 'text-green-400' : playerDrew ? 'text-gray-400' : 'text-red-400'}`}>
              {playerWon ? 'Vitória' : playerDrew ? 'Empate' : 'Derrota'}
            </span>
          </div>
          <div className="flex items-center justify-center gap-6">
            <span className={`text-lg font-semibold ${homeTeam.id === playerTeamId ? 'text-yellow-400' : 'text-white'}`}>{homeTeam.name}</span>
            <span className="text-5xl font-bold text-white">{homeGoals} × {awayGoals}</span>
            <span className={`text-lg font-semibold ${awayTeam.id === playerTeamId ? 'text-yellow-400' : 'text-white'}`}>{awayTeam.name}</span>
          </div>
          <p className="text-gray-500 text-sm mt-2">Tempo Completo • {APPROACH_LABELS[postMatchReport.homeApproach]} vs {APPROACH_LABELS[postMatchReport.awayApproach]}</p>
        </div>

        {/* Man of the match */}
        {manOfTheMatch && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
            <Star className="w-6 h-6 text-yellow-400" />
            <div>
              <p className="text-xs text-gray-400">Craque da Partida</p>
              <p className="text-white font-semibold">{manOfTheMatch.name} <span className="text-yellow-400">({manOfTheMatch.rating.toFixed(1)})</span></p>
            </div>
          </div>
        )}

        {/* Statistics table */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Estatísticas Finais</h3>
          <div className="space-y-2 text-sm">
            {statRows.map(row => (
              <div key={row.label} className="grid grid-cols-3 items-center">
                <span className="text-white text-left font-medium">{row.home}</span>
                <span className="text-gray-400 text-center">{row.label}</span>
                <span className="text-white text-right font-medium">{row.away}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Player ratings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">{homeTeam.shortName} — Notas</h3>
            {postMatchReport.homeRatings.map(r => <PlayerRatingRow key={r.playerId} rating={r} />)}
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">{awayTeam.shortName} — Notas</h3>
            {postMatchReport.awayRatings.map(r => <PlayerRatingRow key={r.playerId} rating={r} />)}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={closePostMatch}
          className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition cursor-pointer text-lg"
        >
          <Flag className="w-5 h-5" />
          Continuar Temporada
        </button>
      </div>
    </div>
  );
}
