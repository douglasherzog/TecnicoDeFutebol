import type { CupCompetition, Match, Team } from '../types';
import { simulateMatch } from './matchEngine';

const ROUND_NAMES = ['Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function generateCup(teams: Team[], playerTeamId: string): CupCompetition {
  const playerTeam = teams.find(team => team.id === playerTeamId);
  const candidates = shuffle(teams.filter(team => team.id !== playerTeamId)).slice(0, 15);
  const participants = shuffle(playerTeam ? [playerTeam, ...candidates] : candidates);
  const matches: Match[] = [];

  for (let index = 0; index < participants.length; index += 2) {
    matches.push({
      id: `cup-r1-m${index / 2 + 1}`,
      homeTeamId: participants[index].id,
      awayTeamId: participants[index + 1].id,
      homeGoals: null,
      awayGoals: null,
      played: false,
    });
  }

  return { name: 'Copa Nacional', rounds: [{ name: ROUND_NAMES[0], matches }], currentRound: 0, championId: null };
}

export function simulateCupRound(cup: CupCompetition, teams: Team[]): CupCompetition {
  const round = cup.rounds[cup.currentRound];
  if (!round || cup.championId) return cup;

  const playedMatches = round.matches.map(match => {
    const homeTeam = teams.find(team => team.id === match.homeTeamId)!;
    const awayTeam = teams.find(team => team.id === match.awayTeamId)!;
    const result = simulateMatch(homeTeam, awayTeam, match.id);
    if (result.homeGoals === result.awayGoals) {
      if (Math.random() < 0.5) result.homeGoals!++;
      else result.awayGoals!++;
    }
    return result;
  });
  const winners = playedMatches.map(match => match.homeGoals! > match.awayGoals! ? match.homeTeamId : match.awayTeamId);
  const rounds = cup.rounds.map((current, index) => index === cup.currentRound ? { ...current, matches: playedMatches } : current);

  if (winners.length === 1) return { ...cup, rounds, championId: winners[0], currentRound: cup.currentRound + 1 };

  const nextRoundIndex = cup.currentRound + 1;
  const nextMatches: Match[] = [];
  for (let index = 0; index < winners.length; index += 2) {
    nextMatches.push({
      id: `cup-r${nextRoundIndex + 1}-m${index / 2 + 1}`,
      homeTeamId: winners[index],
      awayTeamId: winners[index + 1],
      homeGoals: null,
      awayGoals: null,
      played: false,
    });
  }

  return {
    ...cup,
    rounds: [...rounds, { name: ROUND_NAMES[nextRoundIndex], matches: nextMatches }],
    currentRound: nextRoundIndex,
  };
}
