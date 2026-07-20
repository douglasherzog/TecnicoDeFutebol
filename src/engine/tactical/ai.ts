import type { PitchCoord, PlayerOnPitch } from '../pitchEngine';
import * as I from '../interpolation';
import type {
  DecisionOption,
  PlayerAIState,
  PlayerAttributes,
  TacticalConfig,
  TacticalPlayer,
  TacticalStyle,
  TeamPhase,
  TeamState,
} from './types';

// ---- Atributos ----------------------------------------------------------------

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return Math.abs(h) % 1000;
}

export function generateAttributes(position: string, name: string): PlayerAttributes {
  const base = hashName(name);
  const noise = () => (base % 20) + Math.random() * 15;
  const clamp100 = (v: number) => I.clamp(v, 0, 100);

  const roleBase: Record<string, Partial<PlayerAttributes>> = {
    GOL: { technique: 55, passing: 55, vision: 45, speed: 40, strength: 60, tackling: 25, composure: 70, energy: 80 },
    ZAG: { technique: 50, passing: 55, vision: 50, speed: 50, strength: 70, tackling: 75, composure: 60, energy: 75 },
    LAT: { technique: 60, passing: 65, vision: 55, speed: 75, strength: 55, tackling: 60, composure: 55, energy: 80 },
    VOL: { technique: 60, passing: 70, vision: 65, speed: 65, strength: 70, tackling: 75, composure: 65, energy: 75 },
    MEI: { technique: 75, passing: 75, vision: 80, speed: 65, strength: 45, tackling: 35, composure: 70, energy: 70 },
    ATA: { technique: 75, passing: 60, vision: 60, speed: 75, strength: 50, tackling: 20, composure: 55, energy: 70 },
  };

  const r = roleBase[position] ?? roleBase.MEI;
  return {
    technique: clamp100((r.technique ?? 60) + noise()),
    passing: clamp100((r.passing ?? 60) + noise()),
    vision: clamp100((r.vision ?? 60) + noise()),
    speed: clamp100((r.speed ?? 60) + noise()),
    strength: clamp100((r.strength ?? 60) + noise()),
    tackling: clamp100((r.tackling ?? 60) + noise()),
    composure: clamp100((r.composure ?? 60) + noise()),
    energy: clamp100((r.energy ?? 75) - Math.random() * 15),
  };
}

export function enrichPlayers(players: PlayerOnPitch[]): TacticalPlayer[] {
  return players.map(p => ({
    ...p,
    attributes: generateAttributes(p.position, p.name),
    state: 'positioning',
    targetPos: { ...p.currentCoord },
    velocity: { x: 0, y: 0 },
    cooldown: 0,
  }));
}

// ---- Formação / Zonas táticas -------------------------------------------------

function rolePhaseOffset(
  position: string,
  phase: TeamPhase,
  style: TacticalStyle,
  isHome: boolean,
): PitchCoord {
  const dir = isHome ? 1 : -1;

  // offsets em coordenadas relativas ao centro; x positivo = frente, y = lateral
  const offsets: Record<string, Partial<Record<TeamPhase, PitchCoord>>> = {
    GOL: {
      defending_organized: { x: -2, y: 0 },
      defending_transition: { x: 0, y: 0 },
      attacking_organized: { x: 2, y: 0 },
      attacking_transition: { x: 2, y: 0 },
    },
    ZAG: {
      defending_organized: { x: -6, y: 0 },
      defending_transition: { x: -3, y: 0 },
      attacking_organized: { x: 6, y: 0 },
      attacking_transition: { x: 3, y: 0 },
    },
    LAT: {
      defending_organized: { x: -4, y: 0 },
      defending_transition: { x: -2, y: 4 },
      attacking_organized: { x: 8 * style.attackingWidth, y: 10 },
      attacking_transition: { x: 6 * style.counterAttack, y: 7 },
    },
    VOL: {
      defending_organized: { x: -5, y: 0 },
      defending_transition: { x: -2, y: 0 },
      attacking_organized: { x: 6, y: 0 },
      attacking_transition: { x: 5, y: 0 },
    },
    MEI: {
      defending_organized: { x: -2, y: 0 },
      defending_transition: { x: 1, y: 0 },
      attacking_organized: { x: 10, y: 0 },
      attacking_transition: { x: 8 * style.counterAttack, y: 0 },
    },
    ATA: {
      defending_organized: { x: -1, y: 0 },
      defending_transition: { x: 4 * style.counterAttack, y: 0 },
      attacking_organized: { x: 14, y: 0 },
      attacking_transition: { x: 11 * style.counterAttack, y: 0 },
    },
  };

  const raw = offsets[position]?.[phase] ?? { x: 0, y: 0 };
  return { x: raw.x * dir, y: raw.y };
}

