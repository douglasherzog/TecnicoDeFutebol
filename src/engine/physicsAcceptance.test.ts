import { describe, it, expect, vi } from 'vitest';
import { MatchSimulation, SIMULATION_CONFIG } from './matchSimulation';
import { buildPlayers } from './pitchEngine';
import type { Team } from '../types';

function createTeam(id: string, formation: string = '4-3-3'): Team {
  const positions = ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'] as const;
  return {
    id,
    name: `Time ${id}`,
    shortName: id.toUpperCase(),
    colors: { primary: id === 'home' ? '#3b82f6' : '#ef4444', secondary: '#ffffff' },
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
    tactics: { formation: formation as any, approach: 'balanced' as any },
    budget: 0,
  };
}

// Teste de aceitação física: verifica repulsão, limite de jogadores perto da bola,
// e distância do árbitro em todos os frames de uma simulação ao vivo.

describe('teste de aceitação física', () => {
  it('árbitro nunca aparece dentro do aglomerado de jogadores', () => {
    const homeTeam = createTeam('home', '4-3-3');
    const awayTeam = createTeam('away', '4-4-2');
    const { home, away } = buildPlayers(homeTeam, awayTeam);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const sim = new MatchSimulation(1, home, away, homeTeam.id, awayTeam.id, 1, 'balanced', 'balanced', null, null);

    // Avança a simulação tick a tick e verifica condições físicas
    const TICKS = 300; // ~25 segundos de simulação
    let maxPlayersNearBall = 0;
    let minRefereeDistToNearestPlayer = Infinity;
    let refereeInCluster = false;

    for (let t = 0; t < TICKS; t++) {
      sim.tick(SIMULATION_CONFIG.TICK_RATE);

      // Verifica jogadores perto da bola (raio 3)
      const ball = sim.getBallPosition();
      const playerPositions = sim.getPlayerPositions();
      const nearBall = playerPositions.filter(p =>
        Math.hypot(p.x - ball.x, p.y - ball.y) < 3.0
      );
      maxPlayersNearBall = Math.max(maxPlayersNearBall, nearBall.length);

      // Verifica distância do árbitro para o jogador mais próximo
      const refPos = sim.getRefereePosition();
      for (const p of playerPositions) {
        const d = Math.hypot(p.x - refPos.x, p.y - refPos.y);
        if (d < minRefereeDistToNearestPlayer) {
          minRefereeDistToNearestPlayer = d;
        }
        // Árbitro dentro de raio de aglomeração (3 unidades) = problema
        if (d < 3.0) {
          refereeInCluster = true;
        }
      }
    }

    vi.restoreAllMocks();

    // Relatório
    console.log('\n===== TESTE DE ACEITAÇÃO FÍSICA =====');
    console.log(`Ticks simulados: ${TICKS}`);
    console.log(`Máx. jogadores perto da bola (raio 3): ${maxPlayersNearBall}`);
    console.log(`Dist. mín. árbitro-jogador: ${minRefereeDistToNearestPlayer.toFixed(2)}`);
    console.log(`Árbitro dentro de aglomerado: ${refereeInCluster ? 'SIM (PROBLEMA!)' : 'NÃO'}`);

    // Asserções
    expect(maxPlayersNearBall).toBeLessThanOrEqual(6); // máx 5-6 total
    expect(refereeInCluster).toBe(false); // árbitro nunca dentro de aglomerado
    expect(minRefereeDistToNearestPlayer).toBeGreaterThanOrEqual(3.0); // árbitro sempre a pelo menos 3 unidades
  });

  it('formação permanece reconhecível — jogadores espalhados em campo', () => {
    const homeTeam = createTeam('home', '4-3-3');
    const awayTeam = createTeam('away', '4-4-2');
    const { home, away } = buildPlayers(homeTeam, awayTeam);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const sim = new MatchSimulation(1, home, away, homeTeam.id, awayTeam.id, 1, 'balanced', 'balanced', null, null);

    const TICKS = 200;
    let minPlayerSpread = Infinity; // distância mínima entre qualquer par de jogadores

    for (let t = 0; t < TICKS; t++) {
      sim.tick(SIMULATION_CONFIG.TICK_RATE);
      const positions = sim.getPlayerPositions();
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const d = Math.hypot(
            positions[i].x - positions[j].x,
            positions[i].y - positions[j].y
          );
          if (d < minPlayerSpread) minPlayerSpread = d;
        }
      }
    }

    vi.restoreAllMocks();

    console.log('\n===== ESPALHAMENTO DE JOGADORES =====');
    console.log(`Dist. mín. entre qualquer par: ${minPlayerSpread.toFixed(2)}`);

    // Nenhum par de jogadores deve estar sobreposto (distância mínima > 0)
    expect(minPlayerSpread).toBeGreaterThan(0);
  });
});
