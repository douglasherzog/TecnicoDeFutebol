import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySecondHalfTactics, computeMomentum, computeTeamStats, countGoals, createLiveMatch, regenerateFromMinute } from './liveMatchEngine';
import type { MatchEvent } from '../types';
import type { Team } from '../types';

function createTeam(id: string): Team {
  const positions = ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'] as const;
  return {
    id,
    name: `Time ${id}`,
    shortName: id.toUpperCase(),
    colors: { primary: '#000000', secondary: '#FFFFFF' },
    squad: positions.map((position, index) => ({
      id: `${id}-${index}`,
      name: `Jogador ${id} ${index}`,
      age: 25,
      position,
      overall: 70,
      potential: 75,
      stamina: 80,
      salary: 1000,
      marketValue: 10000,
      contractYears: 2,
      morale: 70,
    })),
    tactics: { formation: '4-3-3', approach: 'balanced' },
    budget: 0,
  };
}

const homeTeam = createTeam('home');
const awayTeam = createTeam('away');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('live match engine', () => {
  it('creates a full timeline with kickoff, halftime and fulltime markers', () => {
    const liveMatch = createLiveMatch(homeTeam, awayTeam, 'match-1');
    const types = liveMatch.events.map(event => event.type);

    expect(types[0]).toBe('kickoff');
    expect(types).toContain('halftime');
    expect(types[types.length - 1]).toBe('fulltime');
    expect(liveMatch.events.every(event => event.minute >= 1 && event.minute <= 90)).toBe(true);
  });

  it('keeps the final score consistent with goal events', () => {
    const liveMatch = createLiveMatch(homeTeam, awayTeam, 'match-1');

    expect(liveMatch.match.homeGoals).toBe(countGoals(liveMatch.events, homeTeam.id));
    expect(liveMatch.match.awayGoals).toBe(countGoals(liveMatch.events, awayTeam.id));
    expect(liveMatch.match.played).toBe(true);
  });

  it('preserves the first half when tactics change at halftime', () => {
    const liveMatch = createLiveMatch(homeTeam, awayTeam, 'match-1');
    const firstHalfGoals = countGoals(liveMatch.events, homeTeam.id, 44) + countGoals(liveMatch.events, awayTeam.id, 44);

    const updated = applySecondHalfTactics(liveMatch, homeTeam, awayTeam, 'attacking', 'balanced');
    const updatedFirstHalfGoals = countGoals(updated.events, homeTeam.id, 44) + countGoals(updated.events, awayTeam.id, 44);

    expect(updated.homeApproach).toBe('attacking');
    expect(updatedFirstHalfGoals).toBe(firstHalfGoals);
    expect(updated.match.homeGoals).toBe(countGoals(updated.events, homeTeam.id));
  });

  it('never produces goals from a scoreless deterministic roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const liveMatch = createLiveMatch(homeTeam, awayTeam, 'match-1');

    expect(liveMatch.match.homeGoals).toBe(0);
    expect(liveMatch.match.awayGoals).toBe(0);
  });

  it('keeps history and inserts extra events when regenerating mid-match', () => {
    const liveMatch = createLiveMatch(homeTeam, awayTeam, 'match-1');
    const goalsBefore60 = countGoals(liveMatch.events, homeTeam.id, 60) + countGoals(liveMatch.events, awayTeam.id, 60);
    const subEvent: MatchEvent = { minute: 60, type: 'sub', teamId: homeTeam.id, description: 'Substituição teste.' };

    const updated = regenerateFromMinute(liveMatch, homeTeam, awayTeam, 'attacking', 'balanced', 61, [subEvent]);

    const updatedGoalsBefore60 = countGoals(updated.events, homeTeam.id, 60) + countGoals(updated.events, awayTeam.id, 60);
    expect(updatedGoalsBefore60).toBe(goalsBefore60);
    expect(updated.events.some(event => event.type === 'sub' && event.minute === 60)).toBe(true);
    expect(updated.match.homeGoals).toBe(countGoals(updated.events, homeTeam.id));
  });

  it('computes shooting stats attributing saved shots to the attacking team', () => {
    const events: MatchEvent[] = [
      { minute: 10, type: 'goal', teamId: homeTeam.id, description: '', xg: 0.5 },
      { minute: 20, type: 'miss', teamId: homeTeam.id, description: '', xg: 0.1 },
      { minute: 30, type: 'save', teamId: awayTeam.id, description: '', xg: 0.2 },
      { minute: 40, type: 'card', teamId: homeTeam.id, description: '' },
    ];

    const stats = computeTeamStats(events, homeTeam.id, awayTeam.id, 90);

    expect(stats.shots).toBe(3);
    expect(stats.onTarget).toBe(2);
    expect(stats.xg).toBeCloseTo(0.8);
    expect(stats.fouls).toBe(1);
    expect(stats.cards).toBe(1);
  });

  it('computes momentum from recent attacking events', () => {
    const events: MatchEvent[] = [
      { minute: 80, type: 'miss', teamId: homeTeam.id, description: '' },
      { minute: 85, type: 'goal', teamId: homeTeam.id, description: '' },
      { minute: 88, type: 'save', teamId: homeTeam.id, description: '' },
    ];

    // Two attacks by home, one shot against (saved by home keeper => away attack)
    expect(computeMomentum(events, homeTeam.id, awayTeam.id, 90)).toBeCloseTo(2 / 3);
    expect(computeMomentum([], homeTeam.id, awayTeam.id, 90)).toBe(0.5);
  });
});