/** Limites rígidos de zona por posição (em coordenadas do pitch).
 * maxForward: até onde pode avançar além da base.x no sentido do ataque.
 * maxBack: até onde pode recuar além da base.x.
 * maxLateral: quanto pode se afastar lateralmente da base.y.
 */
const ROLE_ZONE_LIMITS: Record<string, { maxForward: number; maxBack: number; maxLateral: number }> = {
  GOL: { maxForward: 6, maxBack: 2, maxLateral: 12 },
  ZAG: { maxForward: 14, maxBack: 8, maxLateral: 16 },
  LAT: { maxForward: 28, maxBack: 8, maxLateral: 18 },
  VOL: { maxForward: 22, maxBack: 14, maxLateral: 20 },
  MEI: { maxForward: 30, maxBack: 18, maxLateral: 22 },
  ATA: { maxForward: 38, maxBack: 22, maxLateral: 24 },
};

export function zoneBoundsFor(p: TacticalPlayer, isHome: boolean): { minX: number; maxX: number; minY: number; maxY: number } {
  const limits = ROLE_ZONE_LIMITS[p.position] ?? { maxForward: 25, maxBack: 15, maxLateral: 20 };
  const base = p.baseCoord;
  const forward = isHome ? limits.maxForward : limits.maxBack;
  const back = isHome ? limits.maxBack : limits.maxForward;
  return {
    minX: I.clamp(base.x - back, 1, 99),
    maxX: I.clamp(base.x + forward, 1, 99),
    minY: I.clamp(base.y - limits.maxLateral, 1, 99),
    maxY: I.clamp(base.y + limits.maxLateral, 1, 99),
  };
}

export function computeTacticalTarget(
  p: TacticalPlayer,
  team: TeamState,
  ball: PitchCoord,
): PitchCoord {
  const base = p.baseCoord;
  const offset = rolePhaseOffset(p.position, team.phase, team.style, team.isHome);
  const bounds = zoneBoundsFor(p, team.isHome);

  // Alvo tático de referência = base ajustada pelo momento do jogo
  let tx = I.clamp(base.x + offset.x, bounds.minX, bounds.maxX);
  let ty = I.clamp(base.y + offset.y, bounds.minY, bounds.maxY);

  // Atração pela bola: meio-campistas e volantes atraem mais quando a bola está
  // defensiva, criando linhas de passe obrigatórias na saída de bola.
  let ballAttraction = 0.06;
  if (p.position === 'ATA') ballAttraction = 0.10;
  else if (p.position === 'VOL' || p.position === 'MEI') ballAttraction = 0.12;

  // Se a bola está no setor defensivo do time, o meio-campo sobe para receber
  const ballInOwnHalf = team.isHome ? ball.x < 50 : ball.x > 50;
  if (ballInOwnHalf && (p.position === 'VOL' || p.position === 'MEI')) {
    ballAttraction += 0.06;
  }

  const finalTarget = I.lerpCoord(
    { x: tx, y: ty },
    { x: I.clamp(ball.x, bounds.minX, bounds.maxX), y: I.clamp(ball.y, bounds.minY, bounds.maxY) },
    Math.min(0.30, ballAttraction),
  );

  return {
    x: I.clamp(finalTarget.x, bounds.minX, bounds.maxX),
    y: I.clamp(finalTarget.y, bounds.minY, bounds.maxY),
  };
}

export function computeKeeperTarget(
  _p: TacticalPlayer,
  _team: TeamState,
  ball: PitchCoord,
  isHome: boolean,
): PitchCoord {
  const goalX = isHome ? 3 : 97;
  const minX = isHome ? 0 : 88;
  const maxX = isHome ? 12 : 100;
  const minY = 14;
  const maxY = 86; // em coordenadas 100x100, mas viewBox é 64 de altura; clamp visual em 1-99

  // Goleiro acompanha a projeção da bola no eixo Y, mas fica colado à linha de gol
  const idealY = I.clamp(ball.y, 28, 72); // altura do gol em coordenadas pitch
  const idealX = goalX + (isHome ? 1 : -1);

  return {
    x: I.clamp(idealX, minX, maxX),
    y: I.clamp(idealY, minY, maxY),
  };
}

// ---- Fases do jogo ------------------------------------------------------------

