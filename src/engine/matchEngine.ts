import type { Match, Team } from '../types';
import { getTacticalModifier, getTeamStrength, getTeamTactics } from './squadEngine';

function randomGoals(strength: number, isHome: boolean): number {
  const base = strength / 100;
  const homeBonus = isHome ? 0.15 : 0;
  const avgGoals = base * 2.5 + homeBonus;

  // Poisson-like distribution
  let goals = 0;
  const L = Math.exp(-avgGoals);
  let p = 1;
  do {
    goals++;
    p *= Math.random();
  } while (p > L);
  return goals - 1;
}

export function simulateMatch(homeTeam: Team, awayTeam: Team, matchId: string): Match {
  const homeTactics = getTacticalModifier(getTeamTactics(homeTeam).approach);
  const awayTactics = getTacticalModifier(getTeamTactics(awayTeam).approach);
  const homeStrength = getTeamStrength(homeTeam) + homeTactics.attack - awayTactics.defense;
  const awayStrength = getTeamStrength(awayTeam) + awayTactics.attack - homeTactics.defense;
  const homeGoals = randomGoals(Math.max(20, homeStrength), true);
  const awayGoals = randomGoals(Math.max(20, awayStrength), false);

  return {
    id: matchId,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeGoals,
    awayGoals,
    played: true,
  };
}
