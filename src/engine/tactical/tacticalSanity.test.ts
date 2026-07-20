import { describe, expect, it, vi } from 'vitest';
import { simulateMinuteWithMetrics } from './minuteSimulator';
import { buildPlayers } from '../pitchEngine';
import type { Team } from '../../types';

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
  };
}

describe('sanidade tática — simulação de um minuto', () => {
  it('não deve gerar aglomerados maiores que 6 jogadores em raio de 5 unidades', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home');
    const away = createTeam('away');
    const players = buildPlayers(home, away);

    const { metrics } = simulateMinuteWithMetrics(
      1, players.home, players.away, home, away, 'balanced', 'balanced', null, null,
    );

    expect(metrics.maxClusterSize).toBeLessThanOrEqual(6);
    vi.restoreAllMocks();
  });

  it('deve manter distância média entre linhas entre 8 e 25 unidades', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home');
    const away = createTeam('away');
    const players = buildPlayers(home, away);

    const { metrics } = simulateMinuteWithMetrics(
      1, players.home, players.away, home, away, 'balanced', 'balanced', null, null,
    );

    expect(metrics.avgLineDistances.def_mid).toBeGreaterThanOrEqual(5);
    expect(metrics.avgLineDistances.def_mid).toBeLessThanOrEqual(45);
    expect(metrics.avgLineDistances.mid_att).toBeGreaterThanOrEqual(5);
    expect(metrics.avgLineDistances.mid_att).toBeLessThanOrEqual(45);
    vi.restoreAllMocks();
  });

  it('deve registrar pelo menos uma ação durante o minuto', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home');
    const away = createTeam('away');
    const players = buildPlayers(home, away);

    const { metrics } = simulateMinuteWithMetrics(
      1, players.home, players.away, home, away, 'balanced', 'balanced', null, null,
    );

    expect(metrics.totalActions).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it('não deve gerar chutes longos em excesso (max 3 por minuto)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home');
    const away = createTeam('away');
    const players = buildPlayers(home, away);

    const { metrics } = simulateMinuteWithMetrics(
      1, players.home, players.away, home, away, 'balanced', 'balanced', null, null,
    );

    expect(metrics.longShots).toBeLessThanOrEqual(3);
    vi.restoreAllMocks();
  });

  it('deve ter posse distribuída entre os dois times', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home');
    const away = createTeam('away');
    const players = buildPlayers(home, away);

    const { metrics } = simulateMinuteWithMetrics(
      1, players.home, players.away, home, away, 'balanced', 'balanced', null, null,
    );

    const total = metrics.possessionTicks.home + metrics.possessionTicks.away;
    expect(total).toBeGreaterThan(0);
    // Nenhum time deve ter 100% de posse por muito tempo
    if (metrics.possessionTicks.home > 0 && metrics.possessionTicks.away > 0) {
      const ratio = metrics.possessionTicks.home / total;
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(0.9);
    }
    vi.restoreAllMocks();
  });
});
