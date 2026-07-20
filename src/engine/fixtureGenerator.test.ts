import { describe, expect, it } from 'vitest';
import { generateFixtures } from './fixtureGenerator';

const teams = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('generateFixtures', () => {
  it('creates a double round-robin schedule', () => {
    const rounds = generateFixtures(teams, 2);
    const matches = rounds.flatMap(round => round.matches);

    expect(rounds).toHaveLength(6);
    expect(matches).toHaveLength(12);
    expect(new Set(matches.map(match => match.id)).size).toBe(matches.length);

    for (const team of teams) {
      const teamMatches = matches.filter(match => match.homeTeamId === team.id || match.awayTeamId === team.id);
      expect(teamMatches).toHaveLength(6);
      expect(teamMatches.filter(match => match.homeTeamId === team.id)).toHaveLength(3);
      expect(teamMatches.filter(match => match.awayTeamId === team.id)).toHaveLength(3);
    }

    for (let index = 0; index < matches.length; index += 2) {
      const roundMatches = matches.slice(index, index + 2);
      expect(new Set(roundMatches.flatMap(match => [match.homeTeamId, match.awayTeamId])).size).toBe(4);
    }
  });
});