export function detectTeamPhase(
  hasPossession: boolean,
  prevPhase: TeamPhase,
  ballX: number,
  isHome: boolean,
): TeamPhase {
  const inOwnHalf = isHome ? ballX < 45 : ballX > 55;
  const inAttackThird = isHome ? ballX > 68 : ballX < 32;
  const inFinalThird = isHome ? ballX > 82 : ballX < 18;

  if (hasPossession) {
    // Se acabamos de recuperar a bola, estamos em transição ofensiva até chegar no meio/ataque
    if (prevPhase.startsWith('defending')) return 'attacking_transition';
    // Com posse no próprio campo: saída de bola controlada
    if (inOwnHalf) return 'attacking_organized';
    // No meio-campo ou ataque: transição até chegar ao terço final
    if (!inAttackThird) return 'attacking_transition';
    // Só é ataque posicionado quando a bola chega ao terço final
    return 'attacking_organized';
  }

  // Sem posse: se perdemos a bola lá na frente, precisamos voltar em transição
  if (prevPhase.startsWith('attacking')) return 'defending_transition';
  // Se o adversário já chegou ao nosso terço final, defesa organizada; senão, transição defensiva
  return inFinalThird ? 'defending_organized' : 'defending_transition';
}

// ---- Transições de estado -----------------------------------------------------

export function transitionPlayerState(p: TacticalPlayer, team: TeamState, ball: PitchCoord, nearestOpponent: TacticalPlayer | null): PlayerAIState {
  if (p.state === 'carrying' || p.state === 'dribbling') return p.state;

  if (p.position === 'GOL') return 'goalkeeping';

  const distBall = I.distance(p.currentCoord, ball);

  if (nearestOpponent && I.distance(p.currentCoord, nearestOpponent.currentCoord) < 6 && !team.hasPossession) {
    return Math.random() < 0.6 ? 'pressing' : 'marking';
  }

  if (!team.hasPossession && distBall < 10 && p.position !== 'ATA') {
    return 'pressing';
  }

  if (team.hasPossession && distBall < 18) {
    return 'supporting';
  }

  if (team.phase === 'attacking_transition' && (p.position === 'ATA' || p.position === 'LAT')) {
    return 'making_run';
  }

  if (!team.hasPossession && p.position === 'ZAG') {
    return 'covering';
  }

  return 'positioning';
}

// ---- Scoring de decisões ------------------------------------------------------

function isFree(target: TacticalPlayer, opponents: TacticalPlayer[], distance: number): boolean {
  return !opponents.some(o => I.distance(o.currentCoord, target.currentCoord) < distance);
}

export function defenderPressure(pos: PitchCoord, opponents: TacticalPlayer[]): number {
  const nearest = opponents.reduce((min, o) => Math.min(min, I.distance(o.currentCoord, pos)), Infinity);
  return Math.max(0, 12 - nearest);
}

// ---- Auxiliares de decisão ----------------------------------------------------

/** Verifica se a coordenada está no terço final ofensivo. */
function inFinalThird(pos: PitchCoord, isHome: boolean): boolean {
  return isHome ? pos.x > 70 : pos.x < 30;
}

/** Verifica se a coordenada está no próprio campo. */
function inOwnHalf(pos: PitchCoord, isHome: boolean): boolean {
  return isHome ? pos.x < 50 : pos.x > 50;
}

/** Quantos oponentes estão entre o portador e o alvo (aproximado). */
function opponentsBetween(from: PitchCoord, to: PitchCoord, opponents: TacticalPlayer[]): number {
  const count = opponents.filter(o => I.distanceToSegment(o.currentCoord, from, to) < 4).length;
  return count;
}

/** Pontua a qualidade da distância de passe: ideal = [min, max], penaliza muito curto ou muito longo. */
function passDistanceScore(distance: number, cfg: TacticalConfig): number {
  if (distance < cfg.idealPassMin) return -12 + (distance - cfg.idealPassMin) * 0.5;
  if (distance > cfg.idealPassMax) return Math.max(-25, -(distance - cfg.idealPassMax) * 1.5);
  // distância ideal: bônus no centro da faixa
  const center = (cfg.idealPassMin + cfg.idealPassMax) / 2;
  const deviation = Math.abs(distance - center);
  const best = 12;
  return best - deviation * 0.8;
}

