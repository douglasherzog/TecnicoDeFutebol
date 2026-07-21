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

const GOAL_HOME: PitchCoord = { x: 99, y: 50 };
const GOAL_AWAY: PitchCoord = { x: 1, y: 50 };

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

export function goalFor(isHome: boolean) {
  return isHome ? GOAL_HOME : GOAL_AWAY;
}

export function actionDuration(action: PlayAction, distance: number): number {
  const base: Record<PlayAction, number> = {
    pass: 500,
    long_pass: 700,
    cross: 800,
    carry: 800,
    dribble: 600,
    tabela: 700,
    header: 600,
    tackle: 500,
    intercept: 500,
    shot: 500,
    save: 1000,
    goal: 2000,
    clearance: 600,
    throw_in: 900,
    corner: 1000,
    build_up: 1000,
  };
  return base[action] + distance * 15;
}

export function jitter(coord: PitchCoord, amount: number): PitchCoord {
  return {
    x: I.clamp(coord.x + (Math.random() - 0.5) * amount, 1, 99),
    y: I.clamp(coord.y + (Math.random() - 0.5) * amount, 1, 99),
  };
}

export function findHolder(state: TeamState): TacticalPlayer | null {
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

export function simulateOneTick(
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

  // repulsão contínua para evitar empilhamento — 2 iterações, anisotrópica
  function separate(team: TeamState, others: TeamState) {
    const all = [...team.players, ...others.players];
    const minDist = 5.0;
    const push = 1.5;
    const yWeight = 2.0;  // empurra mais no eixo Y (lateral) que no X (longitudinal)
    const xWeight = 0.5;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        if (a.position === 'GOL') continue;
        for (let j = i + 1; j < all.length; j++) {
          const b = all[j];
          const dx = a.currentCoord.x - b.currentCoord.x;
          const dy = a.currentCoord.y - b.currentCoord.y;
          const dist = I.distance(a.currentCoord, b.currentCoord);
          if (dist > 0 && dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const force = (minDist - dist) * push * 0.5;
            a.currentCoord.x = I.clamp(a.currentCoord.x + nx * force * xWeight, 1, 99);
            a.currentCoord.y = I.clamp(a.currentCoord.y + ny * force * yWeight, 1, 99);
            if (b.position !== 'GOL') {
              b.currentCoord.x = I.clamp(b.currentCoord.x - nx * force * xWeight, 1, 99);
              b.currentCoord.y = I.clamp(b.currentCoord.y - ny * force * yWeight, 1, 99);
            }
          }
        }
      }
    }
  }
  separate(home, away);

  let result: { ball: PitchCoord; event?: PlayStep } = { ball };

  // quem está com a bola decide
  const holder = findHolder(attackingTeam);
  if (holder && holder.cooldown <= 0) {
    // Verifica se é retorno de tabela — prioridade absoluta
    const tabelaReturnTo = (holder as TacticalPlayer & { _tabelaReturnTo?: string })._tabelaReturnTo;
    if (tabelaReturnTo) {
      const runner = attackingTeam.players.find(p => p.playerId === tabelaReturnTo);
      if (runner) {
        const from = { ...holder.currentCoord };
        const to = { ...runner.currentCoord };
        (holder as TacticalPlayer & { _tabelaReturnTo?: string })._tabelaReturnTo = undefined;
        holder.state = 'positioning';
        holder.cooldown = 4;
        runner.state = 'carrying';
        runner.cooldown = 3;
        runner.currentCoord = { ...to };
        result = { ball: to };
        result.event = {
          action: 'pass',
          fromPlayerId: holder.playerId,
          toPlayerId: runner.playerId,
          ballFrom: from,
          ballTo: to,
          playerFrom: { ...from },
          playerTo: { ...to },
          description: `${holder.name} devolve a tabela para ${runner.name}!`,
          durationMs: actionDuration('pass', I.distance(from, to)),
        };
        // Skip normal decision-making
        const finalHolderTab = findHolder(home.hasPossession ? home : away);
        if (finalHolderTab) result.ball = { ...finalHolderTab.currentCoord };
        home.phase = detectTeamPhase(home.hasPossession, home.phase, result.ball.x, home.isHome);
        away.phase = detectTeamPhase(away.hasPossession, away.phase, result.ball.x, away.isHome);
        return result;
      }
    }

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
      // Após chute para fora, goleiro adversário toma posse na bola
      const newHolder = defendingTeam.players.find(p => p.position === 'GOL') ?? defendingTeam.players[0];
      newHolder.state = 'carrying';
      newHolder.currentCoord = { ...result.ball };
      newHolder.cooldown = 4;
    } else if (decision.action === 'cross') {
      const target = attackingTeam.players.find(p => p.playerId === decision.targetId)!;
      const from = { ...holder.currentCoord };
      const to = jitter(decision.ballTo, 3);
      const dist = I.distance(from, to);

      // Cruzamento: bola vai alta para a área, disputa aérea entre atacante e zagueiro mais próximo
      const marker = nearestOpponent(target, defendingTeam);
      target.state = 'contesting_header';
      marker.state = 'contesting_header';

      // Disputa aérea: força + técnica + salto (aproximado por speed) + aleatoriedade
      const attackerScore = target.attributes.strength * 0.3 + target.attributes.technique * 0.2 + target.attributes.speed * 0.2 + Math.random() * 30;
      const defenderScore = marker.attributes.strength * 0.3 + marker.attributes.tackling * 0.2 + marker.attributes.speed * 0.2 + Math.random() * 30;
      const attackerWins = attackerScore >= defenderScore;

      result = { ball: to };
      result.event = {
        action: 'cross',
        fromPlayerId: holder.playerId,
        toPlayerId: target.playerId,
        ballFrom: from,
        ballTo: to,
        playerFrom: { ...from },
        playerTo: { ...to },
        description: `${holder.name} cruza para ${target.name}! Disputa aérea com ${marker.name}.`,
        durationMs: actionDuration('cross', dist),
      };

      // O cabeceio acontece no tick seguinte como um evento separado
      if (attackerWins) {
        target.currentCoord = { ...to };
        target.state = 'carrying';
        marker.state = 'positioning';
        target.cooldown = 5;
        // Se está na área, pode finalizar de cabeça
        const inFinalThird = attackingTeam.isHome ? to.x > 70 : to.x < 30;
        if (inFinalThird && Math.random() < 0.4) {
          const goal = goalFor(attackingTeam.isHome);
          const shotQuality = target.attributes.technique * 0.4 + target.attributes.composure * 0.3 + Math.random() * 20;
          const keeper = defendingTeam.players.find(p => p.position === 'GOL') ?? opponents[0];
          const saveQuality = keeper.attributes.technique + keeper.attributes.composure;
          const scored = shotQuality - saveQuality + Math.random() * 15 > 80;
          if (scored) {
            result = { ball: goal };
            result.event = {
              action: 'goal',
              fromPlayerId: target.playerId,
              toPlayerId: null,
              ballFrom: to,
              ballTo: goal,
              description: `GOL DE CABEÇA! ${target.name} cabeceou para o gol!`,
              durationMs: actionDuration('goal', I.distance(to, goal)),
            };
            attackingTeam.hasPossession = false;
            defendingTeam.hasPossession = true;
          } else {
            const missTo = { x: attackingTeam.isHome ? 99 : 1, y: 28 + Math.random() * 44 };
            result = { ball: missTo };
            result.event = {
              action: 'header',
              fromPlayerId: target.playerId,
              toPlayerId: null,
              ballFrom: to,
              ballTo: missTo,
              description: `${target.name} cabeceou, mas a bola foi para fora!`,
              durationMs: actionDuration('header', I.distance(to, missTo)),
            };
            attackingTeam.hasPossession = false;
            defendingTeam.hasPossession = true;
            // Goleiro adversário toma posse na bola
            const newHolder = defendingTeam.players.find(p => p.position === 'GOL') ?? defendingTeam.players[0];
            newHolder.state = 'carrying';
            newHolder.currentCoord = { ...missTo };
            newHolder.cooldown = 4;
          }
        }
        // If attacker wins without shooting, possession stays — cross event remains as-is
      } else {
        // Zagueiro ganha a disputa aérea e afasta ou ganha posse
        marker.currentCoord = { ...to };
        marker.state = 'carrying';
        target.state = 'positioning';
        marker.cooldown = 5;
        const clearTo = {
          x: attackingTeam.isHome ? I.clamp(to.x - 25, 1, 99) : I.clamp(to.x + 25, 1, 99),
          y: 30 + Math.random() * 40,
        };
        result = { ball: clearTo };
        result.event = {
          action: 'header',
          fromPlayerId: marker.playerId,
          toPlayerId: null,
          ballFrom: to,
          ballTo: clearTo,
          description: `${marker.name} ganha a disputa aérea e afasta!`,
          durationMs: actionDuration('header', I.distance(to, clearTo)),
        };
        attackingTeam.hasPossession = false;
        defendingTeam.hasPossession = true;
        // Jogador mais próximo da bola torna-se holder
        const allPlayers = [...attackingTeam.players, ...defendingTeam.players];
        const nearest = allPlayers.reduce((c, p) =>
          I.distance(p.currentCoord, clearTo) < I.distance(c.currentCoord, clearTo) ? p : c,
        );
        nearest.state = 'carrying';
        nearest.currentCoord = { ...clearTo };
        nearest.cooldown = 4;
      }
      holder.state = 'positioning';
      holder.cooldown = 5;
    } else if (decision.action === 'pass' || decision.action === 'long_pass') {
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
        // Interceptor move para a posição da bola — garante continuidade
        interceptor.currentCoord = { ...to };
        interceptor.state = 'carrying';
        interceptor.cooldown = 5;
        result = { ball: to };
        result.event = {
          action: 'intercept',
          fromPlayerId: interceptor.playerId,
          toPlayerId: null,
          ballFrom: from,
          ballTo: to,
          playerFrom: { ...interceptor.currentCoord },
          playerTo: { ...to },
          description: `${interceptor.name} interceptou!`,
          durationMs: actionDuration('intercept', I.distance(from, to)),
        };
        attackingTeam.hasPossession = false;
        defendingTeam.hasPossession = true;
      } else {
        // Receptor move para o destino da bola — garante continuidade
        target.currentCoord = { ...to };
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

      if (decision.action === 'dribble') {
        // Drible: resolve contra o marcador mais próximo
        const marker = nearestOpponent(holder, defendingTeam);
        if (marker && I.distance(holder.currentCoord, marker.currentCoord) < 6) {
          const duel = resolveDuel(holder, marker, 1.3);
          if (duel.winner === marker) {
            // Drible falhou — marcador ganha a bola
            marker.currentCoord = { ...from };
            marker.state = 'carrying';
            marker.cooldown = 5;
            holder.state = 'positioning';
            holder.cooldown = 5;
            result = { ball: { ...from } };
            result.event = {
              action: 'tackle',
              fromPlayerId: marker.playerId,
              toPlayerId: holder.playerId,
              ballFrom: from,
              ballTo: from,
              playerFrom: { ...from },
              playerTo: { ...from },
              description: `${marker.name} desarmou ${holder.name} no drible!`,
              durationMs: actionDuration('tackle', 3),
            };
            attackingTeam.hasPossession = false;
            defendingTeam.hasPossession = true;
            holder.cooldown = 5;
            // Skip the rest — possession changed
            const finalHolder2 = findHolder(home.hasPossession ? home : away);
            if (finalHolder2) result.ball = { ...finalHolder2.currentCoord };
            home.phase = detectTeamPhase(home.hasPossession, home.phase, result.ball.x, home.isHome);
            away.phase = detectTeamPhase(away.hasPossession, away.phase, result.ball.x, away.isHome);
            return result;
          }
        }
      }

      holder.currentCoord = { ...to };
      holder.state = decision.action === 'dribble' ? 'dribbling' : 'carrying';
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
    } else if (decision.action === 'tabela') {
      // Tabela: passe para o parceiro e corrida para receber de volta
      const target = attackingTeam.players.find(p => p.playerId === decision.targetId)!;
      const from = { ...holder.currentCoord };
      const passTo = { ...target.currentCoord };
      const runTarget = jitter(decision.ballTo, 3);

      // Primeiro evento: passe para o parceiro
      result = { ball: passTo };
      result.event = {
        action: 'tabela',
        fromPlayerId: holder.playerId,
        toPlayerId: target.playerId,
        ballFrom: from,
        ballTo: passTo,
        playerFrom: { ...from },
        playerTo: { ...passTo },
        description: `${holder.name} faz tabela com ${target.name}.`,
        durationMs: actionDuration('tabela', I.distance(from, passTo)),
      };

      // Holder corre para o espaço livre
      holder.currentCoord = { ...runTarget };
      holder.state = 'making_run';
      holder.cooldown = 3;

      // Parceiro recebe e imediatamente devolve (próximo tick resolverá)
      target.currentCoord = { ...passTo };
      target.state = 'carrying';
      target.cooldown = 2;

      // Marcar para o próximo tick: parceiro deve passar para o holder em corrida
      (target as TacticalPlayer & { _tabelaReturnTo?: string })._tabelaReturnTo = holder.playerId;
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
      // Após clearance, jogador mais próximo da bola torna-se holder
      const allPlayers = [...attackingTeam.players, ...defendingTeam.players];
      const nearest = allPlayers.reduce((c, p) =>
        I.distance(p.currentCoord, to) < I.distance(c.currentCoord, to) ? p : c,
      );
      nearest.state = 'carrying';
      nearest.currentCoord = { ...to };
      nearest.cooldown = 4;
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
        // Tackler move para a posição da bola — garante continuidade
        const ballPos = { ...target.currentCoord };
        d.currentCoord = { ...ballPos };
        result = { ball: ballPos };
        result.event = {
          action: 'tackle',
          fromPlayerId: d.playerId,
          toPlayerId: target.playerId,
          ballFrom: ballPos,
          ballTo: ballPos,
          playerFrom: { ...ballPos },
          playerTo: { ...ballPos },
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

  // Continuidade da bola: se há um holder, a bola segue seus pés
  const finalHolder = findHolder(home.hasPossession ? home : away);
  if (finalHolder && !result.event) {
    // Entre eventos, bola acompanha o holder
    result.ball = { ...finalHolder.currentCoord };
  } else if (finalHolder && result.event) {
    // Após evento, se o holder ainda tem a bola (carry/dribble), sincroniza
    if (result.event.action === 'carry' || result.event.action === 'dribble') {
      result.ball = { ...finalHolder.currentCoord };
    }
  }

  home.phase = detectTeamPhase(home.hasPossession, home.phase, result.ball.x, home.isHome);
  away.phase = detectTeamPhase(away.hasPossession, away.phase, result.ball.x, away.isHome);

  return result;
}

/**
 * TEST-ONLY UTILITY — pre-computes a full minute of plays.
 * This is NOT used by the live match engine (MatchSimulation).
 * The live engine calls simulateOneTick() directly in its tick() method.
 * Use this only for automated tests and statistical analysis.
 */
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
      ball.x = tick.ball.x;
      ball.y = tick.ball.y;
    }

    // Ensure shooter is at the ball position for continuity
    shooter.currentCoord = { ...ball };
    const shotFrom = { ...ball };
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
        ballFrom: shotTo,
        ballTo: goalFor(attacker.isHome),
        description: matchEvent.description,
        durationMs: 1800,
        minute,
      });
    }
    return steps;
  }

  // simulação normal de um minuto
  let lastEventBall = { ...ball };
  let idleTicks = 0;
  for (let tick = 0; tick < cfg.ticksPerMinute; tick++) {
    const res = simulateOneTick(home, away, ball, cfg);
    if (res.event) {
      // Se houve lacuna idle, preenche com build_up para continuidade visual
      if (idleTicks >= 3) {
        const holder = findHolder(home.hasPossession ? home : away);
        const fillPlayer = holder ?? [...home.players, ...away.players].reduce((c, p) =>
          I.distance(p.currentCoord, lastEventBall) < I.distance(c.currentCoord, lastEventBall) ? p : c,
        );
        steps.push({
          action: 'build_up',
          fromPlayerId: fillPlayer.playerId,
          toPlayerId: fillPlayer.playerId,
          ballFrom: { ...lastEventBall },
          ballTo: { ...fillPlayer.currentCoord },
          playerFrom: { ...lastEventBall },
          playerTo: { ...fillPlayer.currentCoord },
          description: `${fillPlayer.name} conduz a bola no setor.`,
          durationMs: idleTicks * 200,
          minute,
        });
      }
      steps.push({ ...res.event, minute });
      lastEventBall = { ...res.ball };
      idleTicks = 0;
    } else {
      idleTicks++;
    }
    ball.x = res.ball.x;
    ball.y = res.ball.y;
  }

  // se nada aconteceu, adicionar ao menos uma ação de construção para o campo não ficar parado
  if (steps.length === 0) {
    const holder = findHolder(home.hasPossession ? home : away);
    const nearest = holder ?? [...home.players, ...away.players].reduce((c, p) =>
      I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c,
    );
    steps.push({
      action: 'build_up',
      fromPlayerId: nearest.playerId,
      toPlayerId: nearest.playerId,
      ballFrom: { ...ball },
      ballTo: { ...nearest.currentCoord },
      playerFrom: { ...ball },
      playerTo: { ...nearest.currentCoord },
      description: `${nearest.name} segura a bola no setor defensivo.`,
      durationMs: 1000,
      minute,
    });
  }

  // limita passos para não sobrecarregar a animação (10 por minuto é bastante)
  return steps.slice(0, 20);
}

