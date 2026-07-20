import type { PlayStep, PlayerOnPitch, PitchCoord, PlayAction } from './pitchEngine';
import * as I from './interpolation';
import {
  computeKeeperTarget,
  computeTacticalTarget,
  detectTeamPhase,
  enrichPlayers,
} from './tactical/ai';
import { styleFromApproach } from './tactical/minuteSimulator';
import { DEFAULT_TACTICAL_CONFIG, type TacticalConfig, type TeamState, type TacticalPlayer } from './tactical/types';

/** Configurable simulation constants. Tune these for feel. */
export const SIMULATION_CONFIG = {
  /** Logic ticks per second. 10-15 recommended. Lower = more stable; higher = snappier. */
  TICK_RATE: 12,
  /** Vertical scaling applied to pitch Y when rendering on the 2D view. */
  Y_SCALE: 0.64,
  /** Ball base radius in SVG units. */
  BALL_BASE_RADIUS: 1.0,
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

interface StepCache {
  control: PitchCoord;
  height: number;
  side: number;
}

export interface SimulationRefs {
  ball: SVGCircleElement | null;
  shadow: SVGEllipseElement | null;
  trail: SVGLineElement | null;
  goalFlash: SVGCircleElement | null;
  saveFlash: SVGCircleElement | null;
  players: Record<
    string,
    { dot: SVGCircleElement | null; outline: SVGCircleElement | null; dir: SVGLineElement | null } | undefined
  >;
}

function curveFactorForAction(action: PlayAction): number {
  switch (action) {
    case 'long_pass':
    case 'throw_in':
    case 'corner':
      return 0.35;
    case 'cross':
    case 'header':
      return 0.22;
    case 'shot':
      return 0.05;
    case 'clearance':
      return 0.15;
    case 'pass':
      return 0.12;
    default:
      return 0.04;
  }
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
      return 2.5;
    case 'dribble':
    case 'carry':
      return 0.6;
    default:
      return 0;
  }
}

// Player positioning is now unified with the tactical AI via computeTacticalTarget() and computeKeeperTarget().

export class MatchSimulation {
  private plays: PlayStep[];
  private players: SimPlayer[];
  private ball: SimBall;
  private speed: number;
  private stepIndex = 0;
  private stepStartTime = 0;
  private logicTime = 0;
  private stepCache: StepCache | null = null;
  private done = false;
  private homeTeam: TeamState;
  private awayTeam: TeamState;
  private cfg: TacticalConfig;
  private homeCount: number;

