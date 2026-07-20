import type { MatchEvent, Team } from '../../types';
import type { PitchCoord, PlayStep, PlayerOnPitch, PlayAction } from '../pitchEngine';
import * as I from '../interpolation';
import {
  chooseBestOption,
  computeKeeperTarget,
  computeTacticalTarget,
  defenderPressure,
  detectTeamPhase,
  enrichPlayers,
  moveTowards,
  resolveDuel,
  scoreOnBallDecision,
  transitionPlayerState,
} from './ai';
import type { TacticalPlayer, TacticalStyle, TeamState } from './types';
import { DEFAULT_TACTICAL_CONFIG, type TacticalConfig } from './types';
import { MetricsCollector, type SimulationMetrics } from './metrics';

const GOAL_HOME: PitchCoord = { x: 97, y: 50 };
const GOAL_AWAY: PitchCoord = { x: 3, y: 50 };

export function styleFromApproach(approach: string): TacticalStyle {
  const styles: Record<string, TacticalStyle> = {
    defensive: {
      name: 'defensive',
      attackingWidth: 0.4,
      pressing: 0.4,
      compactness: 0.8,
      riskTaking: 0.2,
      counterAttack: 0.5,
    },
    balanced: {
      name: 'balanced',
      attackingWidth: 0.6,
      pressing: 0.55,
      compactness: 0.6,
      riskTaking: 0.45,
      counterAttack: 0.55,
    },
    attacking: {
      name: 'attacking',
      attackingWidth: 0.85,
      pressing: 0.75,
      compactness: 0.45,
      riskTaking: 0.65,
      counterAttack: 0.7,
    },
    possession: {
      name: 'possession',
      attackingWidth: 0.7,
      pressing: 0.6,
      compactness: 0.6,
      riskTaking: 0.3,
      counterAttack: 0.4,
    },
    counter: {
      name: 'counter',
      attackingWidth: 0.5,
      pressing: 0.35,
      compactness: 0.7,
      riskTaking: 0.5,
      counterAttack: 0.95,
    },
  };
  return styles[approach] ?? styles.balanced;
}

function goalFor(isHome: boolean) {
  return isHome ? GOAL_HOME : GOAL_AWAY;
}

function actionDuration(action: PlayAction, distance: number): number {
  const base: Record<PlayAction, number> = {
    pass: 500,
    long_pass: 700,
    cross: 800,
    carry: 800,
    dribble: 600,
    header: 600,
    tackle: 500,
    intercept: 500,
    shot: 500,
    save: 1000,
    goal: 1500,
    clearance: 600,
    throw_in: 900,
    corner: 1000,
    build_up: 1000,
  };
  return base[action] + distance * 15;
}

function jitter(coord: PitchCoord, amount: number): PitchCoord {
  return {
    x: I.clamp(coord.x + (Math.random() - 0.5) * amount, 1, 99),
    y: I.clamp(coord.y + (Math.random() - 0.5) * amount, 1, 99),
  };
}

function findHolder(state: TeamState): TacticalPlayer | null {
  return state.players.find(p => p.state === 'carrying' || p.state === 'dribbling') ?? null;
}

function nearestOpponent(p: TacticalPlayer, opponents: TeamState): TacticalPlayer {
  return opponents.players.reduce((closest, o) =>
    I.distance(p.currentCoord, o.currentCoord) < I.distance(p.currentCoord, closest.currentCoord) ? o : closest,
  );
}

