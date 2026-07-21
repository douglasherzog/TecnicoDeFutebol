import { describe, it, expect } from 'vitest';
import { simulateMinuteWithMetrics } from './minuteSimulator';
import { buildPlayers } from '../pitchEngine';
import type { Team } from '../../types';
import type { PlayStep } from '../pitchEngine';

function createTeam(id: string, approach: string = 'balanced'): Team {
  const positions = ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'] as const;
  return {
    id,
    name: `Time ${id}`,
    shortName: id.toUpperCase(),
    colors: { primary: '#3b82f6', secondary: '#ffffff' },
    squad: positions.map((position, index) => ({
      id: `${id}-${index}`,
      name: `Jogador ${id} ${index}`,
      age: 25,
      position,
      overall: 70,
      potential: 75,
      stamina: 80,
      salary: 1000,
      marketValue: 10000,
      contractYears: 2,
      morale: 70,
    })),
    tactics: { formation: '4-3-3', approach: approach as any },
    budget: 0,
  } as unknown as Team;
}

describe('Continuidade e repertorio ofensivo', () => {
  it('gera sequencias com continuidade de bola (ballTo == ballFrom do proximo)', () => {
    const home = createTeam('home', 'attacking');
    const away = createTeam('away', 'balanced');
    const players = buildPlayers(home, away);

    let ballPos: { x: number; y: number } | null = null;
    let discontinuities = 0;
    let totalSteps = 0;
    let allSteps: PlayStep[] = [];

    for (let minute = 1; minute <= 5; minute++) {
      const { steps } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'attacking', 'balanced', null, ballPos,
      );
      allSteps = allSteps.concat(steps);
      totalSteps += steps.length;

      // Verifica continuidade dentro do minuto
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1];
        const curr = steps[i];
        const dist = Math.hypot(prev.ballTo.x - curr.ballFrom.x, prev.ballTo.y - curr.ballFrom.y);
        if (dist > 10) {
          discontinuities++;
        }
      }

      if (steps.length > 0) {
        ballPos = steps[steps.length - 1].ballTo;
      }
    }

    // Deve gerar um numero razoavel de steps
    expect(totalSteps).toBeGreaterThan(10);

    // Discontinuidades devem ser minoritárias (< 40%)
    const continuityRate = 1 - discontinuities / Math.max(1, totalSteps - 5);
    expect(continuityRate).toBeGreaterThan(0.6);
  });

  it('gera repertorio diversificado de acoes (pass, carry, dribble, tabela, shot)', () => {
    const home = createTeam('home', 'attacking');
    const away = createTeam('away', 'balanced');
    const players = buildPlayers(home, away);

    let ballPos: { x: number; y: number } | null = null;
    const actionTypes = new Set<string>();
    let allSteps: PlayStep[] = [];

    for (let minute = 1; minute <= 20; minute++) {
      const { steps } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'attacking', 'defensive', null, ballPos,
      );
      allSteps = allSteps.concat(steps);
      for (const s of steps) {
        actionTypes.add(s.action);
      }
      if (steps.length > 0) {
        ballPos = steps[steps.length - 1].ballTo;
      }
    }

    // Deve ter pelo menos 4 tipos diferentes de acao
    expect(actionTypes.size).toBeGreaterThanOrEqual(4);

    // Deve incluir passe (acao fundamental)
    expect(actionTypes.has('pass')).toBe(true);
  });

  it('gera sequencias ofensivas de 3+ acoes conectadas', () => {
    const home = createTeam('home', 'attacking');
    const away = createTeam('away', 'balanced');
    const players = buildPlayers(home, away);

    let ballPos: { x: number; y: number } | null = null;
    let allSteps: PlayStep[] = [];

    for (let minute = 1; minute <= 20; minute++) {
      const { steps } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'attacking', 'balanced', null, ballPos,
      );
      allSteps = allSteps.concat(steps);
      if (steps.length > 0) {
        ballPos = steps[steps.length - 1].ballTo;
      }
    }

    // Contar sequencias ofensivas (3+ acoes do mesmo time sem perda de posse)
    let maxSequence = 0;
    let currentSequence = 0;
    let currentTeam: string | null = null;

    for (const step of allSteps) {
      // Determinar time da acao (simplificado: se fromPlayerId comeca com "home" ou "away")
      const isHome = step.fromPlayerId.startsWith('home');
      const team = isHome ? 'home' : 'away';

      // Acoes que mantem posse
      const possessionActions = ['pass', 'long_pass', 'cross', 'carry', 'dribble', 'tabela', 'build_up', 'header'];
      const lossActions = ['tackle', 'intercept', 'clearance', 'shot', 'goal', 'save'];

      if (possessionActions.includes(step.action) && team === currentTeam) {
        currentSequence++;
      } else if (lossActions.includes(step.action)) {
        if (currentSequence > maxSequence) maxSequence = currentSequence;
        currentSequence = 0;
        currentTeam = null;
      } else {
        if (currentSequence > maxSequence) maxSequence = currentSequence;
        currentSequence = 1;
        currentTeam = team;
      }
    }
    if (currentSequence > maxSequence) maxSequence = currentSequence;

    // Deve ter pelo menos uma sequencia de 3+ acoes
    expect(maxSequence).toBeGreaterThanOrEqual(3);
  });

  it('exibe exemplo de sequencia completa de jogada', () => {
    const home = createTeam('home', 'attacking');
    const away = createTeam('away', 'balanced');
    const players = buildPlayers(home, away);

    let ballPos: { x: number; y: number } | null = null;
    let bestSequence: PlayStep[] = [];
    let currentSequence: PlayStep[] = [];

    for (let minute = 1; minute <= 20; minute++) {
      const { steps } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'attacking', 'balanced', null, ballPos,
      );
      if (steps.length > 0) {
        ballPos = steps[steps.length - 1].ballTo;
      }

      for (const step of steps) {
        const possessionActions = ['pass', 'long_pass', 'cross', 'carry', 'dribble', 'tabela', 'build_up', 'header'];
        const lossActions = ['tackle', 'intercept', 'clearance', 'shot', 'goal', 'save'];

        if (possessionActions.includes(step.action)) {
          currentSequence.push(step);
        } else if (lossActions.includes(step.action)) {
          currentSequence.push(step);
          if (currentSequence.length > bestSequence.length) {
            bestSequence = [...currentSequence];
          }
          currentSequence = [];
        } else {
          if (currentSequence.length > bestSequence.length) {
            bestSequence = [...currentSequence];
          }
          currentSequence = [];
        }
      }
    }

    expect(bestSequence.length).toBeGreaterThanOrEqual(3);
  });
});
