import { describe, it, vi } from 'vitest';
import { simulateMinuteWithMetrics } from './minuteSimulator';
import { buildPlayers } from '../pitchEngine';
import type { Team } from '../../types';
import type { SimulationMetrics } from './metrics';

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

function aggregateMetrics(all: SimulationMetrics[]): SimulationMetrics {
  const total = all.reduce((acc, m) => ({
    totalPossessions: acc.totalPossessions + m.totalPossessions,
    avgPassesPerPossession: acc.avgPassesPerPossession + m.avgPassesPerPossession,
    possessionTicks: {
      home: acc.possessionTicks.home + m.possessionTicks.home,
      away: acc.possessionTicks.away + m.possessionTicks.away,
    },
    ballZoneDistribution: {
      home: {
        defense: acc.ballZoneDistribution.home.defense + m.ballZoneDistribution.home.defense,
        midfield: acc.ballZoneDistribution.home.midfield + m.ballZoneDistribution.home.midfield,
        attack: acc.ballZoneDistribution.home.attack + m.ballZoneDistribution.home.attack,
      },
      away: {
        defense: acc.ballZoneDistribution.away.defense + m.ballZoneDistribution.away.defense,
        midfield: acc.ballZoneDistribution.away.midfield + m.ballZoneDistribution.away.midfield,
        attack: acc.ballZoneDistribution.away.attack + m.ballZoneDistribution.away.attack,
      },
    },
    avgLineDistances: {
      def_mid: acc.avgLineDistances.def_mid + m.avgLineDistances.def_mid,
      mid_att: acc.avgLineDistances.mid_att + m.avgLineDistances.mid_att,
      def_att: acc.avgLineDistances.def_att + m.avgLineDistances.def_att,
    },
    maxClusterSize: Math.max(acc.maxClusterSize, m.maxClusterSize),
    longShots: acc.longShots + m.longShots,
    zoneShots: acc.zoneShots + m.zoneShots,
    shortPasses: acc.shortPasses + m.shortPasses,
    longPasses: acc.longPasses + m.longPasses,
    totalActions: acc.totalActions + m.totalActions,
  }), {
    totalPossessions: 0, avgPassesPerPossession: 0,
    possessionTicks: { home: 0, away: 0 },
    ballZoneDistribution: {
      home: { defense: 0, midfield: 0, attack: 0 },
      away: { defense: 0, midfield: 0, attack: 0 },
    },
    avgLineDistances: { def_mid: 0, mid_att: 0, def_att: 0 },
    maxClusterSize: 0, longShots: 0, zoneShots: 0,
    shortPasses: 0, longPasses: 0, totalActions: 0,
  });

  const n = all.length;
  return {
    ...total,
    avgPassesPerPossession: total.avgPassesPerPossession / n,
    avgLineDistances: {
      def_mid: total.avgLineDistances.def_mid / n,
      mid_att: total.avgLineDistances.mid_att / n,
      def_att: total.avgLineDistances.def_att / n,
    },
    ballZoneDistribution: {
      home: {
        defense: total.ballZoneDistribution.home.defense / n,
        midfield: total.ballZoneDistribution.home.midfield / n,
        attack: total.ballZoneDistribution.home.attack / n,
      },
      away: {
        defense: total.ballZoneDistribution.away.defense / n,
        midfield: total.ballZoneDistribution.away.midfield / n,
        attack: total.ballZoneDistribution.away.attack / n,
      },
    },
  };
}

function printMetrics(label: string, m: SimulationMetrics) {
  const totalPoss = m.possessionTicks.home + m.possessionTicks.away;
  const homePct = totalPoss > 0 ? (m.possessionTicks.home / totalPoss * 100).toFixed(1) : '0';
  const awayPct = totalPoss > 0 ? (m.possessionTicks.away / totalPoss * 100).toFixed(1) : '0';

  console.log(`\n===== ${label} =====`);
  console.log(`Posse:           Casa ${homePct}%  |  Fora ${awayPct}%`);
  console.log(`Posses totais:   ${m.totalPossessions}`);
  console.log(`Passes/posse:    ${m.avgPassesPerPossession.toFixed(2)}`);
  console.log(`Ações totais:    ${m.totalActions}`);
  console.log(`Passes curtos:   ${m.shortPasses}`);
  console.log(`Passes longos:   ${m.longPasses}`);
  console.log(`Chutes na zona:  ${m.zoneShots}`);
  console.log(`Chutes longos:   ${m.longShots}`);
  console.log(`Aglomeração max: ${m.maxClusterSize} jogadores em raio de 5`);
  console.log(`Dist linhas:     Def-Mei ${m.avgLineDistances.def_mid.toFixed(1)}  |  Mei-Ata ${m.avgLineDistances.mid_att.toFixed(1)}  |  Def-Ata ${m.avgLineDistances.def_att.toFixed(1)}`);
  console.log(`Zona bola Casa:  Def ${(m.ballZoneDistribution.home.defense * 100).toFixed(0)}%  |  Mei ${(m.ballZoneDistribution.home.midfield * 100).toFixed(0)}%  |  Ata ${(m.ballZoneDistribution.home.attack * 100).toFixed(0)}%`);
  console.log(`Zona bola Fora:  Def ${(m.ballZoneDistribution.away.defense * 100).toFixed(0)}%  |  Mei ${(m.ballZoneDistribution.away.midfield * 100).toFixed(0)}%  |  Ata ${(m.ballZoneDistribution.away.attack * 100).toFixed(0)}%`);
}

describe('métricas de partida de teste', () => {
  it('simula 10 minutos balanced vs balanced e imprime métricas', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home', 'balanced');
    const away = createTeam('away', 'balanced');
    const players = buildPlayers(home, away);

    const allMetrics: SimulationMetrics[] = [];
    let ballPos: { x: number; y: number } | null = null;

    for (let minute = 1; minute <= 10; minute++) {
      const { metrics } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'balanced', 'balanced', null, ballPos,
      );
      allMetrics.push(metrics);
    }

    const agg = aggregateMetrics(allMetrics);
    printMetrics('BALANCED vs BALANCED (10 minutos)', agg);

    vi.restoreAllMocks();
  });

  it('simula 10 minutos attacking vs defensive e imprime métricas', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home', 'attacking');
    const away = createTeam('away', 'defensive');
    const players = buildPlayers(home, away);

    const allMetrics: SimulationMetrics[] = [];
    let ballPos: { x: number; y: number } | null = null;

    for (let minute = 1; minute <= 10; minute++) {
      const { metrics } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'attacking', 'defensive', null, ballPos,
      );
      allMetrics.push(metrics);
    }

    const agg = aggregateMetrics(allMetrics);
    printMetrics('ATTACKING vs DEFENSIVE (10 minutos)', agg);

    vi.restoreAllMocks();
  });

  it('simula 10 minutos possession vs counter e imprime métricas', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const home = createTeam('home', 'possession');
    const away = createTeam('away', 'counter');
    const players = buildPlayers(home, away);

    const allMetrics: SimulationMetrics[] = [];
    let ballPos: { x: number; y: number } | null = null;

    for (let minute = 1; minute <= 10; minute++) {
      const { metrics } = simulateMinuteWithMetrics(
        minute, players.home, players.away, home, away, 'possession', 'counter', null, ballPos,
      );
      allMetrics.push(metrics);
    }

    const agg = aggregateMetrics(allMetrics);
    printMetrics('POSSESSION vs COUNTER (10 minutos)', agg);

    vi.restoreAllMocks();
  });
});
