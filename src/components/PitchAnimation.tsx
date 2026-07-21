import { useEffect, useRef, useState, useMemo } from 'react';
import type { Team, MatchEvent, TacticalApproach } from '../types';
import { buildPlayers } from '../engine/pitchEngine';
import { MatchSimulation, type SimulationRefs, TICK_INTERVAL_MS } from '../engine/matchSimulation';

interface PitchAnimationProps {
  minute: number;
  homeTeam: Team;
  awayTeam: Team;
  homeApproach: TacticalApproach;
  awayApproach: TacticalApproach;
  events: MatchEvent[];
  speed: number;
  paused?: boolean;
  showTacticalZones?: boolean;
}

const ACTION_COLORS: Record<string, string> = {
  pass: '#60a5fa',
  long_pass: '#3b82f6',
  cross: '#8b5cf6',
  carry: '#fbbf24',
  dribble: '#f59e0b',
  tabela: '#f97316',
  header: '#a78bfa',
  tackle: '#dc2626',
  intercept: '#f97316',
  shot: '#ef4444',
  save: '#06b6d4',
  goal: '#22c55e',
  clearance: '#a78bfa',
  throw_in: '#94a3b8',
  corner: '#ec4899',
  build_up: '#64748b',
};

const ACTION_LABELS: Record<string, string> = {
  pass: 'Passe',
  long_pass: 'Lançamento',
  cross: 'Cruzamento',
  carry: 'Condução',
  dribble: 'Drible',
  tabela: 'Tabela',
  header: 'Cabeceio',
  tackle: 'Carrinho',
  intercept: 'Interceptação',
  shot: 'Finalização',
  save: 'Defesa',
  goal: 'GOL',
  clearance: 'Afastamento',
  throw_in: 'Lateral',
  corner: 'Escanteio',
  build_up: 'Construção',
};

