import { describe, expect, it } from 'vitest';
import { getSeasonPrize, processMatchFinances, processMonthlyFinances } from './financeEngine';
import type { Team } from '../types';

const team: Team = {
  id: 'team-1',
  name: 'Clube Teste',
  shortName: 'CTE',
  colors: { primary: '#000000', secondary: '#FFFFFF' },
  budget: 0,
  squad: [
    { id: 'p-1', name: 'Jogador 1', age: 25, position: 'GOL', overall: 60, potential: 65, stamina: 80, salary: 1000, marketValue: 10000, contractYears: 2, morale: 70 },
    { id: 'p-2', name: 'Jogador 2', age: 24, position: 'ATA', overall: 65, potential: 70, stamina: 75, salary: 1500, marketValue: 15000, contractYears: 3, morale: 75 },
  ],
};

describe('finance engine', () => {
  it('credits gate and win bonus for a home victory', () => {
    const entries = processMatchFinances(3, true, true, false, 1, team.name, 'Visitante');

    expect(entries.map(entry => entry.type)).toEqual(['gate', 'win_bonus']);
    expect(entries.reduce((total, entry) => total + entry.amount, 0)).toBe(23600);
  });

  it('charges travel only for an away defeat', () => {
    const entries = processMatchFinances(2, false, false, false, 5, team.name, 'Mandante');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'travel', amount: -10000 });
  });

  it('processes monthly tv revenue and the complete payroll', () => {
    const entries = processMonthlyFinances(3, team, 4);

    expect(entries).toMatchObject([
      { type: 'tv', amount: 50000 },
      { type: 'salary', amount: -2500 },
    ]);
  });

  it('rewards higher league positions with larger prizes', () => {
    expect(getSeasonPrize(1, 1)).toBeGreaterThan(getSeasonPrize(1, 18));
    expect(getSeasonPrize(1, 18)).toBe(200000);
  });
});