function chooseTackleOpponent(p: TacticalPlayer, opponents: TeamState): TacticalPlayer | null {
  const candidates = opponents.players.filter(
    o => o.state === 'carrying' || o.state === 'dribbling' || I.distance(o.currentCoord, p.currentCoord) < 6,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((closest, o) =>
    I.distance(p.currentCoord, o.currentCoord) < I.distance(p.currentCoord, closest.currentCoord) ? o : closest,
  );
}

function simulateOneTick(
  home: TeamState,
  away: TeamState,
  ball: PitchCoord,
  cfg: TacticalConfig,
): { ball: PitchCoord; event?: PlayStep } {
  const attackingTeam = home.hasPossession ? home : away;
  const defendingTeam = home.hasPossession ? away : home;

  // movimentação coletiva sem bola ------------------------------------------------
  function prepareTargets(team: TeamState, opponents: TeamState) {
    for (const p of team.players) {
      if (p.state === 'carrying' || p.state === 'dribbling') continue;
      p.targetPos = p.position === 'GOL'
        ? computeKeeperTarget(p, team, ball, team.isHome)
        : computeTacticalTarget(p, team, ball);
      p.state = transitionPlayerState(p, team, ball, nearestOpponent(p, opponents));
    }
  }
  prepareTargets(home, away);
  prepareTargets(away, home);

  // Coesão de linhas: limita o afastamento entre defesa, meio e ataque
  function cohesiveLines(team: TeamState) {
    const order = ['GOL', 'ZAG', 'VOL', 'MEI', 'ATA'] as const;
    const avgX: Record<string, number> = {};
    for (const pos of order) {
      const group = team.players.filter(p => p.position === pos);
      if (group.length === 0) continue;
      avgX[pos] = group.reduce((s, p) => s + p.targetPos.x, 0) / group.length;
    }

    for (const p of team.players) {
      const idx = order.indexOf(p.position as typeof order[number]);
      if (idx < 0) continue;
      const prevPos = order[idx - 1];
      const nextPos = order[idx + 1];
      const prevX = prevPos ? avgX[prevPos] : undefined;
      const nextX = nextPos ? avgX[nextPos] : undefined;

      let minX = prevX !== undefined ? prevX + cfg.lineSpacing * 0.8 : 1;
      let maxX = nextX !== undefined ? nextX - cfg.lineSpacing * 0.8 : 99;

      // Goleiro não pode ficar na frente de zagueiros; atacantes não podem ficar atrás do meio
      if (p.position === 'GOL') { minX = 1; maxX = (prevX ?? avgX['ZAG'] ?? 15) + 8; }
      if (p.position === 'ATA') { minX = (nextX ?? avgX['MEI'] ?? 75) - 10; maxX = 99; }

      if (minX > maxX) { const mid = (minX + maxX) / 2; minX = mid; maxX = mid; }
      p.targetPos.x = I.clamp(p.targetPos.x, minX, maxX);
    }
  }
  cohesiveLines(home);
  cohesiveLines(away);

  // aplica movimento com os alvos coesos
  for (const p of home.players) {
    if (p.state !== 'carrying' && p.state !== 'dribbling') moveTowards(p, p.targetPos, cfg.moveSpeed);
  }
  for (const p of away.players) {
    if (p.state !== 'carrying' && p.state !== 'dribbling') moveTowards(p, p.targetPos, cfg.moveSpeed);
  }

  // limita quantos jogadores de cada time podem ativamente ir para a bola (após transições)
  const ballChasers = (team: TeamState, max = 2) => {
    const sorted = team.players
      .filter(p => p.position !== 'GOL' && p.state !== 'carrying' && p.state !== 'dribbling')
      .sort((a, b) => I.distance(a.currentCoord, ball) - I.distance(b.currentCoord, ball));
    const allowed = new Set(sorted.slice(0, max).map(p => p.playerId));
    for (const p of team.players) {
      if (!allowed.has(p.playerId) && (p.state === 'pressing' || p.state === 'ball_seeking')) {
        p.state = 'positioning';
      }
    }
  };
  ballChasers(home);
  ballChasers(away);

  // repulsão simples para evitar empilhamento
  function separate(team: TeamState, others: TeamState) {
    const all = [...team.players, ...others.players];
    const minDist = 4.0;
    const push = 1.2;
    for (const a of all) {
      for (const b of all) {
        if (a.playerId >= b.playerId) continue;
        const dx = a.currentCoord.x - b.currentCoord.x;
        const dy = a.currentCoord.y - b.currentCoord.y;
        const dist = I.distance(a.currentCoord, b.currentCoord);
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const force = (minDist - dist) * push;
          a.currentCoord.x = I.clamp(a.currentCoord.x + nx * force, 1, 99);
          a.currentCoord.y = I.clamp(a.currentCoord.y + ny * force, 1, 99);
          b.currentCoord.x = I.clamp(b.currentCoord.x - nx * force, 1, 99);
          b.currentCoord.y = I.clamp(b.currentCoord.y - ny * force, 1, 99);
        }
      }
    }
  }
  separate(home, away);

  let result: { ball: PitchCoord; event?: PlayStep } = { ball };

  // quem está com a bola decide
  const holder = findHolder(attackingTeam);
  if (holder && holder.cooldown <= 0) {
    const teammates = attackingTeam.players.filter(p => p.playerId !== holder.playerId);
    const opponents = defendingTeam.players;

    const options = scoreOnBallDecision(
      holder,
      teammates,
      opponents,
      goalFor(attackingTeam.isHome),
      attackingTeam.isHome,
      attackingTeam.style,
      cfg,
    );
    const decision = chooseBestOption(options);

    if (decision.action === 'shot') {
      const from = { ...holder.currentCoord };
      const keeper = defendingTeam.players.find(p => p.position === 'GOL') ?? opponents[0];
      const distToGoal = I.distance(from, goalFor(attackingTeam.isHome));
      const inShootingZone = (attackingTeam.isHome ? from.x > 70 : from.x < 30) && distToGoal <= cfg.shootingDistance + 4;

      // Chute longo ou fora de posição é drasticamente menos efetivo
      const distancePenalty = Math.max(0, distToGoal - 18) * 1.8;
      const pressure = defenderPressure(from, opponents);
      let shotQuality =
        holder.attributes.technique * 0.5 +
        holder.attributes.composure * 0.3 +
        (100 - pressure) * 0.2 -
        distancePenalty;

      const saveQuality = keeper.attributes.technique + keeper.attributes.composure;
      const scored = shotQuality - saveQuality + Math.random() * 25 > 90;

      if (scored && inShootingZone) {
        result = { ball: goalFor(attackingTeam.isHome) };
        result.event = {
          action: 'goal',
          fromPlayerId: holder.playerId,
          toPlayerId: null,
          ballFrom: from,
          ballTo: goalFor(attackingTeam.isHome),
          description: `GOL! ${holder.name} marcou!`,
          durationMs: actionDuration('goal', I.distance(from, goalFor(attackingTeam.isHome))),
        };
      } else {
        const missTo = { x: attackingTeam.isHome ? 97 : 3, y: 28 + Math.random() * 44 };
        result = { ball: missTo };
        result.event = {
          action: 'shot',
          fromPlayerId: holder.playerId,
          toPlayerId: null,
          ballFrom: from,
          ballTo: missTo,
          description: `${holder.name} chutou, mas a bola foi para fora.`,
          durationMs: actionDuration('shot', I.distance(from, missTo)),
        };
      }
      holder.state = 'positioning';
      attackingTeam.hasPossession = false;
      defendingTeam.hasPossession = true;
      holder.cooldown = 6;
    } else if (decision.action === 'pass' || decision.action === 'long_pass' || decision.action === 'cross') {
      const target = attackingTeam.players.find(p => p.playerId === decision.targetId)!;
      const from = { ...holder.currentCoord };
      const to = jitter(decision.ballTo, 3);
      const dist = I.distance(from, to);
      const targetPressure = defenderPressure(target.currentCoord, opponents);
      const obstructed = opponents.filter(o => I.distanceToSegment(o.currentCoord, from, to) < 4).length;

      // Passe curto e seguro tem alta chance de sucesso; lançamento longo ou interceptado é arriscado
      const isLong = dist > cfg.idealPassMax;
      const baseQuality =
        holder.attributes.passing * 0.6 +
        holder.attributes.vision * 0.2 -
        targetPressure * 1.8 -
        obstructed * 8 -
        (isLong ? (dist - cfg.idealPassMax) * 0.9 : 0) +
        Math.random() * 15;

      // Times diretistas cometem menos erros em longos, mas ainda correm risco
      const riskTolerance = attackingTeam.style.riskTaking * 15;
      const intercepted = baseQuality + riskTolerance < 38;

      if (intercepted) {
        const interceptor = nearestOpponent(target, defendingTeam);
        result = { ball: to };
        result.event = {
          action: 'intercept',
          fromPlayerId: interceptor.playerId,
          toPlayerId: null,
          ballFrom: from,
          ballTo: to,
          description: `${interceptor.name} interceptou!`,
          durationMs: actionDuration('intercept', I.distance(from, to)),
        };
        attackingTeam.hasPossession = false;
        defendingTeam.hasPossession = true;
      } else {
        result = { ball: to };
        result.event = {
          action: decision.action,
          fromPlayerId: holder.playerId,
          toPlayerId: target.playerId,
          ballFrom: from,
          ballTo: to,
          playerFrom: { ...from },
          playerTo: { ...to },
          description: decision.description,
          durationMs: actionDuration(decision.action, I.distance(from, to)),
        };
        target.state = 'carrying';
        holder.state = 'positioning';
        target.cooldown = 5;
      }
      holder.cooldown = 5;
    } else if (decision.action === 'carry' || decision.action === 'dribble') {
      const from = { ...holder.currentCoord };
      const to = jitter(decision.ballTo, 2);
      holder.currentCoord = { ...to };
      result = { ball: { ...to } };
      result.event = {
        action: decision.action,
        fromPlayerId: holder.playerId,
        toPlayerId: null,
        ballFrom: from,
        ballTo: to,
        playerFrom: { ...from },
        playerTo: { ...to },
        description: decision.description,
        durationMs: actionDuration(decision.action, I.distance(from, to)),
      };
      holder.cooldown = 2;
    } else if (decision.action === 'clearance') {
      // Chutão defensivo: a bola vai longe e geralmente muda de posse
      const from = { ...holder.currentCoord };
      const to = jitter(decision.ballTo, 5);
      result = { ball: to };
      result.event = {
        action: 'clearance',
        fromPlayerId: holder.playerId,
        toPlayerId: null,
        ballFrom: from,
        ballTo: to,
        description: decision.description,
        durationMs: actionDuration('clearance', I.distance(from, to)),
      };
      holder.state = 'positioning';
      // chutão entrega a posse ao adversário na maioria das vezes
      if (Math.random() < 0.7) {
        attackingTeam.hasPossession = false;
        defendingTeam.hasPossession = true;
      }
      holder.cooldown = 6;
    }
  } else if (holder) {
    holder.cooldown--;
  }

  // pressão / desarme dos defensores
  if (!attackingTeam.hasPossession) {
    // a posse foi perdida durante o tick; ajustar
  } else {
    for (const d of defendingTeam.players) {
      if (d.cooldown > 0) { d.cooldown--; continue; }
      const target = chooseTackleOpponent(d, attackingTeam);
      if (!target) continue;
      if (I.distance(d.currentCoord, target.currentCoord) > 4) {
        moveTowards(d, target.currentCoord, cfg.moveSpeed * 1.2);
        continue;
      }
      const duel = resolveDuel(d, target, 1.4);
      if (duel.winner === d) {
        result = { ball: { ...d.currentCoord } };
        result.event = {
          action: 'tackle',
          fromPlayerId: d.playerId,
          toPlayerId: target.playerId,
          ballFrom: target.currentCoord,
          ballTo: d.currentCoord,
          description: `${d.name} desarmou ${target.name}!`,
          durationMs: actionDuration('tackle', 3),
        };
        target.state = 'positioning';
        d.state = 'carrying';
        d.cooldown = 6;
        attackingTeam.hasPossession = false;
        defendingTeam.hasPossession = true;
        break;
      }
    }
  }

  home.phase = detectTeamPhase(home.hasPossession, home.phase, result.ball.x, home.isHome);
  away.phase = detectTeamPhase(away.hasPossession, away.phase, result.ball.x, away.isHome);

  return result;
}

