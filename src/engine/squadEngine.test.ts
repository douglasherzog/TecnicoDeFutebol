import { describe, expect, it } from 'vitest';
import { createLineup, getTeamStrength, progressSquad, updateTeamCondition } from './squadEngine';
import type { Player, Team } from '../types';

const positions: Player['position'][] = ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA', 'GOL'];
const squad: Player[] = positions.map((position, index) => ({
  id: `player-${index}`,
  name: `Jogador ${index}`,
  age: index === 0 ? 22 : 25,
  position,
  overall: 60 + index,
  potential: 80,
  stamina: 80,
  salary: 1000,
  marketValue: 10000,
  contractYears: 3,
  morale: 70,
}));

const team: Team = {
  id: 'team-1',
  name: 'Clube Teste',
  shortName: 'CTE',
  colors: { primary: '#000000', secondary: '#FFFFFF' },
  squad,
  lineup: squad.slice(0, 11).map(player => player.id),
  tactics: { formation: '4-3-3', approach: 'balanced' },
  budget: 0,
};

describe('squad engine', () => {
  it('creates an eleven-player lineup that follows the formation', () => {
    const lineup = createLineup(squad, '4-3-3');

    expect(lineup).toHaveLength(11);
    expect(lineup).toContain('player-11');
    expect(new Set(lineup).size).toBe(11);
  });

  it('applies condition changes based on starters and result', () => {
    const updated = updateTeamCondition(team, 'win');

    expect(updated.squad[0]).toMatchObject({ stamina: 68, morale: 72 });
    expect(updated.squad[11]).toMatchObject({ stamina: 88, morale: 72 });
  });

  it('uses stamina and morale in team strength', () => {
    const exhaustedTeam = {
      ...team,
      squad: team.squad.map(player => ({ ...player, stamina: 1, morale: 1 })),
    };

    expect(getTeamStrength(team)).toBeGreaterThan(getTeamStrength(exhaustedTeam));
  });

  it('ages and progresses young players at the season transition', () => {
    const progressed = progressSquad(team);

    expect(progressed.squad[0]).toMatchObject({ age: 23, overall: 62, contractYears: 2, stamina: 100 });
  });
});
