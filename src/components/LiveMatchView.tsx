import { useEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, Flag, Repeat, Activity, Star } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { countGoals, computeMomentum, computePlayerRatings, computePossession, computeTeamStats, computeTension } from '../engine/liveMatchEngine';
import { PitchAnimation } from './PitchAnimation';
import type { MatchEvent, TacticalApproach } from '../types';

const APPROACH_LABELS: Record<TacticalApproach, string> = {
  defensive: 'Defensiva',
  balanced: 'Equilibrada',
  attacking: 'Ofensiva',
};

const HALF_TIME_MINUTE = 45;
const FULL_TIME_MINUTE = 90;
const BASE_TICK_MS = 2000;

const EVENT_STYLES: Record<MatchEvent['type'], string> = {
  kickoff: 'text-gray-300',
  goal: 'text-green-400 font-semibold',
  penalty_goal: 'text-green-400 font-semibold',
  own_goal: 'text-red-400 font-semibold',
  save: 'text-blue-300',
  miss: 'text-gray-400',
  penalty_miss: 'text-orange-400',
  foul: 'text-gray-400',
  card: 'text-yellow-400',
  red_card: 'text-red-500 font-semibold',
  injury: 'text-orange-300',
  sub: 'text-cyan-300',
  halftime: 'text-yellow-300 font-medium',
  fulltime: 'text-yellow-300 font-semibold',
};

const TIMELINE_MARKERS: MatchEvent['type'][] = ['goal', 'penalty_goal', 'own_goal', 'red_card', 'penalty_miss', 'injury', 'sub'];
const TIMELINE_COLORS: Record<string, string> = {
  goal: 'bg-green-500',
  penalty_goal: 'bg-green-500',
  own_goal: 'bg-red-500',
  red_card: 'bg-red-600',
  penalty_miss: 'bg-orange-500',
  injury: 'bg-orange-400',
  sub: 'bg-cyan-400',
};

function tensionColor(tension: number): string {
  if (tension >= 75) return 'bg-red-500';
  if (tension >= 50) return 'bg-orange-500';
  if (tension >= 30) return 'bg-yellow-500';
  return 'bg-green-500';
}

function ratingColor(rating: number): string {
  if (rating >= 8) return 'text-green-400';
  if (rating >= 6.5) return 'text-yellow-400';
  if (rating >= 5) return 'text-gray-300';
  return 'text-red-400';
}

