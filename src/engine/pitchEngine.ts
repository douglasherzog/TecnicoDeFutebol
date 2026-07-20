import type { Formation, MatchEvent, Position, Team } from '../types';
import { getStartingLineup, getTeamTactics } from './squadEngine';
import { simulateMinute } from './tactical/minuteSimulator';

// Pitch coordinates: 0-100 on both axes, home attacks right (x increases), away attacks left
export interface PitchCoord {
  x: number;
  y: number;
}

export interface PlayerOnPitch {
  playerId: string;
  name: string;
  position: Position;
  teamId: string;
  baseCoord: PitchCoord;
  currentCoord: PitchCoord;
}

export type PlayAction =
  | 'pass'
  | 'long_pass'
  | 'cross'
  | 'carry'
  | 'dribble'
  | 'header'
  | 'tackle'
  | 'intercept'
  | 'shot'
  | 'save'
  | 'goal'
  | 'clearance'
  | 'throw_in'
  | 'corner'
  | 'build_up';

export interface PlayStep {
  action: PlayAction;
  fromPlayerId: string;
  toPlayerId: string | null;
  ballFrom: PitchCoord;
  ballTo: PitchCoord;
  playerFrom?: PitchCoord;
  playerTo?: PitchCoord;
  description: string;
  durationMs: number;
  minute?: number;
}

const FORMATION_COORDS: Record<Formation, PitchCoord[]> = {
  '4-3-3': [
    { x: 5, y: 50 },   // GOL
    { x: 20, y: 18 },  // LAT L
    { x: 16, y: 38 },  // ZAG L
    { x: 16, y: 62 },  // ZAG R
    { x: 20, y: 82 },  // LAT R
    { x: 35, y: 50 },  // VOL
    { x: 45, y: 30 },  // MEI L
    { x: 45, y: 70 },  // MEI R
    { x: 58, y: 22 },  // ATA L
    { x: 58, y: 50 },  // ATA C
    { x: 58, y: 78 },  // ATA R
  ],
  '4-4-2': [
    { x: 5, y: 50 },   // GOL
    { x: 20, y: 18 },  // LAT L
    { x: 16, y: 38 },  // ZAG L
    { x: 16, y: 62 },  // ZAG R
    { x: 20, y: 82 },  // LAT R
    { x: 35, y: 30 },  // VOL L
    { x: 35, y: 70 },  // VOL R
    { x: 48, y: 30 },  // MEI L
    { x: 48, y: 70 },  // MEI R
    { x: 58, y: 42 },  // ATA L
    { x: 58, y: 58 },  // ATA R
  ],
  '4-2-3-1': [
    { x: 5, y: 50 },   // GOL
    { x: 20, y: 18 },  // LAT L
    { x: 16, y: 38 },  // ZAG L
    { x: 16, y: 62 },  // ZAG R
    { x: 20, y: 82 },  // LAT R
    { x: 32, y: 35 },  // VOL L
    { x: 32, y: 65 },  // VOL R
    { x: 46, y: 25 },  // MEI L
    { x: 46, y: 50 },  // MEI C
    { x: 46, y: 75 },  // MEI R
    { x: 60, y: 50 },  // ATA
  ],
};

const FORMATION_POSITIONS: Record<Formation, Position[]> = {
  '4-3-3': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'],
  '4-4-2': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA'],
  '4-2-3-1': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'MEI', 'ATA'],
};

function mirrorCoord(coord: PitchCoord): PitchCoord {
  return { x: 100 - coord.x, y: 100 - coord.y };
}

function dist(a: PitchCoord, b: PitchCoord): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function jitter(coord: PitchCoord, amount: number): PitchCoord {
  return {
    x: clamp(coord.x + (Math.random() - 0.5) * amount, 2, 98),
    y: clamp(coord.y + (Math.random() - 0.5) * amount, 2, 98),
  };
}

// Duration proportional to distance
function durationForDistance(d: number, base: number, factor: number): number {
  return base + d * factor;
}

