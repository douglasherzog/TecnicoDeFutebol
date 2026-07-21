import type { PlayStep, PlayerOnPitch, PitchCoord, PlayAction } from './pitchEngine';
import * as I from './interpolation';
import {
  detectTeamPhase,
  enrichPlayers,
} from './tactical/ai';
import {
  styleFromApproach,
  simulateOneTick,
  goalFor,
  jitter,
  actionDuration,
  findHolder,
} from './tactical/minuteSimulator';
import { DEFAULT_TACTICAL_CONFIG, type TacticalConfig, type TeamState, type TacticalPlayer } from './tactical/types';
import type { MatchEvent } from '../types';

/** Configurable simulation constants. Tune these for feel. */
export const SIMULATION_CONFIG = {
  /** Logic ticks per second. 10-15 recommended. Lower = more stable; higher = snappier. */
  TICK_RATE: 12,
  /** Vertical scaling applied to pitch Y when rendering on the 2D view. */
  Y_SCALE: 0.64,
  /** Ball base radius in SVG units. */
  BALL_BASE_RADIUS: 1.4,
  /** How much the ball grows with height. */
  BALL_HEIGHT_SCALE: 0.08,
  /** Default ball curve direction; sign alternates per step. */
  CURVE_FACTOR: 0.25,
  /** Player steering max speed by role, in pitch units per second. */
  ROLE_SPEED: {
    GOL: 35,
    ZAG: 60,
    LAT: 85,
    VOL: 95,
    MEI: 105,
    ATA: 115,
  } satisfies Record<PlayerOnPitch['position'], number>,
} as const;

const TICK_INTERVAL_MS = 1000 / SIMULATION_CONFIG.TICK_RATE;
export { TICK_INTERVAL_MS };

interface SimPlayer extends TacticalPlayer {
  previous: PitchCoord;
  current: PitchCoord;
  simVelocity: PitchCoord;
  previousAngle: number;
  currentAngle: number;
  base: PitchCoord;
}

interface SimBall {
  previous: PitchCoord;
  current: PitchCoord;
  previousHeight: number;
  currentHeight: number;
}

export interface SimulationRefs {
  ball: SVGCircleElement | null;
  shadow: SVGEllipseElement | null;
  trail: SVGLineElement | null;
  goalFlash: SVGCircleElement | null;
  saveFlash: SVGCircleElement | null;
  referee: SVGCircleElement | null;
  linesman1: SVGCircleElement | null;
  linesman2: SVGCircleElement | null;
  players: Record<
    string,
    { dot: SVGCircleElement | null; outline: SVGCircleElement | null; dir: SVGLineElement | null; label: SVGTextElement | null } | undefined
  >;
}

function maxHeightForAction(action: PlayAction): number {
  switch (action) {
    case 'shot':
      return 22;
    case 'clearance':
      return 20;
    case 'long_pass':
    case 'throw_in':
    case 'corner':
      return 16;
    case 'cross':
    case 'header':
      return 10;
    case 'pass':
    case 'tabela':
      return 2.5;
    case 'dribble':
      return 0.8;
    case 'carry':
      return 0.6;
    default:
      return 0;
  }
}

// Player positioning is now unified with the tactical AI via computeTacticalTarget() and computeKeeperTarget().

export class MatchSimulation {
  private players: SimPlayer[];
  private ball: SimBall;
  private speed: number;
  private logicTime = 0;
  private lastTacticalTick = 0;
  private tacticalTickInterval: number;
  private done = false;
  private homeTeam: TeamState;
  private awayTeam: TeamState;
  private cfg: TacticalConfig;
  private homeCount: number;
  private refereePos: PitchCoord = { x: 50, y: 50 };
  private currentEvent: PlayStep | null = null;
  private eventLog: { desc: string; action: string }[] = [];
  private matchEvent: MatchEvent | null = null;
  private eventInjected = false;
  private tacticalTicksRun = 0;
  private totalTacticalTicks: number;
  private minute: number;
  private homeTeamId: string;
  private awayTeamId: string;
  private ballHeight = 0;
  private prevBallHeight = 0;