export function simulateMinute(
  minute: number,
  homePlayers: PlayerOnPitch[],
  awayPlayers: PlayerOnPitch[],
  _homeTeam: Team,
  _awayTeam: Team,
  homeApproach: string,
  awayApproach: string,
  matchEvent: MatchEvent | null,
  startBallPos?: PitchCoord | null,
  cfg: TacticalConfig = DEFAULT_TACTICAL_CONFIG,
): PlayStep[] {
  const home: TeamState = {
    players: enrichPlayers(homePlayers),
    isHome: true,
    style: styleFromApproach(homeApproach),
    phase: 'attacking_organized',
    hasPossession: true,
    lastPhase: 'attacking_organized',
    goals: 0,
  };
  const away: TeamState = {
    players: enrichPlayers(awayPlayers),
    isHome: false,
    style: styleFromApproach(awayApproach),
    phase: 'defending_organized',
    hasPossession: false,
    lastPhase: 'defending_organized',
    goals: 0,
  };

  const ball: PitchCoord = startBallPos ?? { x: 50, y: 50 };

  // decide posse inicial com base na proximidade com a bola
  const nearestHome = home.players.reduce((c, p) => (I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c));
  const nearestAway = away.players.reduce((c, p) => (I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c));
  const homeCloser = I.distance(nearestHome.currentCoord, ball) <= I.distance(nearestAway.currentCoord, ball);
  home.hasPossession = homeCloser;
  away.hasPossession = !homeCloser;

  const holder = homeCloser ? nearestHome : nearestAway;
  holder.state = 'carrying';

  const steps: PlayStep[] = [];

  // se houver evento especial, forçar construção até a área e resolver o evento
  if (matchEvent && ['goal', 'save', 'miss', 'penalty_goal', 'penalty_miss', 'own_goal'].includes(matchEvent.type)) {
    const attacker = matchEvent.teamId === _homeTeam.id ? home : away;
    const defender = matchEvent.teamId === _homeTeam.id ? away : home;
    const goal = goalFor(attacker.isHome);
    const shooter = attacker.players.reduce((c, p) =>
      I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c,
    );

    // mover uma sequência de ticks para construir a jogada
    for (let i = 0; i < 3; i++) {
      const tick = simulateOneTick(home, away, ball, cfg);
      if (tick.event) steps.push({ ...tick.event, minute });
    }

    const shotFrom = { ...shooter.currentCoord };
    const shotTo = jitter(goal, 4);
    steps.push({
      action: 'shot',
      fromPlayerId: shooter.playerId,
      toPlayerId: null,
      ballFrom: shotFrom,
      ballTo: shotTo,
      description: `${shooter.name} finaliza para o gol!`,
      durationMs: actionDuration('shot', I.distance(shotFrom, shotTo)),
      minute,
    });

    if (matchEvent.type === 'goal' || matchEvent.type === 'penalty_goal') {
      steps.push({
        action: 'goal',
        fromPlayerId: shooter.playerId,
        toPlayerId: null,
        ballFrom: shotTo,
        ballTo: shotTo,
        description: matchEvent.description,
        durationMs: 1800,
        minute,
      });
    } else if (matchEvent.type === 'save') {
      const keeper = defender.players.find(p => p.position === 'GOL') ?? defender.players[0];
      steps.push({
        action: 'save',
        fromPlayerId: keeper.playerId,
        toPlayerId: null,
        ballFrom: shotTo,
        ballTo: shotTo,
        description: matchEvent.description,
        durationMs: 1200,
        minute,
      });
    } else if (matchEvent.type === 'miss' || matchEvent.type === 'penalty_miss') {
      steps.push({
        action: 'shot',
        fromPlayerId: shooter.playerId,
        toPlayerId: null,
        ballFrom: shotFrom,
        ballTo: shotTo,
        description: matchEvent.description,
        durationMs: actionDuration('shot', I.distance(shotFrom, shotTo)),
        minute,
      });
    } else if (matchEvent.type === 'own_goal') {
      const own = defender.players.find(p => p.position === 'GOL') ?? defender.players[0];
      steps.push({
        action: 'goal',
        fromPlayerId: own.playerId,
        toPlayerId: null,
        ballFrom: own.currentCoord,
        ballTo: goalFor(attacker.isHome),
        description: matchEvent.description,
        durationMs: 1800,
        minute,
      });
    }
    return steps;
  }

  // simulação normal de um minuto
  for (let tick = 0; tick < cfg.ticksPerMinute; tick++) {
    const res = simulateOneTick(home, away, ball, cfg);
    if (res.event) {
      steps.push({ ...res.event, minute });
    }
    ball.x = res.ball.x;
    ball.y = res.ball.y;
  }

  // se nada aconteceu, adicionar ao menos uma ação de construção para o campo não ficar parado
  if (steps.length === 0) {
    steps.push({
      action: 'build_up',
      fromPlayerId: '',
      toPlayerId: '',
      ballFrom: { ...ball },
      ballTo: { ...ball },
      description: 'Jogo parado no setor defensivo.',
      durationMs: 1000,
      minute,
    });
  }

  // limita passos para não sobrecarregar a animação (10 por minuto é bastante)
  return steps.slice(0, 12);
}