export function scoreOnBallDecision(
  holder: TacticalPlayer,
  teammates: TacticalPlayer[],
  opponents: TacticalPlayer[],
  goal: PitchCoord,
  isHome: boolean,
  style: TacticalStyle,
  cfg: TacticalConfig,
): DecisionOption[] {
  const options: DecisionOption[] = [];
  const ball = holder.currentCoord;
  const distToGoal = I.distance(ball, goal);
  const pressure = defenderPressure(ball, opponents);
  const ownField = inOwnHalf(ball, isHome);

  // 1. Chute -----------------------------------------------------------
  const shotAngle = Math.abs(ball.y - 50) < 32 ? 1 : 0.35;
  // Só finaliza de forma efetiva se estiver no terço final e dentro da distâncea confortável
  const inShootingZone = inFinalThird(ball, isHome) && distToGoal <= cfg.shootingDistance + 4;

  let shotScore = 0;
  if (inShootingZone) {
    shotScore =
      30 +
      (cfg.shootingDistance - distToGoal) * 1.2 +
      holder.attributes.technique * 0.15 +
      holder.attributes.composure * 0.1 +
      shotAngle * 15 -
      pressure * 3 -
      style.riskTaking * 4;
  } else {
    // Fora da zona: chute longo é fortemente desincentivado, só aceitável em desespero
    shotScore =
      -40 +
      holder.attributes.technique * 0.05 +
      (pressure > 9 ? 5 : 0) +
      (ownField ? -20 : 0) +
      style.riskTaking * 8;
  }

  options.push({
    action: 'shot',
    targetId: null,
    ballTo: goal,
    score: shotScore,
    description: `${holder.name} finaliza para o gol!`,
  });

  // 2. Passe para companheiros -----------------------------------------
  for (const t of teammates) {
    if (t.playerId === holder.playerId) continue;
    const d = I.distance(ball, t.currentCoord);
    if (d < 1.5 || d > 38) continue; // descarta toques no pé ou bolões absurdos

    const targetPressure = defenderPressure(t.currentCoord, opponents);
    const free = isFree(t, opponents, 6);
    const obstructed = opponentsBetween(ball, t.currentCoord, opponents);
    const isForward = isHome ? t.currentCoord.x > ball.x : t.currentCoord.x < ball.x;
    const targetInFinalThird = inFinalThird(t.currentCoord, isHome);

    // Bônus por manter posse com passes curtos e seguros
    let possessionBonus = 0;
    if (d >= cfg.idealPassMin && d <= cfg.idealPassMax && targetPressure < 8) {
      possessionBonus = cfg.buildUpBonus;
    }

    // Passe para trás/lateral na defesa ajuda a construir, mas deve ir para MEI/VOL de preferência
    let buildUpTargetBonus = 0;
    if (!isForward && (t.position === 'VOL' || t.position === 'MEI')) {
      buildUpTargetBonus = 6;
    }

    // Progressão frontal é recompensada só quando o alvo está bem posicionado e desmarcado
    let forwardBonus = 0;
    if (isForward) {
      forwardBonus = 8;
      if (targetInFinalThird) forwardBonus += 4;
      if (free) forwardBonus += 4;
    }

    // Ações por distância
    let action: 'pass' | 'long_pass' | 'cross' = 'pass';
    if (d > cfg.idealPassMax) action = 'long_pass';
    if (Math.abs(t.currentCoord.y - ball.y) > 18 && targetInFinalThird && t.position === 'ATA') {
      action = 'cross';
    }

    // Lançamentos longos são penalizados, a menos que o time seja muito direto
    const longPassPenalty = action === 'long_pass' ? 18 + (ownField ? 12 : 0) - style.riskTaking * 8 : 0;

    const visibility = (t.attributes.vision + holder.attributes.vision) * 0.12;
    const risk = targetPressure * 1.6 + obstructed * 6 + (free ? 0 : 5);

    const base =
      38 +
      passDistanceScore(d, cfg) +
      forwardBonus +
      buildUpTargetBonus +
      possessionBonus +
      visibility -
      risk -
      longPassPenalty;

    const typeBonus = action === 'cross' ? style.attackingWidth * 6 : 0;

    options.push({
      action,
      targetId: t.playerId,
      ballTo: t.currentCoord,
      score: base + typeBonus,
      description: `${holder.name} ${action === 'cross' ? 'cruza' : action === 'long_pass' ? 'lança' : 'passa'} para ${t.name}.`,
    });
  }

  // 3. Condução --------------------------------------------------------
  const dir = isHome ? 1 : -1;
  const carryDistance = 6;
  const carryTarget = {
    x: I.clamp(ball.x + dir * carryDistance, 1, 99),
    y: I.clamp(ball.y + (Math.random() - 0.5) * 6, 1, 99),
  };
  const carryScore =
    22 +
    holder.attributes.speed * 0.15 +
    holder.attributes.technique * 0.1 -
    pressure * 2.5 +
    (holder.position === 'MEI' || holder.position === 'ATA' ? 8 : 0) +
    (ownField ? -6 : 0) +
    style.riskTaking * 3;

  options.push({
    action: 'carry',
    targetId: null,
    ballTo: carryTarget,
    score: carryScore,
    description: `${holder.name} conduz a bola.`,
  });

  // 4. Drible curto ----------------------------------------------------
  const dribbleTarget = { x: I.clamp(ball.x + dir * 3, 1, 99), y: I.clamp(ball.y + (Math.random() - 0.5) * 8, 1, 99) };
  const dribbleScore =
    12 +
    holder.attributes.technique * 0.25 +
    (100 - pressure) * 0.15 +
    style.riskTaking * 5 -
    (holder.position === 'ZAG' ? 25 : 0) -
    (ownField ? 5 : 0);

  options.push({
    action: 'dribble',
    targetId: null,
    ballTo: dribbleTarget,
    score: dribbleScore,
    description: `${holder.name} dribla.`,
  });

  // 5. Chutão/clearance (apenas quando pressionado em campo próprio) ----
  if (ownField && pressure > 7 && (holder.position === 'GOL' || holder.position === 'ZAG' || holder.position === 'VOL')) {
    const clearTarget = {
      x: isHome ? I.clamp(ball.x + 30, 1, 99) : I.clamp(ball.x - 30, 1, 99),
      y: 35 + Math.random() * 30,
    };
    options.push({
      action: 'clearance',
      targetId: null,
      ballTo: clearTarget,
      score: -10 + style.riskTaking * 6 + (holder.position === 'GOL' ? 8 : 0),
      description: `${holder.name} afasta o perigo.`,
    });
  }

  // aleatoriedade controlada (peso reduzido para decisões mais coerentes)
  return options.map(o => ({
    ...o,
    score: o.score + (Math.random() - 0.5) * cfg.randomness * 30,
  }));
}

