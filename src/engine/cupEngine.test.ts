import { describe, expect, it, vi } from 'vitest';
import { generateCup, simulateCupRound } from './cupEngine';
import type { Team } from '../types';

function createTeam(index: number): Team {
  return {
    id: `team-${index}`,
    name: `Time ${index}`,
    shortName: `T${index}`,
    colors: { primary: '#000000', secondary: '#FFFFFF' },
    squad: Array.from({ length: 11 }, (_, playerIndex) => ({
      id: `team-${index}-player-${playerIndex}`,
      name: 'Jogador',
      age: 25,
      position: playerIndex === 0 ? 'GOL' : 'ATA',
      overall: 65,
      potential: 70,
      stamina: 80,
      salary: 1000,
      marketValue: 10000,
      contractYears: 2,
      morale: 70,
    })),
    budget: 0,
  };
}

const teams = Array.from({ length: 18 }, (_, index) => createTeam(index));

describe('cup engine', () => {
  it('creates an eight-match knockout opening round with the player team', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const cup = generateCup(teams, 'team-0');

    expect(cup.rounds[0].name).toBe('Oitavas de Final');
    expect(cup.rounds[0].matches).toHaveLength(8);
    expect(cup.rounds[0].matches.some(match => match.homeTeamId === 'team-0' || match.awayTeamId === 'team-0')).toBe(true);

    vi.restoreAllMocks();
  });

  it('advances winners to the next cup round', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cup = generateCup(teams, 'team-0');
    const updatedCup = simulateCupRound(cup, teams);

    expect(updatedCup.currentRound).toBe(1);
    expect(updatedCup.rounds[0].matches.every(match => match.played)).toBe(true);
    expect(updatedCup.rounds[1]).toMatchObject({ name: 'Quartas de Final' });
    expect(updatedCup.rounds[1].matches).toHaveLength(4);

    vi.restoreAllMocks();
  });
});