export function simulateMinuteWithMetrics(
  minute: number,
  homePlayers: PlayerOnPitch[],
  awayPlayers: PlayerOnPitch[],
  homeTeam: Team,
  _awayTeam: Team,
  homeApproach: string,
  awayApproach: string,
  matchEvent: MatchEvent | null,
  startBallPos?: PitchCoord | null,
  cfg: TacticalConfig = DEFAULT_TACTICAL_CONFIG,
): { steps: PlayStep[]; metrics: SimulationMetrics } {
  const collector = new MetricsCollector();

  const home: TeamState = {
    players: enrichPlayers(homePlayers),
    isHome: true,
    style: styleFromApproach(homeApproach),
    phase: 'attacking_organized',
    hasPossession: true,
    lastPhase: 'attacking_organized',
    goals: 0,
  };
  const away: TeamState = {
    players: enrichPlayers(awayPlayers),
    isHome: false,
    style: styleFromApproach(awayApproach),
    phase: 'defending_organized',
    hasPossession: false,
    lastPhase: 'defending_organized',
    goals: 0,
  };

  const ball: PitchCoord = startBallPos ?? { x: 50, y: 50 };

  const nearestHome = home.players.reduce((c, p) => (I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c));
  const nearestAway = away.players.reduce((c, p) => (I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c));
  const homeCloser = I.distance(nearestHome.currentCoord, ball) <= I.distance(nearestAway.currentCoord, ball);
  home.hasPossession = homeCloser;
  away.hasPossession = !homeCloser;

  const holder = homeCloser ? nearestHome : nearestAway;
  holder.state = 'carrying';
  collector.recordPossessionChange(homeCloser ? 'home' : 'away');

  const steps: PlayStep[] = [];

  if (matchEvent && ['goal', 'save', 'miss', 'penalty_goal', 'penalty_miss', 'own_goal'].includes(matchEvent.type)) {
    const attacker = matchEvent.teamId === homeTeam.id ? home : away;
    const defender = matchEvent.teamId === homeTeam.id ? away : home;
    const goal = goalFor(attacker.isHome);
    const shooter = attacker.players.reduce((c, p) =>
      I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c,
    );

    for (let i = 0; i < 3; i++) {
      const tick = simulateOneTick(home, away, ball, cfg);
      collector.recordTick(ball, home, away);
      if (tick.event) steps.push({ ...tick.event, minute });
    }

    const shotFrom = { ...shooter.currentCoord };
    const shotTo = jitter(goal, 4);
    collector.recordAction('shot', shotFrom, attacker.isHome);
    steps.push({
      action: 'shot',
      fromPlayerId: shooter.playerId,
      toPlayerId: null,
      ballFrom: shotFrom,
      ballTo: shotTo,
      description: `${shooter.name} finaliza para o gol!`,
      durationMs: actionDuration('shot', I.distance(shotFrom, shotTo)),
      minute,
    });

    if (matchEvent.type === 'goal' || matchEvent.type === 'penalty_goal') {
      steps.push({
        action: 'goal', fromPlayerId: shooter.playerId, toPlayerId: null,
        ballFrom: shotTo, ballTo: shotTo,
        description: matchEvent.description, durationMs: 1800, minute,
      });
    } else if (matchEvent.type === 'save') {
      const keeper = defender.players.find(p => p.position === 'GOL') ?? defender.players[0];
      steps.push({
        action: 'save', fromPlayerId: keeper.playerId, toPlayerId: null,
        ballFrom: shotTo, ballTo: shotTo,
        description: matchEvent.description, durationMs: 1200, minute,
      });
    } else if (matchEvent.type === 'miss' || matchEvent.type === 'penalty_miss') {
      steps.push({
        action: 'shot', fromPlayerId: shooter.playerId, toPlayerId: null,
        ballFrom: shotFrom, ballTo: shotTo,
        description: matchEvent.description, durationMs: actionDuration('shot', I.distance(shotFrom, shotTo)), minute,
      });
    } else if (matchEvent.type === 'own_goal') {
      const own = defender.players.find(p => p.position === 'GOL') ?? defender.players[0];
      steps.push({
        action: 'goal', fromPlayerId: own.playerId, toPlayerId: null,
        ballFrom: own.currentCoord, ballTo: goalFor(attacker.isHome),
        description: matchEvent.description, durationMs: 1800, minute,
      });
    }
    return { steps, metrics: collector.finalize() };
  }

  let prevPossession: 'home' | 'away' | null = homeCloser ? 'home' : 'away';
  for (let tick = 0; tick < cfg.ticksPerMinute; tick++) {
    const res = simulateOneTick(home, away, ball, cfg);
    collector.recordTick(ball, home, away);

    if (res.event) {
      const isHome = home.hasPossession;
      const passDist = res.event.ballFrom && res.event.ballTo
        ? I.distance(res.event.ballFrom, res.event.ballTo) : undefined;
      collector.recordAction(res.event.action, res.event.ballFrom, isHome, passDist, cfg);
      steps.push({ ...res.event, minute });
    }

    const currentPossession = home.hasPossession ? 'home' : 'away';
    if (currentPossession !== prevPossession) {
      collector.recordPossessionChange(currentPossession);
      prevPossession = currentPossession;
    }

    ball.x = res.ball.x;
    ball.y = res.ball.y;
  }

  if (steps.length === 0) {
    steps.push({
      action: 'build_up', fromPlayerId: '', toPlayerId: '',
      ballFrom: { ...ball }, ballTo: { ...ball },
      description: 'Jogo parado no setor defensivo.', durationMs: 1000, minute,
    });
  }

  return { steps: steps.slice(0, 12), metrics: collector.finalize() };
}