export function chooseBestOption(options: DecisionOption[]): DecisionOption {
  const sorted = [...options].sort((a, b) => b.score - a.score);
  // escolhe o melhor, mas permite surpresa controlada: 10% chance de pegar o segundo
  if (Math.random() < 0.1 && sorted[1]) return sorted[1];
  return sorted[0];
}

// ---- Duelos --------------------------------------------------------------------

export function resolveDuel(
  attacker: TacticalPlayer,
  defender: TacticalPlayer,
  biasToAttacker = 1.0,
): { winner: TacticalPlayer; loser: TacticalPlayer } {
  const aScore =
    (attacker.attributes.strength + attacker.attributes.composure + attacker.attributes.energy) * 0.5 +
    Math.random() * 30 * biasToAttacker;
  const dScore =
    (defender.attributes.strength + defender.attributes.tackling + defender.attributes.energy) * 0.5 +
    Math.random() * 30;
  return aScore > dScore ? { winner: attacker, loser: defender } : { winner: defender, loser: attacker };
}

export function attemptTackle(tackler: TacticalPlayer, ballHolder: TacticalPlayer): boolean {
  const chance = (tackler.attributes.tackling + tackler.attributes.strength + tackler.attributes.energy) / 3;
  const holderResist = (ballHolder.attributes.technique + ballHolder.attributes.composure + ballHolder.attributes.speed) / 3;
  const roll = Math.random() * 100 + chance - holderResist * 0.6;
  return roll > 40;
}

// ---- Movimentação sem bola -----------------------------------------------------

export function moveTowards(p: TacticalPlayer, target: PitchCoord, speed: number): void {
  const dx = target.x - p.currentCoord.x;
  const dy = target.y - p.currentCoord.y;
  const dist = I.distance(p.currentCoord, target);
  if (dist < 0.5) return;

  const move = (p.attributes.speed / 100) * speed;
  const ratio = Math.min(1, move / dist);
  p.currentCoord.x = I.clamp(p.currentCoord.x + dx * ratio, 1, 99);
  p.currentCoord.y = I.clamp(p.currentCoord.y + dy * ratio, 1, 99);
}

export function opponentTeamCenter(opponents: TacticalPlayer[]): PitchCoord {
  const x = opponents.reduce((s, p) => s + p.currentCoord.x, 0) / opponents.length;
  const y = opponents.reduce((s, p) => s + p.currentCoord.y, 0) / opponents.length;
  return { x, y };
}
