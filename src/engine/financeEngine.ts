import type { FinanceEntry, Team } from '../types';

// Revenue parameters by division
const DIVISION_CONFIG = {
  1: { gateBase: 85000, tvMonthly: 500000, winBonus: 50000, drawBonus: 20000, travelCost: 15000, prizePerPosition: 200000 },
  2: { gateBase: 35000, tvMonthly: 150000, winBonus: 20000, drawBonus: 8000, travelCost: 10000, prizePerPosition: 80000 },
  3: { gateBase: 12000, tvMonthly: 50000, winBonus: 8000, drawBonus: 3000, travelCost: 5000, prizePerPosition: 30000 },
} as const;

export function getGateRevenue(divisionId: number, isHome: boolean, won: boolean, drew: boolean): number {
  if (!isHome) return 0; // No gate revenue for away games
  const config = DIVISION_CONFIG[divisionId as keyof typeof DIVISION_CONFIG];
  // Gate varies: wins attract more fans next time, but base is always there
  const multiplier = won ? 1.3 : drew ? 1.0 : 0.7;
  return Math.round(config.gateBase * multiplier);
}

export function getMatchBonus(divisionId: number, won: boolean, drew: boolean): number {
  const config = DIVISION_CONFIG[divisionId as keyof typeof DIVISION_CONFIG];
  if (won) return config.winBonus;
  if (drew) return config.drawBonus;
  return 0;
}

export function getTravelCost(divisionId: number, isHome: boolean): number {
  if (isHome) return 0;
  const config = DIVISION_CONFIG[divisionId as keyof typeof DIVISION_CONFIG];
  return -config.travelCost;
}

export function getTvRevenue(divisionId: number): number {
  const config = DIVISION_CONFIG[divisionId as keyof typeof DIVISION_CONFIG];
  return config.tvMonthly;
}

export function getSeasonPrize(divisionId: number, position: number): number {
  const config = DIVISION_CONFIG[divisionId as keyof typeof DIVISION_CONFIG];
  // Top positions get more, decreasing linearly
  const maxPrize = config.prizePerPosition * 18;
  const prize = maxPrize - (position - 1) * config.prizePerPosition;
  return Math.max(prize, config.prizePerPosition);
}

export function getMonthlySalaries(team: Team): number {
  return team.squad.reduce((total, player) => total + player.salary, 0);
}

export function processMatchFinances(
  divisionId: number,
  isHome: boolean,
  won: boolean,
  drew: boolean,
  round: number,
  teamName: string,
  opponentName: string,
): FinanceEntry[] {
  const entries: FinanceEntry[] = [];
  const result = won ? 'vitória' : drew ? 'empate' : 'derrota';
  const location = isHome ? 'casa' : 'fora';

  // Gate revenue (home only)
  if (isHome) {
    const gate = getGateRevenue(divisionId, true, won, drew);
    entries.push({
      round,
      type: 'gate',
      amount: gate,
      description: `Bilheteria: ${teamName} vs ${opponentName} (${result})`,
    });
  }

  // Match bonus (win/draw)
  const bonus = getMatchBonus(divisionId, won, drew);
  if (bonus > 0) {
    entries.push({
      round,
      type: won ? 'win_bonus' : 'draw_bonus',
      amount: bonus,
      description: `Bônus de ${result} (${location}) vs ${opponentName}`,
    });
  }

  // Travel cost (away only)
  if (!isHome) {
    const travel = getTravelCost(divisionId, false);
    entries.push({
      round,
      type: 'travel',
      amount: travel,
      description: `Viagem: ${teamName} @ ${opponentName}`,
    });
  }

  return entries;
}

// Called every 4 rounds (simulating ~1 month)
export function processMonthlyFinances(
  divisionId: number,
  team: Team,
  round: number,
): FinanceEntry[] {
  const entries: FinanceEntry[] = [];

  // TV money
  const tv = getTvRevenue(divisionId);
  entries.push({
    round,
    type: 'tv',
    amount: tv,
    description: `Cotas de TV - ${getDivisionName(divisionId)}`,
  });

  // Salaries
  const salaries = getMonthlySalaries(team);
  entries.push({
    round,
    type: 'salary',
    amount: -salaries,
    description: `Folha salarial (${team.squad.length} jogadores)`,
  });

  return entries;
}

export function processEndSeasonPrize(
  divisionId: number,
  position: number,
  round: number,
): FinanceEntry {
  const prize = getSeasonPrize(divisionId, position);
  return {
    round,
    type: 'prize',
    amount: prize,
    description: `Premiação final: ${position}º lugar - ${getDivisionName(divisionId)}`,
  };
}

function getDivisionName(id: number): string {
  switch (id) {
    case 1: return 'Primeira Divisão';
    case 2: return 'Segunda Divisão';
    case 3: return 'Terceira Divisão';
    default: return '';
  }
}

// Starting budgets by division
export function getStartingBudget(divisionId: number): number {
  switch (divisionId) {
    case 1: return 5000000;
    case 2: return 2000000;
    case 3: return 800000;
    default: return 500000;
  }
}
