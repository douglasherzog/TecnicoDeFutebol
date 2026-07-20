import type { Formation, Player, Position, TacticalApproach, Team, TeamTactics } from '../types';

const FORMATION_POSITIONS: Record<Formation, Position[]> = {
  '4-3-3': ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'],
  '4-4-2': ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA'],
  '4-2-3-1': ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'VOL', 'MEI', 'MEI', 'MEI', 'ATA'],
};

const DEFAULT_TACTICS: TeamTactics = { formation: '4-3-3', approach: 'balanced' };

export function getTeamTactics(team: Team): TeamTactics {
  return team.tactics ?? DEFAULT_TACTICS;
}

export function createLineup(squad: Player[], formation: Formation): string[] {
  const available = [...squad].sort((a, b) => b.overall - a.overall);
  const selected: Player[] = [];

  for (const position of FORMATION_POSITIONS[formation]) {
    const index = available.findIndex(player => player.position === position);
    if (index !== -1) selected.push(available.splice(index, 1)[0]);
  }

  return [...selected, ...available.slice(0, Math.max(0, 11 - selected.length))]
    .slice(0, 11)
    .map(player => player.id);
}

export function getStartingLineup(team: Team): Player[] {
  const storedLineup = team.lineup ?? [];
  const players = storedLineup
    .map(id => team.squad.find(player => player.id === id))
    .filter((player): player is Player => Boolean(player));

  if (players.length === 11) return players;
  const lineupIds = createLineup(team.squad, getTeamTactics(team).formation);
  return lineupIds
    .map(id => team.squad.find(player => player.id === id))
    .filter((player): player is Player => Boolean(player));
}

export function getTeamStrength(team: Team): number {
  const lineup = getStartingLineup(team);
  if (lineup.length === 0) return 30;

  const average = lineup.reduce((sum, player) => {
    const condition = 0.75 + player.stamina / 400 + player.morale / 1000;
    return sum + player.overall * condition;
  }, 0) / lineup.length;

  return Math.round(average);
}

export function getTacticalModifier(approach: TacticalApproach): { attack: number; defense: number } {
  if (approach === 'attacking') return { attack: 7, defense: -4 };
  if (approach === 'defensive') return { attack: -4, defense: 7 };
  return { attack: 0, defense: 0 };
}

export function updateTeamCondition(team: Team, result: 'win' | 'draw' | 'loss'): Team {
  const lineupIds = new Set(getStartingLineup(team).map(player => player.id));
  const moraleChange = result === 'win' ? 2 : result === 'loss' ? -2 : 0;

  return {
    ...team,
    squad: team.squad.map(player => {
      const started = lineupIds.has(player.id);
      return {
        ...player,
        stamina: Math.min(100, Math.max(1, player.stamina + (started ? -12 : 8))),
        morale: Math.min(100, Math.max(1, player.morale + moraleChange)),
      };
    }),
  };
}

export function progressSquad(team: Team): Team {
  return {
    ...team,
    squad: team.squad.map(player => {
      const age = player.age + 1;
      const growth = age <= 23 ? 2 : age <= 28 ? 1 : age >= 33 ? -2 : age >= 30 ? -1 : 0;
      const targetOverall = Math.min(player.potential, player.overall + Math.max(0, growth));
      const overall = Math.max(1, age >= 30 ? targetOverall + Math.min(0, growth) : targetOverall);
      const potential = Math.max(overall, player.potential);
      const marketValue = Math.round((overall * overall * (age < 24 ? 75 : age < 29 ? 60 : age < 33 ? 40 : 20)) / 1000) * 1000;

      return {
        ...player,
        age,
        overall,
        potential,
        stamina: Math.min(100, player.stamina + 20),
        morale: Math.max(50, player.morale),
        marketValue,
        contractYears: Math.max(0, player.contractYears - 1),
      };
    }),
  };
}