export function buildPlayers(homeTeam: Team, awayTeam: Team): { home: PlayerOnPitch[]; away: PlayerOnPitch[] } {
  const homeFormation = getTeamTactics(homeTeam).formation;
  const awayFormation = getTeamTactics(awayTeam).formation;

  const homeLineup = getStartingLineup(homeTeam);
  const awayLineup = getStartingLineup(awayTeam);

  const homeCoords = FORMATION_COORDS[homeFormation];
  const awayCoords = FORMATION_COORDS[awayFormation];

  const home = homeLineup.slice(0, 11).map((player, i): PlayerOnPitch => ({
    playerId: player.id,
    name: player.name,
    position: FORMATION_POSITIONS[homeFormation][i] ?? player.position,
    teamId: homeTeam.id,
    baseCoord: homeCoords[i] ?? { x: 30, y: 50 },
    currentCoord: homeCoords[i] ?? { x: 30, y: 50 },
  }));

  const away = awayLineup.slice(0, 11).map((player, i): PlayerOnPitch => {
    const base = mirrorCoord(awayCoords[i] ?? { x: 70, y: 50 });
    return {
      playerId: player.id,
      name: player.name,
      position: FORMATION_POSITIONS[awayFormation][i] ?? player.position,
      teamId: awayTeam.id,
      baseCoord: base,
      currentCoord: base,
    };
  });

  return { home, away };
}

const PASS_VERBS = [
  'toca para', 'passa para', 'joga para', 'encontra', 'serve',
  'rola para', 'distribui para', 'acerta',
];

const LONG_PASS_VERBS = [
  'lança longo para', 'faz um lançamento para', 'envia bola longa para',
  'alça a bola para',
];

const CROSS_VERBS = [
  'cruza para', 'faz o cruzamento para', 'centra para', 'envia o cruzamento para',
];

const DRIBBLE_VERBS = [
  'dribla e avança', 'ganha da marcação e avança', 'faz a tabela e avança',
  'toca de primeira e avança', 'faz a jogada individual',
];

const CARRY_VERBS = [
  'conduz a bola', 'avança com a bola', 'progride com a bola', 'leva a bola adiantada',
];

const HEADER_VERBS = [
  'ganha no cabeceio', 'desvia de cabeça', 'cabeceia para', 'ganha o jogo aéreo',
];

const TACKLE_VERBS = [
  'entra duro e rouba a bola', 'faz o carrinho e recupera', 'desarma com o carrinho',
  'antecipa e rouba a bola',
];

const INTERCEPT_VERBS = [
  'intercepta a jogada', 'corta o passe', 'recupera a bola', 'desarma o adversário',
];

const CLEARANCE_VERBS = [
  'afasta a bola', 'faz o corte', 'chuta para longe', 'salva a jogada',
];

const THROW_IN_VERBS = [
  'cobra o lateral para', 'arremessa para', 'lateral para',
];