export function LiveMatchView() {
  const { phase, liveMatch, playerTeamId, getTeamById, getPlayerTeam, getPlayerDivision, setLiveMatchApproach, makeLiveSubstitution, finishLiveMatch } = useGameStore();
  const [minute, setMinute] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [halftimeShown, setHalftimeShown] = useState(false);
  const [subOutId, setSubOutId] = useState('');
  const [subInId, setSubInId] = useState('');
  const [subMessage, setSubMessage] = useState<string | null>(null);
  const [goalFlash, setGoalFlash] = useState(false);
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<MatchEvent | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const prevMinuteRef = useRef(1);

  const atHalftime = minute === HALF_TIME_MINUTE && halftimeShown && paused;
  const finished = minute >= FULL_TIME_MINUTE;

  // Reset state when a new match starts
  const matchId = liveMatch?.match.id;
  useEffect(() => {
    setMinute(1);
    setSpeed(1);
    setPaused(false);
    setHalftimeShown(false);
    setSubOutId('');
    setSubInId('');
    setSubMessage(null);
    setGoalFlash(false);
    setSelectedTimelineEvent(null);
    prevMinuteRef.current = 1;
  }, [matchId]);

  useEffect(() => {
    if (phase !== 'live-match' || !liveMatch || paused || finished) return;
    const timer = setInterval(() => {
      setMinute(current => {
        const next = Math.min(FULL_TIME_MINUTE, current + 1);
        if (next === HALF_TIME_MINUTE) {
          setPaused(true);
          setHalftimeShown(true);
        }
        return next;
      });
    }, BASE_TICK_MS / speed);
    return () => clearInterval(timer);
  }, [phase, liveMatch, paused, finished, speed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [minute]);

  // Goal flash animation
  useEffect(() => {
    if (minute === prevMinuteRef.current) return;
    const newEvents = liveMatch?.events.filter(event =>
      event.minute > prevMinuteRef.current && event.minute <= minute &&
      (event.type === 'goal' || event.type === 'penalty_goal'),
    ) ?? [];
    prevMinuteRef.current = minute;
    if (newEvents.length > 0) {
      setGoalFlash(true);
      const timer = setTimeout(() => setGoalFlash(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [minute, liveMatch]);

  if (phase !== 'live-match' || !liveMatch) return null;

  const homeTeam = getTeamById(liveMatch.match.homeTeamId);
  const awayTeam = getTeamById(liveMatch.match.awayTeamId);
  if (!homeTeam || !awayTeam) return null;

  const visibleEvents = liveMatch.events.filter(event => event.minute <= minute);
  const homeGoals = countGoals(liveMatch.events, homeTeam.id, minute);
  const awayGoals = countGoals(liveMatch.events, awayTeam.id, minute);
  const playerApproach = playerTeamId === homeTeam.id ? liveMatch.homeApproach : liveMatch.awayApproach;

  const homeStats = computeTeamStats(liveMatch.events, homeTeam.id, awayTeam.id, minute);
  const awayStats = computeTeamStats(liveMatch.events, awayTeam.id, homeTeam.id, minute);
  const homeMomentum = computeMomentum(liveMatch.events, homeTeam.id, awayTeam.id, minute);
  const tension = computeTension(liveMatch.events, minute);
  const possession = computePossession(homeTeam, awayTeam, liveMatch.homeApproach, liveMatch.awayApproach, minute);
  const homeRatings = computePlayerRatings(liveMatch.events, homeTeam, minute);
  const awayRatings = computePlayerRatings(liveMatch.events, awayTeam, minute);
  const playerRatings = playerTeamId === homeTeam.id ? homeRatings : awayRatings;
  const topRatings = [...playerRatings].sort((a, b) => b.rating - a.rating).slice(0, 5);
  const timelineEvents = visibleEvents.filter(event => TIMELINE_MARKERS.includes(event.type));

  // Player highlights: key moments involving player team
  const playerHighlights = visibleEvents.filter(event =>
    event.teamId === playerTeamId &&
    (event.type === 'goal' || event.type === 'penalty_goal' || event.type === 'save' || event.type === 'miss' || event.type === 'card' || event.type === 'red_card'),
  ).reverse();

  // Live standings impact
  const playerDiv = getPlayerDivision();
  const playerStanding = playerDiv?.standings.find(s => s.teamId === playerTeamId);
  const playerPos = playerDiv ? playerDiv.standings.findIndex(s => s.teamId === playerTeamId) + 1 : 0;
  const isHome = playerTeamId === homeTeam.id;
  const projectedPlayerGoals = isHome ? homeGoals : awayGoals;
  const projectedOpponentGoals = isHome ? awayGoals : homeGoals;
  const projectedWin = projectedPlayerGoals > projectedOpponentGoals;
  const projectedDraw = projectedPlayerGoals === projectedOpponentGoals;
  const projectedPoints = playerStanding ? playerStanding.points + (projectedWin ? 3 : projectedDraw ? 1 : 0) : 0;

  const playerTeam = getPlayerTeam();
  const lineupPlayers = playerTeam?.squad.filter(player => playerTeam.lineup?.includes(player.id)) ?? [];
  const benchPlayers = playerTeam?.squad.filter(player => !playerTeam.lineup?.includes(player.id)) ?? [];
  const substitutionsLeft = 3 - (liveMatch.substitutionsUsed ?? 0);

  const handleSubstitution = () => {
    if (!subOutId || !subInId) return;
    const result = makeLiveSubstitution(subOutId, subInId, minute);
    setSubMessage(result.reason);
    if (result.success) {
      setSubOutId('');
      setSubInId('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* Goal flash overlay */}
      {goalFlash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="text-6xl font-black text-green-400 animate-pulse" style={{ textShadow: '0 0 30px rgba(74,222,128,0.8)' }}>
            GOAL!
          </div>
        </div>
      )}

      <div className={`max-w-3xl mx-auto space-y-4 ${goalFlash ? 'flash-bg' : ''}`}>
        {/* Scoreboard */}
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-1">
            <p className="text-yellow-400 font-mono text-xl" role="timer" aria-label="Minuto da partida">{minute}'</p>
            <div className="flex items-center gap-1" title="Tensão da partida">
              <Activity className="w-3.5 h-3.5 text-gray-500" />
              <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-500 ${tensionColor(tension)}`} style={{ width: `${tension}%` }} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <span className={`text-lg font-semibold ${homeTeam.id === playerTeamId ? 'text-yellow-400' : 'text-white'}`}>{homeTeam.name}</span>
            <span className="text-4xl font-bold text-white">{homeGoals} × {awayGoals}</span>
            <span className={`text-lg font-semibold ${awayTeam.id === playerTeamId ? 'text-yellow-400' : 'text-white'}`}>{awayTeam.name}</span>
          </div>
        </div>

        {/* Pitch Animation */}
        <PitchAnimation
          minute={minute}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeApproach={liveMatch.homeApproach}
          awayApproach={liveMatch.awayApproach}
          events={liveMatch.events}
          speed={speed}
          paused={paused}
        />

        {/* Possession & Momentum */}
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          {/* Possession */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Posse de bola</span>
              <span>{possession.home}% × {possession.away}%</span>
            </div>
            <div className="h-2 bg-blue-900/60 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${possession.home}%` }} />
            </div>
          </div>
          {/* Momentum */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Momentum</span>
              <span>{Math.round(homeMomentum * 100)}% × {Math.round((1 - homeMomentum) * 100)}%</span>
            </div>
            <div className="h-2 bg-red-900/60 rounded-full overflow-hidden" role="progressbar" aria-label="Momentum do mandante" aria-valuenow={Math.round(homeMomentum * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${homeMomentum * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs text-gray-400 mb-2">Linha do Tempo</h3>
          <div className="relative h-8 bg-gray-700/50 rounded-full">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
            {timelineEvents.map((event, index) => (
              <button
                key={index}
                onClick={() => setSelectedTimelineEvent(selectedTimelineEvent === event ? null : event)}
                className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${TIMELINE_COLORS[event.type] ?? 'bg-gray-500'} cursor-pointer hover:scale-150 transition-transform`}
                style={{ left: `calc(${(event.minute / FULL_TIME_MINUTE) * 100}% - 6px)` }}
                title={`${event.minute}' — ${event.description}`}
              />
            ))}
            <span className="absolute left-1 -top-0.5 text-xs text-gray-500">0'</span>
            <span className="absolute left-1/2 -top-0.5 -translate-x-1/2 text-xs text-gray-500">45'</span>
            <span className="absolute right-1 -top-0.5 text-xs text-gray-500">90'</span>
          </div>
          {selectedTimelineEvent && (
            <p className={`text-sm mt-2 ${EVENT_STYLES[selectedTimelineEvent.type]}`}>
              <span className="text-gray-500 font-mono mr-2">{selectedTimelineEvent.minute}'</span>
              {selectedTimelineEvent.description}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-3">
          {!finished && !atHalftime && (
            <button
              onClick={() => setPaused(current => !current)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition cursor-pointer"
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {paused ? 'Continuar' : 'Pausar'}
            </button>
          )}
          {!finished && (
            <>
              {[1, 2, 4].map(option => (
                <button
                  key={option}
                  onClick={() => setSpeed(option)}
                  aria-pressed={speed === option}
                  className={`px-3 py-2 rounded-lg text-sm transition cursor-pointer ${speed === option ? 'bg-yellow-500 text-gray-900 font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  {option}x
                </button>
              ))}
              <button
                onClick={() => { setMinute(FULL_TIME_MINUTE); setPaused(false); }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition cursor-pointer"
              >
                <FastForward className="w-4 h-4" />
                Pular para o fim
              </button>
            </>
          )}
          {finished && (
            <button
              onClick={finishLiveMatch}
              className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition cursor-pointer"
            >
              <Flag className="w-4 h-4" />
              Encerrar e aplicar resultado
            </button>
          )}
        </div>

        {/* Quick tactical instructions */}
        {!finished && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-400">Postura tática:</span>
            {(Object.keys(APPROACH_LABELS) as TacticalApproach[]).map(option => (
              <button
                key={option}
                onClick={() => setLiveMatchApproach(option, Math.max(minute + 1, 2))}
                aria-pressed={playerApproach === option}
                className={`px-3 py-2 rounded-lg text-sm transition cursor-pointer ${playerApproach === option ? 'bg-blue-500 text-white font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {APPROACH_LABELS[option]}
              </button>
            ))}
            <span className="text-xs text-gray-500">Efeito imediato nos próximos minutos</span>
          </div>
        )}

        {/* Halftime banner */}
        {atHalftime && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 flex flex-wrap items-center gap-3">
            <p className="text-yellow-400 font-semibold">Intervalo — ajuste tática e substituições antes do 2º tempo</p>
            <button
              onClick={() => { setPaused(false); setHalftimeShown(false); setMinute(HALF_TIME_MINUTE + 1); }}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition cursor-pointer"
            >
              Iniciar 2º tempo
            </button>
          </div>
        )}

        {/* Substitutions */}
        {!finished && (paused || atHalftime) && (
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-cyan-400" />
              <h3 className="text-white font-semibold">Substituições</h3>
              <span className="text-xs text-gray-400">({substitutionsLeft} restante{substitutionsLeft === 1 ? '' : 's'})</span>
            </div>
            {substitutionsLeft > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="sub-out" className="text-sm text-gray-400">Sai:</label>
                <select id="sub-out" value={subOutId} onChange={event => setSubOutId(event.target.value)} className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm">
                  <option value="">Selecione</option>
                  {lineupPlayers.map(player => (
                    <option key={player.id} value={player.id}>{player.position} — {player.name} (OVR {player.overall})</option>
                  ))}
                </select>
                <label htmlFor="sub-in" className="text-sm text-gray-400">Entra:</label>
                <select id="sub-in" value={subInId} onChange={event => setSubInId(event.target.value)} className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm">
                  <option value="">Selecione</option>
                  {benchPlayers.map(player => (
                    <option key={player.id} value={player.id}>{player.position} — {player.name} (OVR {player.overall})</option>
                  ))}
                </select>
                <button
                  onClick={handleSubstitution}
                  disabled={!subOutId || !subInId}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition cursor-pointer"
                >
                  Substituir
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Todas as substituições foram utilizadas.</p>
            )}
            {subMessage && <p className="text-sm text-cyan-300">{subMessage}</p>}
          </div>
        )}

        {/* Stats */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Estatísticas</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Posse', home: `${possession.home}%`, away: `${possession.away}%` },
              { label: 'Finalizações', home: homeStats.shots, away: awayStats.shots },
              { label: 'No alvo', home: homeStats.onTarget, away: awayStats.onTarget },
              { label: 'xG', home: homeStats.xg.toFixed(2), away: awayStats.xg.toFixed(2) },
              { label: 'Faltas', home: homeStats.fouls, away: awayStats.fouls },
              { label: 'Cartões', home: homeStats.cards, away: awayStats.cards },
            ].map(row => (
              <div key={row.label} className="grid grid-cols-3 items-center">
                <span className="text-white text-left">{row.home}</span>
                <span className="text-gray-400 text-center">{row.label}</span>
                <span className="text-white text-right">{row.away}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Player ratings (top 5) */}
        {topRatings.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-yellow-400" />
              <h3 className="text-white font-semibold">Melhores do seu time</h3>
            </div>
            <div className="space-y-1.5">
              {topRatings.map(rating => (
                <div key={rating.playerId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8">{rating.position}</span>
                    <span className="text-white">{rating.name}</span>
                    {rating.goals > 0 && <span className="text-xs text-green-400">⚽ {rating.goals}</span>}
                    {rating.saves > 0 && <span className="text-xs text-blue-400">🧤 {rating.saves}</span>}
                  </div>
                  <span className={`font-bold ${ratingColor(rating.rating)}`}>{rating.rating.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player highlights & live standings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Highlights */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Destaques</h3>
            {playerHighlights.length === 0 ? (
              <p className="text-sm text-gray-500">Sem lances relevantes ainda.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {playerHighlights.map((event, index) => (
                  <p key={index} className={`text-xs ${EVENT_STYLES[event.type]}`}>
                    <span className="text-gray-500 font-mono mr-1">{event.minute}'</span>
                    {event.description}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Live standings */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Classificação (parcial)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Posição atual</span>
                <span className="text-white font-bold">{playerPos}º</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Pontos atuais</span>
                <span className="text-white font-bold">{playerStanding?.points ?? 0}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                <span className="text-gray-400">Pontos projetados</span>
                <span className={`font-bold ${projectedWin ? 'text-green-400' : projectedDraw ? 'text-yellow-400' : 'text-red-400'}`}>{projectedPoints}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {projectedWin ? 'Vitória projetada (+3)' : projectedDraw ? 'Empate projetado (+1)' : 'Derrota projetada (+0)'}
              </p>
            </div>
          </div>
        </div>

        {/* Narration */}
        <div ref={logRef} className="bg-gray-800 rounded-lg p-4 h-72 overflow-y-auto space-y-2" role="log" aria-live="polite" aria-label="Narração da partida">
          {visibleEvents.map((event, index) => (
            <p key={index} className={`text-sm ${EVENT_STYLES[event.type]}`}>
              <span className="text-gray-500 font-mono mr-2">{event.minute}'</span>
              {event.description}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
