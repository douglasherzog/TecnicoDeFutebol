import { useState, type ReactNode } from 'react';
import { Play, FastForward, Trophy, TrendingUp, TrendingDown, Shield, DollarSign, Eye } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { StandingsTable } from './StandingsTable';
import { MatchResults } from './MatchResults';
import { SquadView } from './SquadView';
import { FinancesView } from './FinancesView';
import { TransferMarket } from './TransferMarket';
import { CalendarView } from './CalendarView';
import { CupView } from './CupView';

type Tab = 'overview' | 'standings' | 'squad' | 'finances' | 'transfers' | 'results' | 'calendar' | 'cup';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Visão Geral' },
  { key: 'standings', label: 'Classificação' },
  { key: 'squad', label: 'Elenco' },
  { key: 'finances', label: 'Finanças' },
  { key: 'transfers', label: 'Mercado' },
  { key: 'calendar', label: 'Calendário' },
  { key: 'cup', label: 'Copa' },
  { key: 'results', label: 'Resultados' },
];

export function Dashboard() {
  const { phase, coachName, playerTeamId, season, divisions, finances, simulateRound, simulateAllRounds, startPreMatch, showEndSeason, notifications, transferOffers, seasonHistory, objective } = useGameStore();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  if (phase !== 'playing') return null;

  const playerDivision = divisions.find(d => d.teams.some(t => t.id === playerTeamId));
  const playerTeam = playerDivision?.teams.find(t => t.id === playerTeamId);
  const playerStanding = playerDivision?.standings.find(s => s.teamId === playerTeamId);
  const playerPosition = playerDivision ? playerDivision.standings.findIndex(s => s.teamId === playerTeamId) + 1 : 0;
  const totalRounds = playerDivision?.rounds.length ?? 34;
  const currentRound = playerDivision?.currentRound ?? 0;
  const seasonFinished = divisions.every(d => d.currentRound >= d.rounds.length);
  const pendingOffers = transferOffers.filter(o => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center border-2"
              style={{ backgroundColor: playerTeam?.colors.primary, borderColor: playerTeam?.colors.secondary }}
            >
              <Shield className="w-6 h-6" style={{ color: playerTeam?.colors.secondary }} />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">{playerTeam?.name}</h1>
              <p className="text-gray-400 text-sm">Técnico {coachName} • {playerDivision?.name} • Temp. {season}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{playerPosition}º</p>
              <p className="text-xs text-gray-400">Posição</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{playerStanding?.points ?? 0}</p>
              <p className="text-xs text-gray-400">Pontos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{currentRound}/{totalRounds}</p>
              <p className="text-xs text-gray-400">Rodada</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${finances.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${(finances.balance / 1000).toFixed(0)}k
              </p>
              <p className="text-xs text-gray-400">Saldo</p>
            </div>
          </div>
        </div>
      </header>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="bg-gray-800/50 border-b border-gray-700 px-6 py-2">
          <div className="max-w-7xl mx-auto flex gap-4 overflow-x-auto text-sm" role="status" aria-live="polite">
            {notifications.map((n, i) => (
              <span key={i} className="text-yellow-300 whitespace-nowrap">{n}</span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="bg-gray-800/50 border-b border-gray-700">
        <div className="max-w-7xl mx-auto flex gap-1 px-6 overflow-x-auto" role="tablist" aria-label="Navegação principal">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              role="tab"
              aria-selected={activeTab === key}
              className={`px-4 py-3 text-sm font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === key
                  ? 'text-yellow-400 border-b-2 border-yellow-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
              {key === 'transfers' && pendingOffers > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-green-600 text-white rounded-full">
                  {pendingOffers}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-6" role="tabpanel" aria-label={TABS.find(tab => tab.key === activeTab)?.label}>
        {/* Action Buttons */}
        {!seasonFinished && (
          <div className="flex gap-3 mb-6 flex-wrap">
            <button
              onClick={startPreMatch}
              className="flex items-center gap-2 px-5 py-3 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-medium rounded-lg transition cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Assistir Partida
            </button>
            <button
              onClick={simulateRound}
              className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Simular Rodada
            </button>
            <button
              onClick={simulateAllRounds}
              className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition cursor-pointer"
            >
              <FastForward className="w-4 h-4" />
              Simular Tudo
            </button>
          </div>
        )}

        {seasonFinished && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-400 font-semibold">Temporada Encerrada!</p>
            <p className="text-gray-300 text-sm mt-1">
              Verifique a classificação final e avance para a próxima temporada.
            </p>
            <button
              onClick={showEndSeason}
              className="mt-3 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-medium rounded-lg transition cursor-pointer"
            >
              Ver Resumo da Temporada
            </button>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Desempenho</h3>
              {playerStanding && (
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Jogos" value={playerStanding.played} />
                  <Stat label="Vitórias" value={playerStanding.won} />
                  <Stat label="Empates" value={playerStanding.drawn} />
                  <Stat label="Derrotas" value={playerStanding.lost} />
                  <Stat label="Gols Pró" value={playerStanding.goalsFor} />
                  <Stat label="Gols Contra" value={playerStanding.goalsAgainst} />
                  <Stat label="Saldo" value={playerStanding.goalsFor - playerStanding.goalsAgainst} />
                  <Stat label="Pontos" value={playerStanding.points} highlight />
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Situação</h3>
              <div className="space-y-3">
                {playerDivision?.id === 1 && playerPosition <= 4 && (
                  <ZoneIndicator icon={<Trophy className="w-5 h-5 text-blue-400" />} text="Classificado para Torneio Internacional!" color="blue" />
                )}
                {playerDivision?.id === 1 && playerPosition > 14 && (
                  <ZoneIndicator icon={<TrendingDown className="w-5 h-5 text-red-400" />} text="Zona de Rebaixamento" color="red" />
                )}
                {(playerDivision?.id === 2 || playerDivision?.id === 3) && playerPosition <= 4 && (
                  <ZoneIndicator icon={<TrendingUp className="w-5 h-5 text-green-400" />} text="Zona de Promoção!" color="green" />
                )}
                {playerDivision?.id === 2 && playerPosition > 14 && (
                  <ZoneIndicator icon={<TrendingDown className="w-5 h-5 text-red-400" />} text="Zona de Rebaixamento" color="red" />
                )}
                {!(
                  (playerDivision?.id === 1 && (playerPosition <= 4 || playerPosition > 14)) ||
                  ((playerDivision?.id === 2 || playerDivision?.id === 3) && playerPosition <= 4) ||
                  (playerDivision?.id === 2 && playerPosition > 14)
                ) && (
                  <p className="text-gray-400">Meio da tabela - sem zona especial</p>
                )}

                <div className="flex items-center gap-2 mt-4 p-3 bg-gray-700/30 rounded-lg">
                  <DollarSign className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-gray-300">Saldo: </span>
                  <span className={`text-sm font-bold ${finances.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${finances.balance.toLocaleString()}
                  </span>
                </div>
              </div>

              {objective && (
                <div className="mt-6 p-3 rounded-lg bg-gray-700/30 border border-gray-600">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase mb-1">Objetivo da Temporada</h4>
                  <p className="text-sm text-white">{objective.description}</p>
                  <p className={`text-xs mt-1 ${objective.status === 'achieved' ? 'text-green-400' : objective.status === 'missed' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {objective.status === 'achieved' ? 'Objetivo alcançado' : objective.status === 'missed' ? 'Objetivo não alcançado' : 'Em andamento'}
                  </p>
                </div>
              )}

              {seasonHistory.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase mb-2">Histórico</h4>
                  <div className="space-y-1">
                    {seasonHistory.map(h => (
                      <p key={h.season} className="text-sm text-gray-300">
                        Temp. {h.season}: {h.position}º lugar - Div. {h.division}
                        {h.promoted && ' ↑'}
                        {h.relegated && ' ↓'}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <MatchResults />
            </div>
          </div>
        )}

        {activeTab === 'standings' && <StandingsTable />}
        {activeTab === 'squad' && <SquadView />}
        {activeTab === 'finances' && <FinancesView />}
        {activeTab === 'transfers' && <TransferMarket />}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'cup' && <CupView />}
        {activeTab === 'results' && <MatchResults />}
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-yellow-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function ZoneIndicator({ icon, text, color }: { icon: ReactNode; text: string; color: string }) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-900/30 border-blue-500/30',
    red: 'bg-red-900/30 border-red-500/30',
    green: 'bg-green-900/30 border-green-500/30',
  };
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgMap[color]}`}>
      {icon}
      <span className="text-white font-medium">{text}</span>
    </div>
  );
}