  constructor(
    minute: number,
    homePlayers: PlayerOnPitch[],
    awayPlayers: PlayerOnPitch[],
    homeTeamId: string,
    awayTeamId: string,
    speed = 1,
    homeApproach = 'balanced',
    awayApproach = 'balanced',
    matchEvent: MatchEvent | null = null,
    startBallPos: PitchCoord | null = null,
    cfg: TacticalConfig = DEFAULT_TACTICAL_CONFIG,
  ) {
    this.speed = speed;
    this.cfg = cfg;
    this.minute = minute;
    this.homeTeamId = homeTeamId;
    this.awayTeamId = awayTeamId;
    this.matchEvent = matchEvent;
    this.totalTacticalTicks = cfg.ticksPerMinute;

    // Tactical tick interval: 45 seconds real time per minute / ticksPerMinute
    this.tacticalTickInterval = 45000 / cfg.ticksPerMinute;

    const homeTactical = enrichPlayers(homePlayers);
    const awayTactical = enrichPlayers(awayPlayers);

    const startPos = startBallPos ?? { x: 50, y: 50 };

    // Decide initial possession based on proximity to ball
    const nearestHome = homeTactical.reduce((c, p) => (I.distance(p.currentCoord, startPos) < I.distance(c.currentCoord, startPos) ? p : c));
    const nearestAway = awayTactical.reduce((c, p) => (I.distance(p.currentCoord, startPos) < I.distance(c.currentCoord, startPos) ? p : c));
    const homeCloser = I.distance(nearestHome.currentCoord, startPos) <= I.distance(nearestAway.currentCoord, startPos);

    this.homeTeam = {
      players: homeTactical,
      isHome: true,
      style: styleFromApproach(homeApproach),
      phase: homeCloser ? 'attacking_organized' : 'defending_organized',
      hasPossession: homeCloser,
      lastPhase: 'attacking_organized',
      goals: 0,
    };
    this.awayTeam = {
      players: awayTactical,
      isHome: false,
      style: styleFromApproach(awayApproach),
      phase: homeCloser ? 'defending_organized' : 'attacking_organized',
      hasPossession: !homeCloser,
      lastPhase: 'defending_organized',
      goals: 0,
    };

    const holder = homeCloser ? nearestHome : nearestAway;
    holder.state = 'carrying';

    this.homeCount = homeTactical.length;
    this.players = [...homeTactical, ...awayTactical].map(p => ({
      ...p,
      previous: { ...p.currentCoord },
      current: { ...p.currentCoord },
      simVelocity: { x: 0, y: 0 },
      previousAngle: 0,
      currentAngle: 0,
      base: { ...p.baseCoord },
    }));

    this.ball = {
      previous: { ...startPos },
      current: { ...startPos },
      previousHeight: 0,
      currentHeight: 0,
    };
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  getCurrentPlay(): PlayStep | null {
    return this.currentEvent;
  }

  getCurrentStepIndex(): number {
    return this.tacticalTicksRun;
  }

  getEventLog(): { desc: string; action: string }[] {
    return this.eventLog;
  }

  isDone(): boolean {
    return this.done;
  }

  getTickIntervalMs(): number {
    return TICK_INTERVAL_MS;
  }

  getBallPosition(): PitchCoord {
    return { ...this.ball.current };
  }

  getPlayerPositions(): PitchCoord[] {
    return this.players.map(p => ({ ...p.current }));
  }

  getRefereePosition(): PitchCoord {
    return { ...this.refereePos };
  }

  /** Advance simulation by one fixed timestep. Runs simulateOneTick live — no pre-computed plays. */
  tick(dtMs: number) {
    if (this.done) return;

    this.logicTime += dtMs * this.speed;

    // Run tactical ticks as needed
    while (this.logicTime - this.lastTacticalTick >= this.tacticalTickInterval) {
      this.lastTacticalTick += this.tacticalTickInterval;
      this.runTacticalTick();
      if (this.done) break;
    }
  }

  /** Draw the interpolated frame by mutating the provided SVG refs directly. */
  render(alpha: number, refs: SimulationRefs, yScale = SIMULATION_CONFIG.Y_SCALE) {
    const visualBall = I.lerpCoord(this.ball.previous, this.ball.current, alpha);
    const visualHeight = I.lerp(this.ball.previousHeight, this.ball.currentHeight, alpha);
    const ballR = SIMULATION_CONFIG.BALL_BASE_RADIUS + visualHeight * SIMULATION_CONFIG.BALL_HEIGHT_SCALE;

    if (refs.ball) {
      refs.ball.setAttribute('cx', visualBall.x.toFixed(2));
      refs.ball.setAttribute('cy', (visualBall.y * yScale).toFixed(2));
      refs.ball.setAttribute('r', ballR.toFixed(2));
    }

    if (refs.shadow) {
      refs.shadow.setAttribute('cx', visualBall.x.toFixed(2));
      refs.shadow.setAttribute('cy', (visualBall.y * yScale + 0.8).toFixed(2));
      refs.shadow.setAttribute('rx', (0.8 + visualHeight * 0.04).toFixed(2));
      refs.shadow.setAttribute('ry', (0.3 + visualHeight * 0.015).toFixed(2));
    }

    const step = this.currentEvent;
    if (refs.trail && step) {
      refs.trail.setAttribute('x1', step.ballFrom.x.toFixed(2));
      refs.trail.setAttribute('y1', (step.ballFrom.y * yScale).toFixed(2));
      refs.trail.setAttribute('x2', visualBall.x.toFixed(2));
      refs.trail.setAttribute('y2', (visualBall.y * yScale).toFixed(2));
    }

    const currentPlay = this.getCurrentPlay();
    const holderId = currentPlay?.toPlayerId ?? null;

    for (const p of this.players) {
      const ref = refs.players[p.playerId];
      if (!ref?.dot) continue;

      const visual = I.lerpCoord(p.previous, p.current, alpha);
      const cx = visual.x.toFixed(2);
      const cy = (visual.y * yScale).toFixed(2);
      ref.dot.setAttribute('cx', cx);
      ref.dot.setAttribute('cy', cy);

      if (ref.outline) {
        ref.outline.setAttribute('cx', cx);
        ref.outline.setAttribute('cy', cy);
      }

      if (ref.dir) {
        const angle = I.lerpAngle(p.previousAngle, p.currentAngle, alpha);
        const dx = Math.cos(angle) * 2;
        const dyScreen = Math.sin(angle) * 2 * yScale;
        ref.dir.setAttribute('x1', cx);
        ref.dir.setAttribute('y1', cy);
        ref.dir.setAttribute('x2', (visual.x + dx).toFixed(2));
        ref.dir.setAttribute('y2', (visual.y * yScale + dyScreen).toFixed(2));
      }

      if (p.playerId === holderId) {
        ref.dot.setAttribute('r', (p.position === 'GOL' ? 3.0 : 2.5).toFixed(2));
      } else if (p.position === 'GOL') {
        ref.dot.setAttribute('r', '2.8');
      } else {
        ref.dot.setAttribute('r', '2.3');
      }

      if (ref.label) {
        ref.label.setAttribute('x', cx);
        ref.label.setAttribute('y', (parseFloat(cy) + 0.8).toFixed(2));
      }
    }

    // Referee — position computed in runTacticalTick via updateReferee
    if (refs.referee) {
      refs.referee.setAttribute('cx', this.refereePos.x.toFixed(2));
      refs.referee.setAttribute('cy', (this.refereePos.y * yScale).toFixed(2));
    }

    // Linesmen — track ball X position along their sidelines
    if (refs.linesman1) {
      refs.linesman1.setAttribute('cx', visualBall.x.toFixed(2));
      refs.linesman1.setAttribute('cy', '1.5');
    }
    if (refs.linesman2) {
      refs.linesman2.setAttribute('cx', visualBall.x.toFixed(2));
      refs.linesman2.setAttribute('cy', (64 - 1.5).toFixed(2));
    }

    // Goal flash ring
    if (refs.goalFlash) {
      if (currentPlay?.action === 'goal') {
        const pulse = Math.sin(performance.now() / 150);
        refs.goalFlash.setAttribute('cx', visualBall.x.toFixed(2));
        refs.goalFlash.setAttribute('cy', (visualBall.y * yScale).toFixed(2));
        refs.goalFlash.setAttribute('r', (4 + 2 * pulse).toFixed(2));
        refs.goalFlash.setAttribute('opacity', (0.6 + 0.4 * pulse).toFixed(2));
      } else {
        refs.goalFlash.setAttribute('opacity', '0');
      }
    }

    // Save flash on keeper
    if (refs.saveFlash) {
      if (currentPlay?.action === 'save' && currentPlay.fromPlayerId) {
        const keeper = this.players.find(p => p.playerId === currentPlay.fromPlayerId);
        if (keeper) {
          const visual = I.lerpCoord(keeper.previous, keeper.current, alpha);
          const pulse = Math.sin(performance.now() / 200);
          refs.saveFlash.setAttribute('cx', visual.x.toFixed(2));
          refs.saveFlash.setAttribute('cy', (visual.y * yScale).toFixed(2));
          refs.saveFlash.setAttribute('r', '4.5');
          refs.saveFlash.setAttribute('opacity', (0.6 + 0.4 * pulse).toFixed(2));
        } else {
          refs.saveFlash.setAttribute('opacity', '0');
        }
      } else {
        refs.saveFlash.setAttribute('opacity', '0');
      }
    }
  }

  /** Run one live tactical tick — the core of the continuous simulation. */
  private runTacticalTick() {
    this.tacticalTicksRun++;

    // Check if we need to inject a match event (goal/save/miss)
    if (this.matchEvent && !this.eventInjected) {
      const eventTypes = ['goal', 'save', 'miss', 'penalty_goal', 'penalty_miss', 'own_goal'];
      if (eventTypes.includes(this.matchEvent.type)) {
        if (this.tacticalTicksRun >= Math.floor(this.totalTacticalTicks * 0.8)) {
          this.injectMatchEvent();
          this.eventInjected = true;
          return;
        }
      }
    }

    if (this.tacticalTicksRun >= this.totalTacticalTicks) {
      this.done = true;
      return;
    }

    // Run the live tactical simulation — this is the core call
    const result = simulateOneTick(this.homeTeam, this.awayTeam, this.ball.current, this.cfg);

    // Update ball position from tactical result
    this.ball.previous = { ...this.ball.current };
    this.ball.current = result.ball;

    // Track current event for display
    if (result.event) {
      this.currentEvent = { ...result.event, minute: this.minute };
      this.eventLog.push({ desc: result.event.description, action: result.event.action });
      if (this.eventLog.length > 30) this.eventLog.shift();
    } else {
      this.currentEvent = null;
    }

    // Sync sim player positions from tactical state
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].previous = { ...this.players[i].current };
      const tacticalIdx = i < this.homeCount ? i : i - this.homeCount;
      const team = i < this.homeCount ? this.homeTeam : this.awayTeam;
      this.players[i].current = { ...team.players[tacticalIdx].currentCoord };
      this.players[i].currentCoord = { ...team.players[tacticalIdx].currentCoord };

      const dx = this.players[i].current.x - this.players[i].previous.x;
      const dy = this.players[i].current.y - this.players[i].previous.y;
      const moveDist = Math.hypot(dx, dy);
      this.players[i].previousAngle = this.players[i].currentAngle;
      if (moveDist > 0.1) {
        this.players[i].currentAngle = Math.atan2(dy, dx);
      }
    }

