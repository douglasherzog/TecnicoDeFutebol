import { describe, expect, it, vi } from 'vitest';
import { simulateMatch } from './matchEngine';
import type { Team } from '../types';

function createTeam(id: string): Team {
  return {
    id,
    name: id,
    shortName: id,
    colors: { primary: '#000000', secondary: '#FFFFFF' },
    budget: 0,
    squad: Array.from({ length: 11 }, (_, index) => ({
      id: `${id}-${index}`,
      name: `Jogador ${index}`,
      age: 25,
      position: index === 0 ? 'GOL' : 'ATA',
      overall: 70,
      potential: 75,
      stamina: 80,
      salary: 1000,
      marketValue: 10000,
      contractYears: 2,
      morale: 70,
    })),
  };
}

describe('simulateMatch', () => {
  it('returns a completed match with non-negative scores', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = simulateMatch(createTeam('home'), createTeam('away'), 'match-1');

    expect(result).toMatchObject({
      id: 'match-1',
      homeTeamId: 'home',
      awayTeamId: 'away',
      played: true,
    });
    expect(result.homeGoals).toBeGreaterThanOrEqual(0);
    expect(result.awayGoals).toBeGreaterThanOrEqual(0);

    vi.restoreAllMocks();
  });
});