  constructor(
    plays: PlayStep[],
    homePlayers: PlayerOnPitch[],
    awayPlayers: PlayerOnPitch[],
    speed = 1,
    homeApproach = 'balanced',
    awayApproach = 'balanced',
    cfg: TacticalConfig = DEFAULT_TACTICAL_CONFIG,
  ) {
    this.plays = plays;
    this.speed = speed;
    this.cfg = cfg;

    const homeTactical = enrichPlayers(homePlayers);
    const awayTactical = enrichPlayers(awayPlayers);

    this.homeTeam = {
      players: homeTactical,
      isHome: true,
      style: styleFromApproach(homeApproach),
      phase: 'attacking_organized',
      hasPossession: true,
      lastPhase: 'attacking_organized',
      goals: 0,
    };
    this.awayTeam = {
      players: awayTactical,
      isHome: false,
      style: styleFromApproach(awayApproach),
      phase: 'defending_organized',
      hasPossession: false,
      lastPhase: 'defending_organized',
      goals: 0,
    };

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

    const startPos = plays.length > 0 ? { ...plays[0].ballFrom } : { x: 50, y: 50 };
    this.ball = {
      previous: startPos,
      current: startPos,
      previousHeight: 0,
      currentHeight: 0,
    };

    if (this.plays.length > 0) {
      this.stepCache = this.computeStepCache(this.plays[0]);
    }
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  getCurrentPlay(): PlayStep | null {
    return this.plays[this.stepIndex] ?? null;
  }

  getCurrentStepIndex(): number {
    return this.stepIndex;
  }

  isDone(): boolean {
    return this.done;
  }

  getTickIntervalMs(): number {
    return TICK_INTERVAL_MS;
  }

  /** Advance simulation by one fixed timestep. `dtMs` is real elapsed time since last tick. */
  tick(dtMs: number) {
    if (this.done || this.plays.length === 0) return;

    const step = this.plays[this.stepIndex];
    const stepDuration = step.durationMs;
    this.logicTime += dtMs * this.speed;

    while (this.logicTime - this.stepStartTime >= stepDuration) {
      this.stepStartTime += stepDuration;
      this.stepIndex++;
      if (this.stepIndex >= this.plays.length) {
        this.done = true;
        return;
      }
      this.stepCache = this.computeStepCache(this.plays[this.stepIndex]);
    }

    this.updateBallAndPlayers(dtMs * this.speed / 1000);
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

    const step = this.plays[this.stepIndex];
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
        ref.dot.setAttribute('r', (p.position === 'GOL' ? 2.4 : 2.0).toFixed(2));
      } else if (p.position === 'GOL') {
        ref.dot.setAttribute('r', '2.2');
      } else {
        ref.dot.setAttribute('r', '1.8');
      }
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

  private computeStepCache(step: PlayStep): StepCache {
    const side = Math.sin(this.stepIndex * 123.456) > 0 ? 1 : -1;
    const height = maxHeightForAction(step.action);
    const control = I.bezierControlPoint(
      step.ballFrom,
      step.ballTo,
      curveFactorForAction(step.action),
      side,
    );
    return { control, height, side };
  }

  private updateBallAndPlayers(dt: number) {
    const step = this.plays[this.stepIndex];
    if (!step || !this.stepCache) return;

    const stepElapsed = this.logicTime - this.stepStartTime;
    const rawProgress = step.durationMs > 0 ? stepElapsed / step.durationMs : 1;
    const progress = I.clamp(rawProgress, 0, 1);
    const eased = I.easeInOutQuad(progress);

    const flight = I.computeBallFlight(
      step.ballFrom,
      step.ballTo,
      this.stepCache.control,
      eased,
      this.stepCache.height,
    );

    this.ball.previous = this.ball.current;
    this.ball.current = flight.position;
    this.ball.previousHeight = this.ball.currentHeight;
    this.ball.currentHeight = flight.height;

    const holderId = step.toPlayerId;

    // Update team phases based on ball position
    this.homeTeam.phase = detectTeamPhase(this.homeTeam.hasPossession, this.homeTeam.phase, this.ball.current.x, true);
    this.awayTeam.phase = detectTeamPhase(this.awayTeam.hasPossession, this.awayTeam.phase, this.ball.current.x, false);

    // Sync tactical player positions with sim player positions
    for (const p of this.players) {
      p.currentCoord = { ...p.current };
    }

    for (const p of this.players) {
      let target: PitchCoord;
      if (p.playerId === holderId && step.playerTo) {
        const from = step.playerFrom ?? step.ballFrom;
        target = I.lerpCoord(from, step.playerTo, eased);
      } else {
        const team = p === this.players[this.homeCount - 1] || this.players.indexOf(p) < this.homeCount ? this.homeTeam : this.awayTeam;
        if (p.position === 'GOL') {
          target = computeKeeperTarget(p, team, this.ball.current, team.isHome);
        } else {
          target = computeTacticalTarget(p, team, this.ball.current);
        }
      }

      const maxSpeed = SIMULATION_CONFIG.ROLE_SPEED[p.position];
      const maxForce = maxSpeed * 3.5;

      const result = I.integrateSteering(p.current, p.simVelocity, target, dt, maxSpeed, maxForce);

      p.previous = p.current;
      p.current = result.position;
      p.simVelocity = result.velocity;

      const speed = I.magnitude(p.simVelocity);
      let newAngle = p.currentAngle;
      if (speed > 1) {
        newAngle = Math.atan2(p.simVelocity.y, p.simVelocity.x);
      }
      p.previousAngle = p.currentAngle;
      p.currentAngle = newAngle;
    }
  }
}
