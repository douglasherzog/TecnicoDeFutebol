import type { Round, Match } from '../types';

// Round-robin tournament: each team plays every other team twice (home and away)
// 18 teams = 34 rounds, 9 matches per round
export function generateFixtures(teams: { id: string }[], divisionId: number): Round[] {
  const n = teams.length;
  const rounds: Round[] = [];

  // Create first half using circle method
  const teamIds = teams.map(t => t.id);
  const fixed = teamIds[0];
  const rotating = teamIds.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const matches: Match[] = [];
    const current = [fixed, ...rotating];

    for (let i = 0; i < n / 2; i++) {
      const home = current[i];
      const away = current[n - 1 - i];

      matches.push({
        id: `d${divisionId}-r${round + 1}-m${i + 1}`,
        homeTeamId: round % 2 === 0 ? home : away,
        awayTeamId: round % 2 === 0 ? away : home,
        homeGoals: null,
        awayGoals: null,
        played: false,
      });
    }

    rounds.push({ number: round + 1, matches });

    // Rotate
    rotating.push(rotating.shift()!);
  }

  // Second half: mirror the first half (swap home/away)
  for (let round = 0; round < n - 1; round++) {
    const firstHalfRound = rounds[round];
    const matches: Match[] = firstHalfRound.matches.map((m, i) => ({
      id: `d${divisionId}-r${round + n}-m${i + 1}`,
      homeTeamId: m.awayTeamId,
      awayTeamId: m.homeTeamId,
      homeGoals: null,
      awayGoals: null,
      played: false,
    }));

    rounds.push({ number: round + n, matches });
  }

  return rounds;
}