const CORNER_VERBS = [
  'cobre o escanteio para', 'alça o escanteio para', 'bate o corner para',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getKeeper(players: PlayerOnPitch[]): PlayerOnPitch {
  return players.find(p => p.position === 'GOL') ?? players[0];
}

function adjustForApproach(coord: PitchCoord, approach: string, isHome: boolean): PitchCoord {
  const shift = approach === 'attacking' ? 8 : approach === 'defensive' ? -6 : 0;
  const x = isHome ? coord.x + shift : coord.x - shift;
  return { x: clamp(x, 2, 98), y: coord.y };
}

// Pick a teammate within maxDist, preferring players ahead in attack direction
function pickNearbyTeammate(
  players: PlayerOnPitch[],
  fromPos: PitchCoord,
  attackDir: number,
  maxDist: number,
  excludeId?: string,
  preferForward = false,
): PlayerOnPitch | null {
  const candidates = players.filter(p => {
    if (p.playerId === excludeId) return false;
    if (p.position === 'GOL') return false;
    const d = dist(p.currentCoord, fromPos);
    return d <= maxDist && d > 1;
  });

  if (candidates.length === 0) return null;

  const weights = candidates.map(p => {
    const d = dist(p.currentCoord, fromPos);
    const forwardness = (p.currentCoord.x - fromPos.x) * attackDir;
    return (1 / (d + 3)) * (1 + Math.max(0, forwardness) * (preferForward ? 0.25 : 0.08));
  });

  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Pick a defender near the ball for interceptions
function pickNearbyDefender(
  defenders: PlayerOnPitch[],
  ballPos: PitchCoord,
  maxDist: number,
): PlayerOnPitch | null {
  const nearby = defenders.filter(p => p.position !== 'GOL' && dist(p.currentCoord, ballPos) <= maxDist);
  if (nearby.length > 0) return pick(nearby);
  return null;
}

// Move all players toward the ball — aggressive shift so players actually cluster around the action
function shiftPlayersTowardBall(players: PlayerOnPitch[], ballPos: PitchCoord, intensity: number): void {
  for (const p of players) {
    if (p.position === 'GOL') {
      // Keeper stays near goal but shifts slightly toward ball y
      const keeperX = p.baseCoord.x < 10 ? 5 : 95;
      p.currentCoord = {
        x: keeperX,
        y: clamp(30 + (ballPos.y - 50) * 0.3, 25, 75),
      };
      continue;
    }
    // Field players move strongly toward the ball so passes stay short and realistic
    const factor = 0.7 * intensity;
    const dx = (ballPos.x - p.baseCoord.x) * factor;
    const dy = (ballPos.y - p.baseCoord.y) * factor;
    p.currentCoord = {
      x: clamp(p.baseCoord.x + dx, 1, 99),
      y: clamp(p.baseCoord.y + dy, 1, 99),
    };
  }
}

// Move the ball holder to exactly where the ball is going
function moveHolderTo(holder: PlayerOnPitch, targetPos: PitchCoord): PitchCoord {
  holder.currentCoord = { ...targetPos };
  return { ...targetPos };
}

// Resolve a match event into the final one or two PlaySteps (shot + result)
function resolveEvent(
  event: MatchEvent,
  shotPos: PitchCoord,
  shooter: PlayerOnPitch,
  keeper: PlayerOnPitch,
  defenders: PlayerOnPitch[],
  isHome: boolean,
  minute: number,
  steps: PlayStep[],
): void {
  const goalCoord: PitchCoord = isHome ? { x: 97, y: 50 } : { x: 3, y: 50 };

  switch (event.type) {
    case 'goal':
    case 'penalty_goal':
    case 'own_goal': {
      const actualShooter = event.type === 'own_goal'
        ? (pickNearbyDefender(defenders, goalCoord, 18) ?? shooter)
        : shooter;
      const shotFrom = event.type === 'own_goal' ? jitter(goalCoord, 8) : shotPos;
      steps.push({
        action: 'shot',
        fromPlayerId: actualShooter.playerId,
        toPlayerId: null,
        ballFrom: shotFrom,
        ballTo: goalCoord,
        description: `${actualShooter.name} finaliza para o gol!`,
        durationMs: durationForDistance(dist(shotFrom, goalCoord), 500, 25),
        minute,
      });
      steps.push({
        action: 'goal',
        fromPlayerId: actualShooter.playerId,
        toPlayerId: null,
        ballFrom: goalCoord,
        ballTo: goalCoord,
        description: event.description,
        durationMs: 1800,
        minute,
      });
      break;
    }
    case 'save': {
      steps.push({
        action: 'shot',
        fromPlayerId: shooter.playerId,
        toPlayerId: null,
        ballFrom: shotPos,
        ballTo: keeper.currentCoord,
        description: `${shooter.name} finaliza para o gol!`,
        durationMs: durationForDistance(dist(shotPos, keeper.currentCoord), 500, 25),
        minute,
      });
      steps.push({
        action: 'save',
        fromPlayerId: keeper.playerId,
        toPlayerId: null,
        ballFrom: keeper.currentCoord,
        ballTo: keeper.currentCoord,
        description: event.description,
        durationMs: 1200,
        minute,
      });
      break;
    }
    case 'miss':
    case 'penalty_miss': {
      const missCoord: PitchCoord = event.type === 'penalty_miss'
        ? { x: isHome ? 97 : 3, y: 20 + Math.random() * 60 }
        : { x: isHome ? 97 : 3, y: 28 + Math.random() * 44 };
      steps.push({
        action: 'shot',
        fromPlayerId: shooter.playerId,
        toPlayerId: null,
        ballFrom: shotPos,
        ballTo: missCoord,
        description: event.description,
        durationMs: durationForDistance(dist(shotPos, missCoord), 600, 30),
        minute,
      });
      break;
    }
    case 'foul':
    case 'card':
    case 'red_card': {
      const offender = pickNearbyDefender(defenders, shotPos, 12) ?? defenders[0];
      steps.push({
        action: 'tackle',
        fromPlayerId: offender.playerId,
        toPlayerId: shooter.playerId,
        ballFrom: shotPos,
        ballTo: shotPos,
        description: event.description,
        durationMs: 1400,
        minute,
      });
      break;
    }
    case 'injury': {
      steps.push({
        action: 'build_up',
        fromPlayerId: shooter.playerId,
        toPlayerId: shooter.playerId,
        ballFrom: shotPos,
        ballTo: shotPos,
        description: event.description,
        durationMs: 1800,
        minute,
      });
      break;
    }
    case 'sub': {
      steps.push({
        action: 'build_up',
        fromPlayerId: '',
        toPlayerId: '',
        ballFrom: shotPos,
        ballTo: shotPos,
        description: event.description,
        durationMs: 1200,
        minute,
      });
      break;
    }
  }
}

// Advance the ball toward targetPos using realistic short passes and carries
function advanceTo(
  activeTeam: PlayerOnPitch[],
  opponentTeam: PlayerOnPitch[],
  holder: PlayerOnPitch,
  pos: PitchCoord,
  targetPos: PitchCoord,
  attackDir: number,
  minute: number,
  maxSteps: number,
  steps: PlayStep[],
): { holder: PlayerOnPitch; pos: PitchCoord } {
  let currentHolder = holder;
  let currentPos = pos;

  for (let i = 0; i < maxSteps; i++) {
    if (dist(currentPos, targetPos) < 10) break;

    shiftPlayersTowardBall(activeTeam, currentPos, 1.2);
    shiftPlayersTowardBall(opponentTeam, currentPos, 0.7);

    const towardX = Math.sign(targetPos.x - currentPos.x) || attackDir;
    const towardY = targetPos.y - currentPos.y;
    const roll = Math.random();

    let action: PlayAction;
    let target: PlayerOnPitch | null;
    let description: string;
    let ballTo: PitchCoord;
    let durationMs: number;
    let playerFrom: PitchCoord | undefined;
    let playerTo: PitchCoord | undefined;

    if (roll < 0.45) {
      target = pickNearbyTeammate(activeTeam, currentPos, towardX, 16, currentHolder.playerId, true);
      if (target) {
        action = 'pass';
        ballTo = jitter(target.currentCoord, 3);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(PASS_VERBS)} ${target.name}.`;
        durationMs = durationForDistance(dist(currentPos, ballTo), 500, 25);
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = Math.min(dist(currentPos, targetPos) * 0.4, 7);
        ballTo = {
          x: clamp(currentPos.x + towardX * carryDist, 3, 97),
          y: clamp(currentPos.y + towardY * 0.4 + (Math.random() - 0.5) * 6, 5, 95),
        };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.7) {
      target = currentHolder;
      action = 'carry';
      const carryDist = Math.min(dist(currentPos, targetPos) * 0.35, 6);
      ballTo = {
        x: clamp(currentPos.x + towardX * carryDist, 3, 97),
        y: clamp(currentPos.y + towardY * 0.35 + (Math.random() - 0.5) * 6, 5, 95),
      };
      playerFrom = { ...currentHolder.currentCoord };
      playerTo = moveHolderTo(currentHolder, ballTo);
      description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
      durationMs = durationForDistance(carryDist, 800, 60);
    } else if (roll < 0.8) {
      target = pickNearbyTeammate(activeTeam, currentPos, towardX, 26, currentHolder.playerId, true);
      if (target) {
        action = 'long_pass';
        ballTo = jitter(target.currentCoord, 5);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(LONG_PASS_VERBS)} ${target.name}.`;
        durationMs = durationForDistance(dist(currentPos, ballTo), 700, 30);
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = Math.min(dist(currentPos, targetPos) * 0.4, 7);
        ballTo = {
          x: clamp(currentPos.x + towardX * carryDist, 3, 97),
          y: clamp(currentPos.y + towardY * 0.4 + (Math.random() - 0.5) * 6, 5, 95),
        };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else {
      target = pickNearbyTeammate(activeTeam, currentPos, towardX, 14, currentHolder.playerId, true);
      if (target) {
        action = 'header';
        ballTo = jitter(target.currentCoord, 4);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(HEADER_VERBS)} ${target.name}.`;
        durationMs = 600;
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = Math.min(dist(currentPos, targetPos) * 0.4, 7);
        ballTo = {
          x: clamp(currentPos.x + towardX * carryDist, 3, 97),
          y: clamp(currentPos.y + towardY * 0.4 + (Math.random() - 0.5) * 6, 5, 95),
        };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    }

    steps.push({
      action,
      fromPlayerId: currentHolder.playerId,
      toPlayerId: target.playerId,
      ballFrom: currentPos,
      ballTo,
      playerFrom,
      playerTo,
      description,
      durationMs,
      minute,
    });

    currentPos = ballTo;
    currentHolder = target;
  }

  return { holder: currentHolder, pos: currentPos };
}

export function generatePlaySequence(
  attackingTeam: PlayerOnPitch[],
  defendingTeam: PlayerOnPitch[],
  approach: string,
  isHome: boolean,
  minute: number,
  matchEvent: MatchEvent | null,
  startBallPos?: PitchCoord | null,
): PlayStep[] {
  const steps: PlayStep[] = [];
  const attackDir = isHome ? 1 : -1;

  const attackers = attackingTeam.map(p => ({
    ...p,
    baseCoord: adjustForApproach(p.baseCoord, approach, isHome),
    currentCoord: adjustForApproach(p.baseCoord, approach, isHome),
  }));
  const defenders = defendingTeam.map(p => ({ ...p, currentCoord: { ...p.currentCoord } }));

  let currentHolder: PlayerOnPitch;
  let currentPos: PitchCoord;

  if (startBallPos) {
    const nearestAttacker = attackers.reduce((closest, p) =>
      dist(p.currentCoord, startBallPos) < dist(closest.currentCoord, startBallPos) ? p : closest,
    );
    const nearestDefender = defenders.reduce((closest, p) =>
      dist(p.currentCoord, startBallPos) < dist(closest.currentCoord, startBallPos) ? p : closest,
    );
    if (dist(nearestDefender.currentCoord, startBallPos) < dist(nearestAttacker.currentCoord, startBallPos) - 5 && Math.random() < 0.5) {
      currentHolder = nearestDefender;
      currentPos = { ...startBallPos };
    } else {
      currentHolder = nearestAttacker;
      currentPos = { ...startBallPos };
    }
  } else {
    currentHolder = approach === 'defensive'
      ? attackers.find(p => p.position === 'ZAG' || p.position === 'VOL') ?? attackers[1]
      : getKeeper(attackers);
    currentPos = { ...currentHolder.currentCoord };
  }

  shiftPlayersTowardBall(attackers, currentPos, 1);
  shiftPlayersTowardBall(defenders, currentPos, 0.7);

  let possessionTeam: 'attack' | 'defense' = 'attack';
  if (startBallPos && defenders.some(p => p.playerId === currentHolder.playerId)) {
    possessionTeam = 'defense';
  }

  // Match event: build up toward the event location and resolve it visibly
  if (matchEvent) {
    const keeper = getKeeper(defenders);
    const goalCoord: PitchCoord = isHome ? { x: 97, y: 50 } : { x: 3, y: 50 };
    let targetPos = currentPos;

    if (['goal', 'save', 'miss'].includes(matchEvent.type)) {
      targetPos = { x: isHome ? 78 + Math.random() * 10 : 22 - Math.random() * 10, y: 35 + Math.random() * 30 };
    } else if (['penalty_goal', 'penalty_miss'].includes(matchEvent.type)) {
      targetPos = { x: isHome ? 88 : 12, y: 50 };
    }

    if (matchEvent.type !== 'own_goal' && dist(currentPos, targetPos) > 10) {
      const build = advanceTo(
        possessionTeam === 'attack' ? attackers : defenders,
        possessionTeam === 'attack' ? defenders : attackers,
        currentHolder,
        currentPos,
        targetPos,
        attackDir,
        minute,
        5,
        steps,
      );
      currentHolder = build.holder;
      currentPos = build.pos;
    }

    const shooter = matchEvent.type === 'own_goal'
      ? (pickNearbyDefender(defenders, goalCoord, 18) ?? currentHolder)
      : currentHolder;
    resolveEvent(matchEvent, currentPos, shooter, keeper, defenders, isHome, minute, steps);
    return steps;
  }

  // Ambient play: 4-7 short, realistic actions
  const numActions = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numActions; i++) {
    const activeTeam = possessionTeam === 'attack' ? attackers : defenders;
    const opponentTeam = possessionTeam === 'attack' ? defenders : attackers;
    const activeDir = possessionTeam === 'attack' ? attackDir : -attackDir;

    shiftPlayersTowardBall(activeTeam, currentPos, 1.2);
    shiftPlayersTowardBall(opponentTeam, currentPos, 0.7);

    const ballProgress = activeDir === 1
      ? clamp((currentPos.x - 5) / 90, 0, 1)
      : clamp((95 - currentPos.x) / 90, 0, 1);

    let action: PlayAction;
    let target: PlayerOnPitch | null;
    let description: string;
    let ballTo: PitchCoord;
    let durationMs: number;
    let playerFrom: PitchCoord | undefined;
    let playerTo: PitchCoord | undefined;

    const roll = Math.random();
    if (roll < 0.03) {
      target = pickNearbyDefender(opponentTeam, currentPos, 10);
      if (target) {
        action = 'tackle';
        ballTo = jitter(target.currentCoord, 3);
        description = `${target.name} ${pick(TACKLE_VERBS)}!`;
        durationMs = 700;
        possessionTeam = possessionTeam === 'attack' ? 'defense' : 'attack';
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.07) {
      target = pickNearbyDefender(opponentTeam, currentPos, 12);
      if (target) {
        action = 'intercept';
        ballTo = jitter(target.currentCoord, 4);
        description = `${target.name} ${pick(INTERCEPT_VERBS)}!`;
        durationMs = 600;
        possessionTeam = possessionTeam === 'attack' ? 'defense' : 'attack';
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.18) {
      target = currentHolder;
      action = 'carry';
      const carryDist = 4 + Math.random() * 6;
      ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
      playerFrom = { ...currentHolder.currentCoord };
      playerTo = moveHolderTo(currentHolder, ballTo);
      description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
      durationMs = durationForDistance(carryDist, 800, 60);
    } else if (roll < 0.28) {
      target = currentHolder;
      action = 'dribble';
      const dribbleDist = 4 + Math.random() * 6;
      ballTo = { x: clamp(currentPos.x + activeDir * dribbleDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 10, 5, 95) };
      playerFrom = { ...currentHolder.currentCoord };
      playerTo = moveHolderTo(currentHolder, ballTo);
      description = `${currentHolder.name} ${pick(DRIBBLE_VERBS)}.`;
      durationMs = durationForDistance(dribbleDist, 600, 40);
    } else if (roll < 0.38) {
      target = pickNearbyTeammate(activeTeam, currentPos, activeDir, 26, currentHolder.playerId, true);
      if (target) {
        action = 'long_pass';
        ballTo = jitter(target.currentCoord, 5);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(LONG_PASS_VERBS)} ${target.name}.`;
        durationMs = durationForDistance(dist(currentPos, ballTo), 700, 30);
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.45) {
      target = pickNearbyTeammate(activeTeam, currentPos, activeDir, 12, currentHolder.playerId, true);
      if (target) {
        action = 'header';
        ballTo = jitter(target.currentCoord, 4);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(HEADER_VERBS)} ${target.name}.`;
        durationMs = 600;
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.5 && (currentPos.y < 10 || currentPos.y > 90)) {
      target = pickNearbyTeammate(activeTeam, currentPos, activeDir, 12, currentHolder.playerId);
      if (target) {
        action = 'throw_in';
        ballTo = jitter(target.currentCoord, 3);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(THROW_IN_VERBS)} ${target.name}.`;
        durationMs = 900;
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.58 && ballProgress > 0.7) {
      target = pickNearbyTeammate(activeTeam, currentPos, activeDir, 20, currentHolder.playerId, true);
      if (target) {
        action = 'cross';
        ballTo = jitter(target.currentCoord, 4);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(CROSS_VERBS)} ${target.name}.`;
        durationMs = durationForDistance(dist(currentPos, ballTo), 800, 35);
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (roll < 0.65 && ballProgress > 0.75) {
      target = pickNearbyTeammate(activeTeam, currentPos, activeDir, 16, currentHolder.playerId, true);
      if (target) {
        action = 'corner';
        const cornerCoord: PitchCoord = isHome
          ? { x: 92, y: currentPos.y < 50 ? 12 : 88 }
          : { x: 8, y: currentPos.y < 50 ? 12 : 88 };
        ballTo = jitter(cornerCoord, 3);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(CORNER_VERBS)} ${target.name}.`;
        durationMs = 1000;
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
      steps.push({
        action,
        fromPlayerId: currentHolder.playerId,
        toPlayerId: target.playerId,
        ballFrom: currentPos,
        ballTo,
        playerFrom,
        playerTo,
        description,
        durationMs,
        minute,
      });
      currentPos = ballTo;
      currentHolder = target;
      const headerTarget = pickNearbyTeammate(activeTeam, currentPos, activeDir, 12, currentHolder.playerId, true);
      if (headerTarget) {
        const headerTo = jitter(headerTarget.currentCoord, 4);
        steps.push({
          action: 'header',
          fromPlayerId: currentHolder.playerId,
          toPlayerId: headerTarget.playerId,
          ballFrom: currentPos,
          ballTo: headerTo,
          playerFrom: { ...currentHolder.currentCoord },
          playerTo: moveHolderTo(headerTarget, headerTo),
          description: `${currentHolder.name} ${pick(HEADER_VERBS)} ${headerTarget.name}.`,
          durationMs: 700,
          minute,
        });
        currentPos = headerTo;
        currentHolder = headerTarget;
      }
      continue;
    } else if (roll < 0.72 && ballProgress > 0.75) {
      target = pickNearbyDefender(opponentTeam, currentPos, 10);
      if (target) {
        const defender = target;
        const clearCoord: PitchCoord = {
          x: clamp(currentPos.x - activeDir * (12 + Math.random() * 8), 5, 95),
          y: 20 + Math.random() * 60,
        };
        action = 'clearance';
        ballTo = clearCoord;
        description = `${defender.name} ${pick(CLEARANCE_VERBS)}.`;
        durationMs = durationForDistance(dist(currentPos, ballTo), 500, 25);
        steps.push({
          action,
          fromPlayerId: defender.playerId,
          toPlayerId: null,
          ballFrom: currentPos,
          ballTo,
          description,
          durationMs,
          minute,
        });
        currentPos = ballTo;
        possessionTeam = possessionTeam === 'attack' ? 'defense' : 'attack';
        continue;
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    } else if (i === numActions - 1 && ballProgress > 0.75) {
      target = currentHolder;
      action = 'shot';
      ballTo = { x: isHome ? 97 : 3, y: 28 + Math.random() * 44 };
      description = `${currentHolder.name} arrisca! Bola para fora.`;
      durationMs = durationForDistance(dist(currentPos, ballTo), 600, 30);
    } else {
      target = pickNearbyTeammate(activeTeam, currentPos, activeDir, 14, currentHolder.playerId, true);
      if (target) {
        action = 'pass';
        ballTo = jitter(target.currentCoord, 3);
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(target, ballTo);
        description = `${currentHolder.name} ${pick(PASS_VERBS)} ${target.name}.`;
        durationMs = durationForDistance(dist(currentPos, ballTo), 500, 25);
      } else {
        target = currentHolder;
        action = 'carry';
        const carryDist = 4 + Math.random() * 6;
        ballTo = { x: clamp(currentPos.x + activeDir * carryDist, 3, 97), y: clamp(currentPos.y + (Math.random() - 0.5) * 8, 5, 95) };
        playerFrom = { ...currentHolder.currentCoord };
        playerTo = moveHolderTo(currentHolder, ballTo);
        description = `${currentHolder.name} ${pick(CARRY_VERBS)}.`;
        durationMs = durationForDistance(carryDist, 800, 60);
      }
    }

    steps.push({
      action,
      fromPlayerId: currentHolder.playerId,
      toPlayerId: target.playerId,
      ballFrom: currentPos,
      ballTo,
      playerFrom,
      playerTo,
      description,
      durationMs,
      minute,
    });

    currentPos = ballTo;
    currentHolder = target;
  }

  return steps;
}

const MARKER_TYPES = new Set(['kickoff', 'halftime', 'fulltime']);

export function generateMinutePlays(
  minute: number,
  homePlayers: PlayerOnPitch[],
  awayPlayers: PlayerOnPitch[],
  homeTeam: Team,
  awayTeam: Team,
  homeApproach: string,
  awayApproach: string,
  events: MatchEvent[],
  startBallPos?: PitchCoord | null,
): PlayStep[] {
  const minuteEvents = events.filter(e => e.minute === minute);
  const markerEvents = minuteEvents.filter(e => MARKER_TYPES.has(e.type));
  const actionEvents = minuteEvents.filter(e => !MARKER_TYPES.has(e.type));
  const allSteps: PlayStep[] = [];
  let currentBallPos = startBallPos ?? null;

  for (const event of markerEvents) {
    allSteps.push({
      action: 'build_up',
      fromPlayerId: '',
      toPlayerId: '',
      ballFrom: { x: 50, y: 50 },
      ballTo: { x: 50, y: 50 },
      description: event.description,
      durationMs: 1200,
      minute,
    });
    if (event.type === 'kickoff') currentBallPos = { x: 50, y: 50 };
  }

  if (markerEvents.some(e => e.type === 'fulltime') || markerEvents.some(e => e.type === 'halftime')) {
    return allSteps;
  }

  for (const event of actionEvents) {
    const seqSteps = simulateMinute(
      minute,
      homePlayers,
      awayPlayers,
      homeTeam,
      awayTeam,
      homeApproach,
      awayApproach,
      event,
      currentBallPos,
    );
    allSteps.push(...seqSteps);
    if (seqSteps.length > 0) {
      currentBallPos = seqSteps[seqSteps.length - 1].ballTo;
    }
  }

  if (actionEvents.length === 0) {
    const seqSteps = simulateMinute(
      minute,
      homePlayers,
      awayPlayers,
      homeTeam,
      awayTeam,
      homeApproach,
      awayApproach,
      null,
      currentBallPos,
    );
    allSteps.push(...seqSteps);
  }

  return allSteps;
}