    // Update ball height based on current event
    this.prevBallHeight = this.ballHeight;
    this.ballHeight = this.currentEvent ? maxHeightForAction(this.currentEvent.action) : 0;
    this.ball.previousHeight = this.prevBallHeight;
    this.ball.currentHeight = this.ballHeight;

    // Update team phases
    this.homeTeam.phase = detectTeamPhase(this.homeTeam.hasPossession, this.homeTeam.phase, this.ball.current.x, true);
    this.awayTeam.phase = detectTeamPhase(this.awayTeam.hasPossession, this.awayTeam.phase, this.ball.current.x, false);

    // Physics
    const holderId = this.currentEvent?.toPlayerId ?? findHolder(this.homeTeam.hasPossession ? this.homeTeam : this.awayTeam)?.playerId ?? null;
    this.resolvePhysics(holderId);
    this.updateReferee();
  }

  /** Inject a pre-determined match event (goal/save/miss) into the live simulation. */
  private injectMatchEvent() {
    if (!this.matchEvent) return;

    const attacker = this.matchEvent.teamId === this.homeTeamId ? this.homeTeam : this.awayTeam;
    const defender = this.matchEvent.teamId === this.homeTeamId ? this.awayTeam : this.homeTeam;
    const goal = goalFor(attacker.isHome);
    const shooter = attacker.players.reduce((c, p) =>
      I.distance(p.currentCoord, this.ball.current) < I.distance(c.currentCoord, this.ball.current) ? p : c,
    );

    shooter.currentCoord = { ...this.ball.current };
    const shotFrom = { ...this.ball.current };
    const shotTo = jitter(goal, 4);

    this.currentEvent = {
      action: 'shot',
      fromPlayerId: shooter.playerId,
      toPlayerId: null,
      ballFrom: shotFrom,
      ballTo: shotTo,
      playerFrom: { ...shotFrom },
      playerTo: { ...shotTo },
      description: `${shooter.name} finaliza para o gol!`,
      durationMs: actionDuration('shot', I.distance(shotFrom, shotTo)),
      minute: this.minute,
    };
    this.eventLog.push({ desc: this.currentEvent.description, action: 'shot' });

    this.ball.previous = { ...shotFrom };
    this.ball.current = { ...shotTo };
    this.prevBallHeight = 0;
    this.ballHeight = maxHeightForAction('shot');
    this.ball.previousHeight = 0;
    this.ball.currentHeight = this.ballHeight;

    const shooterIdx = this.players.findIndex(p => p.playerId === shooter.playerId);
    if (shooterIdx >= 0) {
      this.players[shooterIdx].previous = { ...shotFrom };
      this.players[shooterIdx].current = { ...shotTo };
    }

    if (this.matchEvent.type === 'goal' || this.matchEvent.type === 'penalty_goal') {
      this.currentEvent = {
        action: 'goal', fromPlayerId: shooter.playerId, toPlayerId: null,
        ballFrom: { ...shotTo }, ballTo: { ...shotTo },
        description: this.matchEvent.description, durationMs: 1800, minute: this.minute,
      };
      this.eventLog.push({ desc: this.matchEvent.description, action: 'goal' });
      attacker.goals++;
    } else if (this.matchEvent.type === 'save') {
      const keeper = defender.players.find(p => p.position === 'GOL') ?? defender.players[0];
      this.currentEvent = {
        action: 'save', fromPlayerId: keeper.playerId, toPlayerId: null,
        ballFrom: { ...shotTo }, ballTo: { ...shotTo },
        description: this.matchEvent.description, durationMs: 1200, minute: this.minute,
      };
      this.eventLog.push({ desc: this.matchEvent.description, action: 'save' });
      keeper.currentCoord = { ...shotTo };
      keeper.state = 'carrying';
      attacker.hasPossession = false;
      defender.hasPossession = true;
    } else if (this.matchEvent.type === 'miss' || this.matchEvent.type === 'penalty_miss') {
      this.currentEvent = {
        action: 'shot', fromPlayerId: shooter.playerId, toPlayerId: null,
        ballFrom: { ...shotFrom }, ballTo: { ...shotTo },
        description: this.matchEvent.description,
        durationMs: actionDuration('shot', I.distance(shotFrom, shotTo)), minute: this.minute,
      };
      this.eventLog.push({ desc: this.matchEvent.description, action: 'shot' });
    } else if (this.matchEvent.type === 'own_goal') {
      this.currentEvent = {
        action: 'goal', fromPlayerId: shooter.playerId, toPlayerId: null,
        ballFrom: { ...shotTo }, ballTo: goalFor(attacker.isHome),
        description: this.matchEvent.description, durationMs: 1800, minute: this.minute,
      };
      this.eventLog.push({ desc: this.matchEvent.description, action: 'goal' });
      defender.goals++;
    }

    this.homeTeam.phase = detectTeamPhase(this.homeTeam.hasPossession, this.homeTeam.phase, this.ball.current.x, true);
    this.awayTeam.phase = detectTeamPhase(this.awayTeam.hasPossession, this.awayTeam.phase, this.ball.current.x, false);
  }

  /** Update referee position to follow the ball with safe offset. */
  private updateReferee() {
    const REFEREE_OFFSET = 12.0;
    const REFEREE_LERP = 0.06;
    const ballPos = this.ball.current;
    const refToBall = { x: ballPos.x - this.refereePos.x, y: ballPos.y - this.refereePos.y };
    const refToBallDist = Math.hypot(refToBall.x, refToBall.y);

    if (refToBallDist > 0) {
      if (refToBallDist < REFEREE_OFFSET) {
        const pushDir = { x: -refToBall.x / refToBallDist, y: -refToBall.y / refToBallDist };
        const pushAmount = (REFEREE_OFFSET - refToBallDist) * 0.15;
        this.refereePos.x = I.clamp(this.refereePos.x + pushDir.x * pushAmount, 1, 99);
        this.refereePos.y = I.clamp(this.refereePos.y + pushDir.y * pushAmount, 1, 99);
      } else {
        this.refereePos.x = I.lerp(this.refereePos.x, ballPos.x, REFEREE_LERP);
        this.refereePos.y = I.lerp(this.refereePos.y, ballPos.y, REFEREE_LERP);
      }
    }
  }

  /**
   * Sistema de resolução física — camada separada e independente da tática.
   * Trata todas as entidades (jogadores + árbitro) como corpos sólidos com raio.
   * Resolve sobreposições iterativamente até convergência.
   */
  private resolvePhysics(holderId: string | null) {
    // Raios corporais por tipo de entidade
    const BODY_RADIUS = {
      GOL: 2.0,
      FIELD: 2.5,   // jogadores de linha
      REFEREE: 2.0,
    };

    // Distância mínima entre dois corpos = soma dos raios + margem de segurança
    const SAFETY_MARGIN = 1.5;

    // Coleta todas as entidades em uma lista unificada para resolução par-a-par
    interface PhysicsBody {
      x: number;
      y: number;
      radius: number;
      isKeeper: boolean;
      isReferee: boolean;
      playerId: string;
    }

    const bodies: PhysicsBody[] = this.players.map(p => ({
      x: p.current.x,
      y: p.current.y,
      radius: p.position === 'GOL' ? BODY_RADIUS.GOL : BODY_RADIUS.FIELD,
      isKeeper: p.position === 'GOL',
      isReferee: false,
      playerId: p.playerId,
    }));

    // Adiciona o árbitro como entidade física
    bodies.push({
      x: this.refereePos.x,
      y: this.refereePos.y,
      radius: BODY_RADIUS.REFEREE,
      isKeeper: false,
      isReferee: true,
      playerId: '__referee__',
    });

    // Iterações de resolução — convergência garantida com 5 passos
    const ITERATIONS = 5;
    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const minDist = a.radius + b.radius + SAFETY_MARGIN;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            // Goleiro é âncora — não é deslocado, apenas o outro corpo se afasta
            if (a.isKeeper && b.isKeeper) continue;
            if (a.isKeeper) {
              b.x = I.clamp(b.x - nx * overlap, 1, 99);
              b.y = I.clamp(b.y - ny * overlap, 1, 99);
            } else if (b.isKeeper) {
              a.x = I.clamp(a.x + nx * overlap, 1, 99);
              a.y = I.clamp(a.y + ny * overlap, 1, 99);
            } else {
              // Divisão simétrica — cada corpo se afasta metade da sobreposição
              const half = overlap * 0.5;
              a.x = I.clamp(a.x + nx * half, 1, 99);
              a.y = I.clamp(a.y + ny * half, 1, 99);
              b.x = I.clamp(b.x - nx * half, 1, 99);
              b.y = I.clamp(b.y - ny * half, 1, 99);
            }
          }
        }
      }
    }

    // Escreve posições resolvidas de volta aos jogadores
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].current.x = bodies[i].x;
      this.players[i].current.y = bodies[i].y;
    }

    // Escreve posição resolvida do árbitro
    const refBody = bodies[bodies.length - 1];
    this.refereePos.x = refBody.x;
    this.refereePos.y = refBody.y;

    // === LIMITE RÍGIDO DE JOGADORES PRÓXIMOS À BOLA ===
    // Máximo 3 jogadores por time dentro de 8 unidades da bola.
    // Excedentes são empurrados para fora progressivamente.
    const BALL_ZONE_RADIUS = 8.0;
    const MAX_PER_TEAM_NEAR_BALL = 3;
    const PUSH_FORCE = 3.0;

    const ball = this.ball.current;
    const homeNear: { idx: number; dist: number }[] = [];
    const awayNear: { idx: number; dist: number }[] = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.position === 'GOL') continue;
      if (p.playerId === holderId) continue; // titular da bola sempre pode ficar
      const d = Math.hypot(p.current.x - ball.x, p.current.y - ball.y);
      if (d < BALL_ZONE_RADIUS) {
        if (i < this.homeCount) homeNear.push({ idx: i, dist: d });
        else awayNear.push({ idx: i, dist: d });
      }
    }

    // Ordena por distância — os mais próximos ficam, os mais distantes são empurrados
    homeNear.sort((a, b) => a.dist - b.dist);
    awayNear.sort((a, b) => a.dist - b.dist);

    const pushExcess = (list: { idx: number; dist: number }[], maxAllowed: number) => {
      for (let k = maxAllowed; k < list.length; k++) {
        const p = this.players[list[k].idx];
        const dx = p.current.x - ball.x;
        const dy = p.current.y - ball.y;
        const d = Math.hypot(dx, dy);
        if (d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          // Empurrão progressivo — quanto mais excedentes, mais forte
          const excess = list.length - maxAllowed;
          const force = PUSH_FORCE * (1 + excess * 0.5);
          p.current.x = I.clamp(p.current.x + nx * force, 1, 99);
          p.current.y = I.clamp(p.current.y + ny * force, 1, 99);
        }
      }
    };

    pushExcess(homeNear, MAX_PER_TEAM_NEAR_BALL);
    pushExcess(awayNear, MAX_PER_TEAM_NEAR_BALL);

    // Re-executa resolução física rápida (2 iterações) após o empurrão da zona da bola
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.players.length; i++) {
        if (this.players[i].position === 'GOL') continue;
        for (let j = i + 1; j < this.players.length; j++) {
          if (this.players[j].position === 'GOL') continue;
          const a = this.players[i];
          const b = this.players[j];
          const minDist = BODY_RADIUS.FIELD * 2 + SAFETY_MARGIN;
          const dx = a.current.x - b.current.x;
          const dy = a.current.y - b.current.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const half = overlap * 0.5;
            a.current.x = I.clamp(a.current.x + nx * half, 1, 99);
            a.current.y = I.clamp(a.current.y + ny * half, 1, 99);
            b.current.x = I.clamp(b.current.x - nx * half, 1, 99);
            b.current.y = I.clamp(b.current.y - ny * half, 1, 99);
          }
        }
      }
    }

    // Afastamento suave da bola para não-titulares
    const BALL_CLEAR_DIST = 3.0;
    const BALL_CLEAR_PUSH = 0.6;
    for (const p of this.players) {
      if (p.playerId === holderId || p.position === 'GOL') continue;
      const dx = p.current.x - this.ball.current.x;
      const dy = p.current.y - this.ball.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < BALL_CLEAR_DIST) {
        const nx = dx / dist;
        const ny = dy / dist;
        const force = (BALL_CLEAR_DIST - dist) * BALL_CLEAR_PUSH;
        p.current.x = I.clamp(p.current.x + nx * force, 1, 99);
        p.current.y = I.clamp(p.current.y + ny * force, 1, 99);
      }
    }
  }
}
