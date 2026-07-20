import type { Match, Team } from '../types';
import { getTeamStrength } from './playerGenerator';

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
  const homeStrength = getTeamStrength(homeTeam.squad);
  const awayStrength = getTeamStrength(awayTeam.squad);
  const homeGoals = randomGoals(homeStrength, true);
  const awayGoals = randomGoals(awayStrength, false);

  return {
    id: matchId,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeGoals,
    awayGoals,
    played: true,
  };
}