/**
 * TEST-ONLY UTILITY — pre-computes a full minute of plays with metrics.
 * This is NOT used by the live match engine (MatchSimulation).
 * Use this only for automated tests and statistical analysis.
 */
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
      ball.x = tick.ball.x;
      ball.y = tick.ball.y;
    }

    // Ensure shooter is at the ball position for continuity
    shooter.currentCoord = { ...ball };
    const shotFrom = { ...ball };
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
        ballFrom: shotTo, ballTo: goalFor(attacker.isHome),
        description: matchEvent.description, durationMs: 1800, minute,
      });
    }
    return { steps, metrics: collector.finalize() };
  }

  let prevPossession: 'home' | 'away' | null = homeCloser ? 'home' : 'away';
  let lastEventBall = { ...ball };
  let idleTicks = 0;
  for (let tick = 0; tick < cfg.ticksPerMinute; tick++) {
    const res = simulateOneTick(home, away, ball, cfg);
    collector.recordTick(ball, home, away);

    if (res.event) {
      const isHome = home.hasPossession;
      const passDist = res.event.ballFrom && res.event.ballTo
        ? I.distance(res.event.ballFrom, res.event.ballTo) : undefined;
      collector.recordAction(res.event.action, res.event.ballFrom, isHome, passDist, cfg);
      if (res.event.action === 'header' || res.event.action === 'cross') {
        const possessionAfter = home.hasPossession ? 'home' : 'away';
        if (possessionAfter === prevPossession) {
          collector.recordHeaderWon();
        }
      }
      // Preencher lacuna idle com build_up para continuidade visual
      if (idleTicks >= 3) {
        const holder = findHolder(home.hasPossession ? home : away);
        const fillPlayer = holder ?? [...home.players, ...away.players].reduce((c, p) =>
          I.distance(p.currentCoord, lastEventBall) < I.distance(c.currentCoord, lastEventBall) ? p : c,
        );
        steps.push({
          action: 'build_up',
          fromPlayerId: fillPlayer.playerId,
          toPlayerId: fillPlayer.playerId,
          ballFrom: { ...lastEventBall },
          ballTo: { ...fillPlayer.currentCoord },
          playerFrom: { ...lastEventBall },
          playerTo: { ...fillPlayer.currentCoord },
          description: `${fillPlayer.name} conduz a bola no setor.`,
          durationMs: idleTicks * 200,
          minute,
        });
      }
      steps.push({ ...res.event, minute });
      lastEventBall = { ...res.ball };
      idleTicks = 0;
    } else {
      idleTicks++;
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
    const holder = findHolder(home.hasPossession ? home : away);
    const nearest = holder ?? [...home.players, ...away.players].reduce((c, p) =>
      I.distance(p.currentCoord, ball) < I.distance(c.currentCoord, ball) ? p : c,
    );
    steps.push({
      action: 'build_up', fromPlayerId: nearest.playerId, toPlayerId: nearest.playerId,
      ballFrom: { ...ball }, ballTo: { ...nearest.currentCoord },
      playerFrom: { ...ball }, playerTo: { ...nearest.currentCoord },
      description: `${nearest.name} segura a bola no setor defensivo.`, durationMs: 1000, minute,
    });
  }

  return { steps: steps.slice(0, 20), metrics: collector.finalize() };
}