export function PitchAnimation({ minute, homeTeam, awayTeam, homeApproach, awayApproach, events, speed, paused = false, showTacticalZones = false }: PitchAnimationProps) {
  const players = useMemo(() => buildPlayers(homeTeam, awayTeam), [homeTeam, awayTeam]);
  const allPlayers = useMemo(() => [...players.home, ...players.away], [players]);

  // Track the last ball and player positions across minutes for continuity
  const lastBallPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPlayerPositionsRef = useRef<{ home: { x: number; y: number }[]; away: { x: number; y: number }[] } | null>(null);

  // Apply saved player positions from previous minute for continuity
  const playersForMinute = useMemo(() => {
    const saved = lastPlayerPositionsRef.current;
    if (!saved || minute === 1) return players;
    return {
      home: players.home.map((p, i) => ({
        ...p,
        currentCoord: saved.home[i] ? { ...saved.home[i] } : { ...p.currentCoord },
      })),
      away: players.away.map((p, i) => ({
        ...p,
        currentCoord: saved.away[i] ? { ...saved.away[i] } : { ...p.currentCoord },
      })),
    };
  }, [players, minute]);

  // Find the match event for this minute (if any) to pass to the live simulation
  const minuteEvent = useMemo(() => {
    const minuteEvents = events.filter(e => e.minute === minute);
    const actionEvents = minuteEvents.filter(e =>
      !['kickoff', 'halftime', 'fulltime'].includes(e.type)
    );
    return actionEvents[0] ?? null;
  }, [minute, events]);

  // Check for marker events (kickoff/halftime/fulltime) for display
  const markerEvent = useMemo(() => {
    const minuteEvents = events.filter(e => e.minute === minute);
    return minuteEvents.find(e =>
      ['kickoff', 'halftime', 'fulltime'].includes(e.type)
    ) ?? null;
  }, [minute, events]);

  // Reset state on minute 1
  useEffect(() => {
    if (minute === 1) {
      lastBallPosRef.current = null;
      lastPlayerPositionsRef.current = null;
    }
  }, [minute]);

  const simRef = useRef<MatchSimulation | null>(null);
  const ballRef = useRef<SVGCircleElement | null>(null);
  const shadowRef = useRef<SVGEllipseElement | null>(null);
  const trailRef = useRef<SVGLineElement | null>(null);
  const goalFlashRef = useRef<SVGCircleElement | null>(null);
  const saveFlashRef = useRef<SVGCircleElement | null>(null);
  const playerRefs = useRef<Record<string, { dot: SVGCircleElement | null; outline: SVGCircleElement | null; dir: SVGLineElement | null; label: SVGTextElement | null }>>({});
  const refereeRef = useRef<SVGCircleElement | null>(null);
  const linesman1Ref = useRef<SVGCircleElement | null>(null);
  const linesman2Ref = useRef<SVGCircleElement | null>(null);
  const refsRef = useRef<SimulationRefs>({
    get ball() { return ballRef.current; },
    get shadow() { return shadowRef.current; },
    get trail() { return trailRef.current; },
    get goalFlash() { return goalFlashRef.current; },
    get saveFlash() { return saveFlashRef.current; },
    get referee() { return refereeRef.current; },
    get linesman1() { return linesman1Ref.current; },
    get linesman2() { return linesman2Ref.current; },
    get players() { return playerRefs.current; },
  });

  const lastTimeRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const [tick, setTick] = useState(1);

  speedRef.current = speed;
  pausedRef.current = paused;

  // (Re)start the live simulation loop whenever the minute changes
  useEffect(() => {
    simRef.current = new MatchSimulation(
      minute,
      playersForMinute.home,
      playersForMinute.away,
      homeTeam.id,
      awayTeam.id,
      speedRef.current,
      homeApproach as string,
      awayApproach as string,
      minuteEvent,
      lastBallPosRef.current,
    );
    lastTimeRef.current = null;
    accumulatorRef.current = 0;
    setTick(n => n + 1);

    const loop = (timestamp: number) => {
      if (!simRef.current) return;
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (pausedRef.current) {
        // freeze advancement but keep the last timestamp valid
        lastTimeRef.current = timestamp;
      } else {
        accumulatorRef.current += delta;
        simRef.current.setSpeed(speedRef.current);
        let ticked = false;
        while (accumulatorRef.current >= TICK_INTERVAL_MS) {
          simRef.current.tick(TICK_INTERVAL_MS);
          accumulatorRef.current -= TICK_INTERVAL_MS;
          ticked = true;
        }
        if (ticked) setTick(n => n + 1);
      }

      const alpha = simRef.current.getInterpolationAlpha();
      simRef.current.render(alpha, refsRef.current);

      const currentPlay = simRef.current.getCurrentPlay();
      const isBigAction = currentPlay && ['shot', 'goal', 'save'].includes(currentPlay.action);
      if (ballRef.current) {
        ballRef.current.setAttribute('stroke', (currentPlay ? ACTION_COLORS[currentPlay.action] : '#1e293b') ?? '#1e293b');
        ballRef.current.setAttribute('stroke-width', isBigAction ? '0.4' : '0.2');
      }
      if (trailRef.current && currentPlay) {
        trailRef.current.setAttribute('stroke', ACTION_COLORS[currentPlay.action] ?? '#fff');
        trailRef.current.setAttribute('stroke-width', isBigAction ? '0.9' : '0.4');
        trailRef.current.setAttribute('opacity', isBigAction ? '0.7' : '0.4');
        trailRef.current.setAttribute('stroke-dasharray', isBigAction ? '0' : '1.5,1');
      } else if (trailRef.current) {
        trailRef.current.setAttribute('opacity', '0');
      }

      // Capture final player positions for continuity with next minute
      if (simRef.current.isDone()) {
        const positions = simRef.current.getPlayerPositions();
        const homeCount = playersForMinute.home.length;
        lastPlayerPositionsRef.current = {
          home: positions.slice(0, homeCount).map(p => ({ ...p })),
          away: positions.slice(homeCount).map(p => ({ ...p })),
        };
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      // Fallback: capture positions if sim hasn't finished but minute changed
      if (simRef.current && !simRef.current.isDone()) {
        const positions = simRef.current.getPlayerPositions();
        const homeCount = playersForMinute.home.length;
        lastPlayerPositionsRef.current = {
          home: positions.slice(0, homeCount).map(p => ({ ...p })),
          away: positions.slice(homeCount).map(p => ({ ...p })),
        };
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [minute, playersForMinute, minuteEvent]);

  const currentPlay = useMemo(() => simRef.current?.getCurrentPlay() ?? null, [tick]);
  const ballHolderId = currentPlay?.toPlayerId ?? currentPlay?.fromPlayerId ?? null;
  const playLog = useMemo(() => simRef.current?.getEventLog() ?? [], [tick]);

  const homeColor = homeTeam.colors.primary;
  const awayColor = awayTeam.colors.primary;
  const homeSecondary = homeTeam.colors.secondary;
  const awaySecondary = awayTeam.colors.secondary;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      {/* Pitch SVG */}
      <div className="relative">
        <svg viewBox="0 0 100 64" className="w-full h-80" role="img" aria-label="Campo de futebol animado">
          {/* Pitch background with stripes */}
          <defs>
            <pattern id="stripes" x="0" y="0" width="10" height="64" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="5" height="64" fill="#15803d" />
              <rect x="5" y="0" width="5" height="64" fill="#166534" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="64" fill="url(#stripes)" />

          {/* Pitch markings */}
          <rect x="0.5" y="0.5" width="99" height="63" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          <line x1="50" y1="0" x2="50" y2="64" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          <circle cx="50" cy="32" r="8" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          <circle cx="50" cy="32" r="0.5" fill="#ffffff" opacity="0.6" />

          {/* Penalty areas */}
          <rect x="0" y="14" width="14" height="36" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          <rect x="86" y="14" width="14" height="36" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          {/* Goal areas */}
          <rect x="0" y="22" width="5" height="20" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          <rect x="95" y="22" width="5" height="20" fill="none" stroke="#ffffff" strokeWidth="0.3" opacity="0.6" />
          {/* Goals */}
          <rect x="-0.5" y="29" width="1" height="6" fill="#ffffff" opacity="0.4" />
          <rect x="99.5" y="29" width="1" height="6" fill="#ffffff" opacity="0.4" />

          {/* Action trail line — positions updated by rAF; color/style by game loop */}
          <line
            ref={el => { if (el) trailRef.current = el; }}
            stroke="#fff"
            strokeWidth="0.4"
            opacity="0.4"
            strokeDasharray="1.5,1"
          />

          {/* Players — cx/cy/rotation updated by the fixed-timestep rAF loop */}
          {allPlayers.map(p => {
            const isHome = p.teamId === homeTeam.id;
            const color = isHome ? homeColor : awayColor;
            const secondary = isHome ? homeSecondary : awaySecondary;
            const isKeeper = p.position === 'GOL';
            const isBallHolder = p.playerId === ballHolderId;
            const radius = isKeeper ? 2.8 : 2.3;

            return (
              <g key={p.playerId}>
                {/* Player dot */}
                <circle
                  ref={el => {
                    if (el) {
                      if (!playerRefs.current[p.playerId]) playerRefs.current[p.playerId] = { dot: null, outline: null, dir: null, label: null };
                      playerRefs.current[p.playerId]!.dot = el;
                    }
                  }}
                  fill={color}
                  r={radius}
                  stroke={isBallHolder ? '#facc15' : secondary}
                  strokeWidth={isBallHolder ? 0.6 : 0.3}
                />
                {/* Shirt number */}
                <text
                  ref={el => {
                    if (el) {
                      if (!playerRefs.current[p.playerId]) playerRefs.current[p.playerId] = { dot: null, outline: null, dir: null, label: null };
                      playerRefs.current[p.playerId]!.label = el;
                    }
                  }}
                  x={p.baseCoord.x}
                  y={(p.baseCoord.y * 0.64) + 0.7}
                  fill="#ffffff"
                  fontSize="2.0"
                  fontWeight="bold"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {p.shirtNumber}
                </text>
                {/* Keeper outline */}
                {isKeeper && (
                  <circle
                    ref={el => {
                      if (el && playerRefs.current[p.playerId]) {
                        playerRefs.current[p.playerId]!.outline = el;
                      }
                    }}
                    r={radius + 0.4}
                    fill="none"
                    stroke={secondary}
                    strokeWidth="0.3"
                    strokeDasharray="0.8,0.4"
                  />
                )}
                {/* Direction indicator */}
                <line
                  ref={el => {
                    if (el && playerRefs.current[p.playerId]) {
                      playerRefs.current[p.playerId]!.dir = el;
                    }
                  }}
                  stroke={secondary}
                  strokeWidth="0.3"
                  opacity="0.7"
                />
              </g>
            );
          })}

          {/* Referee — follows play with delay */}
          <circle
            ref={el => { if (el) refereeRef.current = el; }}
            r="1.8"
            fill="#1e293b"
            stroke="#ffffff"
            strokeWidth="0.3"
            opacity="0.7"
          />

          {/* Linesman 1 — left sideline */}
          <circle
            ref={el => { if (el) linesman1Ref.current = el; }}
            r="1.3"
            fill="#facc15"
            stroke="#1e293b"
            strokeWidth="0.2"
            opacity="0.6"
          />

          {/* Linesman 2 — right sideline */}
          <circle
            ref={el => { if (el) linesman2Ref.current = el; }}
            r="1.3"
            fill="#facc15"
            stroke="#1e293b"
            strokeWidth="0.2"
            opacity="0.6"
          />

          {/* Ball — position/radius updated by rAF */}
          <circle
            ref={el => { if (el) ballRef.current = el; }}
            fill="#ffffff"
            stroke="#1e293b"
            strokeWidth="0.2"
          />

          {/* Goal flash ring */}
          <circle
            ref={el => { if (el) goalFlashRef.current = el; }}
            fill="none"
            stroke="#22c55e"
            strokeWidth="0.4"
            opacity="0"
          />

          {/* Ball shadow */}
          <ellipse
            ref={el => { if (el) shadowRef.current = el; }}
            fill="#000"
            opacity="0.2"
          />

          {/* Save highlight on keeper */}
          <circle
            ref={el => { if (el) saveFlashRef.current = el; }}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="0.5"
            opacity="0"
          />

          {/* Team labels */}
          <text x="3" y="5" fill={homeColor} fontSize="2.5" fontWeight="bold">{homeTeam.shortName}</text>
          <text x="97" y="5" fill={awayColor} fontSize="2.5" fontWeight="bold" textAnchor="end">{awayTeam.shortName}</text>

          {/* Debug: posições táticas de referência */}
          {showTacticalZones && allPlayers.map(p => {
            const isHome = p.teamId === homeTeam.id;
            const color = isHome ? homeColor : awayColor;
            return (
              <g key={`zone-${p.playerId}`} opacity="0.35">
                <circle
                  cx={p.baseCoord.x}
                  cy={p.baseCoord.y * 0.64}
                  r={1.6}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.4"
                  strokeDasharray="1,1"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Action indicator */}
      {markerEvent && !currentPlay && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-600 text-white">
            {markerEvent.description}
          </span>
        </div>
      )}
      {currentPlay && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: ACTION_COLORS[currentPlay.action] ?? '#fff', color: '#1e293b' }}
          >
            {ACTION_LABELS[currentPlay.action] ?? currentPlay.action}
          </span>
        </div>
      )}

      {/* Play-by-play commentary */}
      <div className="mt-2 bg-gray-900/50 rounded-lg p-3 h-28 overflow-y-auto" role="log" aria-live="polite" aria-label="Narração jogada a jogada">
        {playLog.map((entry, i) => {
          const actionColor = ACTION_COLORS[entry.action] ?? '#fff';
          const isLatest = i === playLog.length - 1;
          return (
            <p
              key={i}
              className={`text-xs mb-1 ${isLatest ? 'text-white font-medium' : 'text-gray-500'}`}
              style={isLatest ? { borderLeft: `2px solid ${actionColor}`, paddingLeft: '6px' } : undefined}
            >
              {entry.desc}
            </p>
          );
        })}
      </div>
    </div>
  );
}
