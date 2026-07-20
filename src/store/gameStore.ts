import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CupCompetition, Division, Finances, FinanceEntry, Formation, GamePhase, LiveMatch, Match, PostMatchReport, PreMatchAnalysis, SeasonObjective, SeasonResult, Standing, TacticalApproach, Team, TransferOffer } from '../types';
import { division1Teams, division2Teams, division3Teams } from '../data/teams';
import type { TeamBase } from '../data/teams';
import { generateFixtures } from '../engine/fixtureGenerator';
import { simulateMatch } from '../engine/matchEngine';
import { generateSquad, resetPlayerIdCounter } from '../engine/playerGenerator';
import { createLineup, progressSquad, updateTeamCondition } from '../engine/squadEngine';
import { getStartingBudget, processMatchFinances, processMonthlyFinances, processEndSeasonPrize } from '../engine/financeEngine';
import { generateTransferOffers, attemptSigning, resetOfferIdCounter } from '../engine/transferMarket';
import { generateCup, simulateCupRound } from '../engine/cupEngine';
import { computePostMatchReport, computePreMatchAnalysis, createLiveMatch, regenerateFromMinute } from '../engine/liveMatchEngine';

interface GameState {
  phase: GamePhase;
  coachName: string;
  playerTeamId: string | null;
  season: number;
  divisions: Division[];
  lastRoundResults: Match[];
  seasonHistory: SeasonResult[];
  finances: Finances;
  transferOffers: TransferOffer[];
  cup: CupCompetition | null;
  objective: SeasonObjective | null;
  liveMatch: LiveMatch | null;
  preMatchAnalysis: PreMatchAnalysis | null;
  postMatchReport: PostMatchReport | null;
  notifications: string[];

  // Actions
  openNewGame: () => void;
  showEndSeason: () => void;
  startLiveMatch: () => void;
  startPreMatch: () => void;
  beginLiveMatch: () => void;
  setLiveMatchApproach: (approach: TacticalApproach, fromMinute?: number) => void;
  makeLiveSubstitution: (outPlayerId: string, inPlayerId: string, minute: number) => { success: boolean; reason: string };
  finishLiveMatch: () => void;
  showPostMatch: () => void;
  closePostMatch: () => void;
  startNewGame: (coachName: string) => void;
  simulateRound: () => void;
  simulateAllRounds: () => void;
  endSeason: () => void;
  getPlayerDivision: () => Division | undefined;
  getPlayerTeam: () => Team | undefined;
  getTeamById: (id: string) => Team | undefined;
  setLineup: (playerIds: string[]) => void;
  setTactics: (formation: Formation, approach: TacticalApproach) => void;
  makeOffer: (offerId: string, price: number, salary: number) => { success: boolean; reason: string };
  sellPlayer: (playerId: string) => { success: boolean; reason: string };
  renewContract: (playerId: string, salary: number, years: number) => { success: boolean; reason: string };
  dismissOffer: (offerId: string) => void;
  resetGame: () => void;
}

function buildTeam(base: TeamBase, divisionId: number): Team {
  const squad = generateSquad(divisionId);
  const tactics = { formation: '4-3-3' as const, approach: 'balanced' as const };
  return {
    id: base.id,
    name: base.name,
    shortName: base.shortName,
    colors: base.colors,
    squad,
    lineup: createLineup(squad, tactics.formation),
    tactics,
    budget: getStartingBudget(divisionId),
  };
}

function buildTeams(bases: TeamBase[], divisionId: number): Team[] {
  return bases.map(b => buildTeam(b, divisionId));
}

function createStandings(teams: Team[]): Standing[] {
  return teams.map(t => ({
    teamId: t.id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));
}

function createDivisions(d1Teams: Team[], d2Teams: Team[], d3Teams: Team[]): Division[] {
  return [
    {
      id: 1,
      name: 'Primeira Divisão',
      teams: d1Teams,
      standings: createStandings(d1Teams),
      rounds: generateFixtures(d1Teams, 1),
      currentRound: 0,
    },
    {
      id: 2,
      name: 'Segunda Divisão',
      teams: d2Teams,
      standings: createStandings(d2Teams),
      rounds: generateFixtures(d2Teams, 2),
      currentRound: 0,
    },
    {
      id: 3,
      name: 'Terceira Divisão',
      teams: d3Teams,
      standings: createStandings(d3Teams),
      rounds: generateFixtures(d3Teams, 3),
      currentRound: 0,
    },
  ];
}

function updateStandings(standings: Standing[], match: Match): Standing[] {
  return standings.map(s => {
    if (s.teamId === match.homeTeamId) {
      const gf = match.homeGoals!;
      const ga = match.awayGoals!;
      const won = gf > ga ? 1 : 0;
      const drawn = gf === ga ? 1 : 0;
      const lost = gf < ga ? 1 : 0;
      return {
        ...s,
        played: s.played + 1,
        won: s.won + won,
        drawn: s.drawn + drawn,
        lost: s.lost + lost,
        goalsFor: s.goalsFor + gf,
        goalsAgainst: s.goalsAgainst + ga,
        points: s.points + (won ? 3 : drawn ? 1 : 0),
      };
    }
    if (s.teamId === match.awayTeamId) {
      const gf = match.awayGoals!;
      const ga = match.homeGoals!;
      const won = gf > ga ? 1 : 0;
      const drawn = gf === ga ? 1 : 0;
      const lost = gf < ga ? 1 : 0;
      return {
        ...s,
        played: s.played + 1,
        won: s.won + won,
        drawn: s.drawn + drawn,
        lost: s.lost + lost,
        goalsFor: s.goalsFor + gf,
        goalsAgainst: s.goalsAgainst + ga,
        points: s.points + (won ? 3 : drawn ? 1 : 0),
      };
    }
    return s;
  });
}

function sortStandings(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });
}

const INITIAL_FINANCES: Finances = {
  balance: 0,
  monthlyIncome: 0,
  monthlySalaries: 0,
  history: [],
};

export const useGameStore = create<GameState>()(persist((set, get) => ({
  phase: 'menu',
  coachName: '',
  playerTeamId: null,
  season: 1,
  divisions: [],
  lastRoundResults: [],
  seasonHistory: [],
  finances: INITIAL_FINANCES,
  transferOffers: [],
  cup: null,
  objective: null,
  liveMatch: null,
  preMatchAnalysis: null,
  postMatchReport: null,
  notifications: [],

  openNewGame: () => set({ phase: 'new-game' }),

  showEndSeason: () => set({ phase: 'end-season' }),

  startLiveMatch: () => {
    const { divisions, playerTeamId } = get();
    const playerDiv = divisions.find(division => division.teams.some(team => team.id === playerTeamId));
    if (!playerDiv || playerDiv.currentRound >= playerDiv.rounds.length) return;

    const round = playerDiv.rounds[playerDiv.currentRound];
    const playerMatch = round.matches.find(match => match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId);
    if (!playerMatch) return;

    const homeTeam = playerDiv.teams.find(team => team.id === playerMatch.homeTeamId)!;
    const awayTeam = playerDiv.teams.find(team => team.id === playerMatch.awayTeamId)!;
    set({ liveMatch: createLiveMatch(homeTeam, awayTeam, playerMatch.id), phase: 'live-match' });
  },

  startPreMatch: () => {
    const { divisions, playerTeamId } = get();
    const playerDiv = divisions.find(division => division.teams.some(team => team.id === playerTeamId));
    if (!playerDiv || playerDiv.currentRound >= playerDiv.rounds.length) return;

    const round = playerDiv.rounds[playerDiv.currentRound];
    const playerMatch = round.matches.find(match => match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId);
    if (!playerMatch) return;

    const homeTeam = playerDiv.teams.find(team => team.id === playerMatch.homeTeamId)!;
    const awayTeam = playerDiv.teams.find(team => team.id === playerMatch.awayTeamId)!;
    const homeApproach = homeTeam.tactics?.approach ?? 'balanced';
    const awayApproach = awayTeam.tactics?.approach ?? 'balanced';

    const recentResults = playerDiv.rounds.slice(Math.max(0, playerDiv.currentRound - 5), playerDiv.currentRound).map(round => {
      const match = round.matches.find(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId);
      if (!match || !match.played) return null;
      const isHome = match.homeTeamId === playerTeamId;
      const goalsFor = isHome ? match.homeGoals! : match.awayGoals!;
      const goalsAgainst = isHome ? match.awayGoals! : match.homeGoals!;
      const result = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
      return { teamId: playerTeamId!, results: [result] };
    }).filter(Boolean) as { teamId: string; results: ('W' | 'D' | 'L')[] }[];

    const analysis = computePreMatchAnalysis(homeTeam, awayTeam, homeApproach, awayApproach, recentResults);
    set({ preMatchAnalysis: analysis, phase: 'pre-match' });
  },

  beginLiveMatch: () => {
    const { divisions, playerTeamId } = get();
    const playerDiv = divisions.find(division => division.teams.some(team => team.id === playerTeamId));
    if (!playerDiv || playerDiv.currentRound >= playerDiv.rounds.length) return;

    const round = playerDiv.rounds[playerDiv.currentRound];
    const playerMatch = round.matches.find(match => match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId);
    if (!playerMatch) return;

    const homeTeam = playerDiv.teams.find(team => team.id === playerMatch.homeTeamId)!;
    const awayTeam = playerDiv.teams.find(team => team.id === playerMatch.awayTeamId)!;
    set({ liveMatch: createLiveMatch(homeTeam, awayTeam, playerMatch.id), phase: 'live-match' });
  },

  setLiveMatchApproach: (approach: TacticalApproach, fromMinute: number = 46) => {
    const { liveMatch, divisions, playerTeamId } = get();
    if (!liveMatch) return;

    const teams = divisions.flatMap(division => division.teams);
    const homeTeam = teams.find(team => team.id === liveMatch.match.homeTeamId)!;
    const awayTeam = teams.find(team => team.id === liveMatch.match.awayTeamId)!;
    const isHome = playerTeamId === homeTeam.id;
    const homeApproach = isHome ? approach : liveMatch.homeApproach;
    const awayApproach = isHome ? liveMatch.awayApproach : approach;

    set({
      liveMatch: regenerateFromMinute(liveMatch, homeTeam, awayTeam, homeApproach, awayApproach, fromMinute),
      divisions: divisions.map(division => ({
        ...division,
        teams: division.teams.map(team => team.id === playerTeamId && team.tactics
          ? { ...team, tactics: { ...team.tactics, approach } }
          : team),
      })),
    });
  },

  makeLiveSubstitution: (outPlayerId: string, inPlayerId: string, minute: number) => {
    const { liveMatch, divisions, playerTeamId } = get();
    if (!liveMatch || !playerTeamId) return { success: false, reason: 'Nenhuma partida em andamento.' };

    const substitutionsUsed = liveMatch.substitutionsUsed ?? 0;
    if (substitutionsUsed >= 3) return { success: false, reason: 'Limite de 3 substituições atingido.' };

    const playerTeam = divisions.flatMap(division => division.teams).find(team => team.id === playerTeamId);
    if (!playerTeam?.lineup?.includes(outPlayerId)) return { success: false, reason: 'O jogador que sai não está em campo.' };
    if (playerTeam.lineup.includes(inPlayerId)) return { success: false, reason: 'O jogador que entra já está em campo.' };

    const playerOut = playerTeam.squad.find(player => player.id === outPlayerId);
    const playerIn = playerTeam.squad.find(player => player.id === inPlayerId);
    if (!playerOut || !playerIn) return { success: false, reason: 'Jogador não encontrado no elenco.' };

    const updatedDivisions = divisions.map(division => ({
      ...division,
      teams: division.teams.map(team => team.id === playerTeamId
        ? { ...team, lineup: team.lineup!.map(id => id === outPlayerId ? inPlayerId : id) }
        : team),
    }));

    const teams = updatedDivisions.flatMap(division => division.teams);
    const homeTeam = teams.find(team => team.id === liveMatch.match.homeTeamId)!;
    const awayTeam = teams.find(team => team.id === liveMatch.match.awayTeamId)!;
    const subEvent = {
      minute,
      type: 'sub' as const,
      teamId: playerTeamId,
      description: `Substituição no ${playerTeam.name}: sai ${playerOut.name}, entra ${playerIn.name}.`,
    };
    const updatedLiveMatch = regenerateFromMinute(liveMatch, homeTeam, awayTeam, liveMatch.homeApproach, liveMatch.awayApproach, minute + 1, [subEvent]);

    set({
      divisions: updatedDivisions,
      liveMatch: { ...updatedLiveMatch, substitutionsUsed: substitutionsUsed + 1 },
    });
    return { success: true, reason: `${playerIn.name} entrou no lugar de ${playerOut.name}.` };
  },

  finishLiveMatch: () => {
    const { liveMatch, divisions } = get();
    if (!liveMatch) return;
    const teams = divisions.flatMap(division => division.teams);
    const homeTeam = teams.find(team => team.id === liveMatch.match.homeTeamId)!;
    const awayTeam = teams.find(team => team.id === liveMatch.match.awayTeamId)!;
    const report = computePostMatchReport(liveMatch, homeTeam, awayTeam);
    set({ postMatchReport: report, phase: 'post-match' });
  },

  showPostMatch: () => {
    const { liveMatch, divisions } = get();
    if (!liveMatch) return;
    const teams = divisions.flatMap(division => division.teams);
    const homeTeam = teams.find(team => team.id === liveMatch.match.homeTeamId)!;
    const awayTeam = teams.find(team => team.id === liveMatch.match.awayTeamId)!;
    const report = computePostMatchReport(liveMatch, homeTeam, awayTeam);
    set({ postMatchReport: report, phase: 'post-match' });
  },

  closePostMatch: () => {
    if (!get().liveMatch) return;
    get().simulateRound();
    set({ liveMatch: null, postMatchReport: null, preMatchAnalysis: null, phase: 'playing' });
  },

  startNewGame: (coachName: string) => {
    resetPlayerIdCounter();
    resetOfferIdCounter();

    // Build all teams with generated squads
    const d1Teams = buildTeams(division1Teams, 1);
    const d2Teams = buildTeams(division2Teams, 2);
    const d3Teams = buildTeams(division3Teams, 3);

    // Assign random team from 3rd division
    const randomIndex = Math.floor(Math.random() * d3Teams.length);
    const playerTeam = d3Teams[randomIndex];

    const divisions = createDivisions(d1Teams, d2Teams, d3Teams);

    // Initial finances
    const finances: Finances = {
      balance: playerTeam.budget,
      monthlyIncome: 0,
      monthlySalaries: playerTeam.squad.reduce((s, p) => s + p.salary, 0),
      history: [],
    };

    // Generate initial transfer offers
    const offers = generateTransferOffers(3, 0, 3, [...d1Teams, ...d2Teams, ...d3Teams.filter(team => team.id !== playerTeam.id)]);
    const cup = generateCup([...d1Teams, ...d2Teams, ...d3Teams], playerTeam.id);
    const objective: SeasonObjective = {
      description: 'Terminar entre os 4 primeiros e chegar às quartas da Copa Nacional.',
      targetPosition: 4,
      cupTargetRound: 1,
      status: 'in-progress',
    };

    set({
      phase: 'playing',
      coachName,
      playerTeamId: playerTeam.id,
      season: 1,
      divisions,
      lastRoundResults: [],
      seasonHistory: [],
      finances,
      transferOffers: offers,
      cup,
      objective,
      notifications: [`Bem-vindo, técnico ${coachName}! Você assumiu o comando do ${playerTeam.name} na Terceira Divisão.`],
    });
  },

  simulateRound: () => {
    const { divisions, playerTeamId, finances, transferOffers, cup, objective } = get();
    const allResults: Match[] = [];
    const newFinanceEntries: FinanceEntry[] = [];
    const newNotifications: string[] = [];

    const updatedDivisions = divisions.map(division => {
      if (division.currentRound >= division.rounds.length) return division;

      const round = division.rounds[division.currentRound];
      let newStandings = [...division.standings];

      const simulatedMatches = round.matches.map(match => {
        const homeTeam = division.teams.find(t => t.id === match.homeTeamId)!;
        const awayTeam = division.teams.find(t => t.id === match.awayTeamId)!;
        const liveMatch = get().liveMatch;
        const result = liveMatch && liveMatch.match.id === match.id
          ? liveMatch.match
          : simulateMatch(homeTeam, awayTeam, match.id);
        allResults.push(result);
        newStandings = updateStandings(newStandings, result);
        return result;
      });

      const updatedRounds = division.rounds.map((r, i) =>
        i === division.currentRound ? { ...r, matches: simulatedMatches } : r
      );

      const updatedTeams = division.teams.map(team => {
        const teamMatch = simulatedMatches.find(match => match.homeTeamId === team.id || match.awayTeamId === team.id);
        if (!teamMatch) return team;
        const isHome = teamMatch.homeTeamId === team.id;
        const goalsFor = isHome ? teamMatch.homeGoals! : teamMatch.awayGoals!;
        const goalsAgainst = isHome ? teamMatch.awayGoals! : teamMatch.homeGoals!;
        const result = goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw';
        return updateTeamCondition(team, result);
      });

      return {
        ...division,
        teams: updatedTeams,
        rounds: updatedRounds,
        standings: sortStandings(newStandings),
        currentRound: division.currentRound + 1,
      };
    });

    // Process finances for player's match
    const playerDiv = updatedDivisions.find(d => d.teams.some(t => t.id === playerTeamId));
    if (playerDiv) {
      const playerMatch = allResults.find(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId);
      if (playerMatch) {
        const isHome = playerMatch.homeTeamId === playerTeamId;
        const playerGoals = isHome ? playerMatch.homeGoals! : playerMatch.awayGoals!;
        const opponentGoals = isHome ? playerMatch.awayGoals! : playerMatch.homeGoals!;
        const won = playerGoals > opponentGoals;
        const drew = playerGoals === opponentGoals;
        const opponentId = isHome ? playerMatch.awayTeamId : playerMatch.homeTeamId;
        const opponent = playerDiv.teams.find(t => t.id === opponentId)!;
        const playerTeam = playerDiv.teams.find(t => t.id === playerTeamId)!;

        const matchEntries = processMatchFinances(
          playerDiv.id, isHome, won, drew,
          playerDiv.currentRound, playerTeam.name, opponent.name,
        );
        newFinanceEntries.push(...matchEntries);

        // Result notification
        const resultText = won ? 'Vitória!' : drew ? 'Empate' : 'Derrota';
        newNotifications.push(`${resultText} ${playerGoals} x ${opponentGoals} ${isHome ? 'vs' : '@'} ${opponent.shortName}`);
      }

      // Monthly finances every 4 rounds
      if (playerDiv.currentRound % 4 === 0) {
        const playerTeam = playerDiv.teams.find(t => t.id === playerTeamId)!;
        const monthlyEntries = processMonthlyFinances(playerDiv.id, playerTeam, playerDiv.currentRound);
        newFinanceEntries.push(...monthlyEntries);
      }
    }

    // Update balance
    const totalChange = newFinanceEntries.reduce((sum, e) => sum + e.amount, 0);
    const newBalance = finances.balance + totalChange;

    // Generate new transfer offers every 5 rounds
    let updatedOffers = transferOffers.filter(o => o.status === 'pending' && o.deadline > (playerDiv?.currentRound ?? 0));
    if (playerDiv && playerDiv.currentRound % 5 === 0) {
      const sourceTeams = updatedDivisions.flatMap(division => division.teams).filter(team => team.id !== playerTeamId);
      const newOffers = generateTransferOffers(playerDiv.id, playerDiv.currentRound, 2, sourceTeams);
      updatedOffers = [...updatedOffers, ...newOffers];
      newNotifications.push('Novas opções disponíveis no mercado de transferências!');
    }

    // Expire old offers
    const expiredOffers = transferOffers.filter(o => o.status === 'pending' && o.deadline <= (playerDiv?.currentRound ?? 0));
    if (expiredOffers.length > 0) {
      expiredOffers.forEach(o => {
        newNotifications.push(`Oferta por ${o.player.name} expirou.`);
      });
    }

    const playerRound = playerDiv?.currentRound ?? 0;
    const updatedCup = cup && playerRound > 0 && playerRound % 8 === 0 && !cup.championId
      ? simulateCupRound(cup, updatedDivisions.flatMap(division => division.teams))
      : cup;
    const reachedCupTarget = updatedCup?.rounds[objective?.cupTargetRound ?? -1]?.matches.some(match =>
      match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId,
    ) ?? false;
    const updatedObjective = objective ? {
      ...objective,
      status: playerDiv && playerDiv.standings.findIndex(standing => standing.teamId === playerTeamId) + 1 <= objective.targetPosition && reachedCupTarget
        ? 'achieved' as const
        : objective.status,
    } : null;
    const seasonEnded = updatedDivisions.every(d => d.currentRound >= d.rounds.length);

    set({
      divisions: updatedDivisions,
      lastRoundResults: allResults,
      phase: seasonEnded ? 'end-season' : 'playing',
      finances: {
        ...finances,
        balance: newBalance,
        history: [...finances.history, ...newFinanceEntries],
      },
      transferOffers: updatedOffers,
      cup: updatedCup,
      objective: updatedObjective,
      notifications: newNotifications,
    });
  },

  simulateAllRounds: () => {
    // Simulate round by round to properly process finances
    const { divisions, playerTeamId } = get();
    const playerDiv = divisions.find(d => d.teams.some(t => t.id === playerTeamId));
    const remainingRounds = playerDiv ? playerDiv.rounds.length - playerDiv.currentRound : 0;

    for (let i = 0; i < remainingRounds; i++) {
      get().simulateRound();
    }
  },

  endSeason: () => {
    const { divisions, season, playerTeamId, seasonHistory, finances } = get();

    // Record player position
    let playerDivisionId = 0;
    let playerPosition = 0;
    for (const div of divisions) {
      const pos = div.standings.findIndex(s => s.teamId === playerTeamId);
      if (pos !== -1) {
        playerDivisionId = div.id;
        playerPosition = pos + 1;
        break;
      }
    }

    // Season prize
    const prizeEntry = processEndSeasonPrize(playerDivisionId, playerPosition, 34);
    const newBalance = finances.balance + prizeEntry.amount;

    const promoted = (playerDivisionId === 2 || playerDivisionId === 3) && playerPosition <= 4;
    const relegated = (playerDivisionId === 1 || playerDivisionId === 2) && playerPosition > 14;

    const newHistory: SeasonResult[] = [...seasonHistory, { season, division: playerDivisionId, position: playerPosition, promoted, relegated }];

    // Promotion/Relegation
    const div1 = divisions.find(d => d.id === 1)!;
    const div2 = divisions.find(d => d.id === 2)!;
    const div3 = divisions.find(d => d.id === 3)!;

    const div1Relegated = div1.standings.slice(-4).map(s => div1.teams.find(t => t.id === s.teamId)!);
    const div2Promoted = div2.standings.slice(0, 4).map(s => div2.teams.find(t => t.id === s.teamId)!);
    const div2Relegated = div2.standings.slice(-4).map(s => div2.teams.find(t => t.id === s.teamId)!);
    const div3Promoted = div3.standings.slice(0, 4).map(s => div3.teams.find(t => t.id === s.teamId)!);

    // New division compositions (keep squads intact)
    const newDiv1Teams = [
      ...div1.teams.filter(t => !div1Relegated.some(r => r.id === t.id)),
      ...div2Promoted,
    ];
    const newDiv2Teams = [
      ...div2.teams.filter(t => !div2Promoted.some(p => p.id === t.id) && !div2Relegated.some(r => r.id === t.id)),
      ...div1Relegated,
      ...div3Promoted,
    ];
    const newDiv3Teams = [
      ...div3.teams.filter(t => !div3Promoted.some(p => p.id === t.id)),
      ...div2Relegated,
    ];

    const newDivisions = createDivisions(
      newDiv1Teams.map(progressSquad),
      newDiv2Teams.map(progressSquad),
      newDiv3Teams.map(progressSquad),
    );

    // Generate fresh transfer offers for new season
    const newPlayerDiv = newDivisions.find(d => d.teams.some(t => t.id === playerTeamId));
    const sourceTeams = newDivisions.flatMap(division => division.teams).filter(team => team.id !== playerTeamId);
    const newOffers = generateTransferOffers(newPlayerDiv?.id ?? 3, 0, 4, sourceTeams);
    const newCup = generateCup(newDivisions.flatMap(division => division.teams), playerTeamId!);
    const newObjective: SeasonObjective = {
      description: 'Terminar entre os 4 primeiros e chegar às quartas da Copa Nacional.',
      targetPosition: 4,
      cupTargetRound: 1,
      status: 'in-progress',
    };

    set({
      season: season + 1,
      phase: 'playing',
      divisions: newDivisions,
      lastRoundResults: [],
      seasonHistory: newHistory,
      finances: {
        balance: newBalance,
        monthlyIncome: 0,
        monthlySalaries: finances.monthlySalaries,
        history: [...finances.history, prizeEntry],
      },
      transferOffers: newOffers,
      cup: newCup,
      objective: newObjective,
      notifications: [
        `Temporada ${season + 1} iniciada!`,
        promoted ? 'Parabéns! Seu time foi promovido!' : relegated ? 'Infelizmente, seu time foi rebaixado.' : 'Seu time permanece na mesma divisão.',
      ],
    });
  },

  getPlayerDivision: () => {
    const { divisions, playerTeamId } = get();
    return divisions.find(d => d.teams.some(t => t.id === playerTeamId));
  },

  getPlayerTeam: () => {
    const { divisions, playerTeamId } = get();
    for (const div of divisions) {
      const team = div.teams.find(t => t.id === playerTeamId);
      if (team) return team;
    }
    return undefined;
  },

  getTeamById: (id: string) => {
    const { divisions } = get();
    for (const div of divisions) {
      const team = div.teams.find(t => t.id === id);
      if (team) return team;
    }
    return undefined;
  },

  setLineup: (playerIds: string[]) => {
    const { divisions, playerTeamId } = get();
    const uniquePlayerIds = [...new Set(playerIds)];
    if (uniquePlayerIds.length !== 11) return;

    set({
      divisions: divisions.map(division => ({
        ...division,
        teams: division.teams.map(team => {
          if (team.id !== playerTeamId) return team;
          const validIds = new Set(team.squad.map(player => player.id));
          return uniquePlayerIds.every(id => validIds.has(id)) ? { ...team, lineup: uniquePlayerIds } : team;
        }),
      })),
    });
  },

  setTactics: (formation: Formation, approach: TacticalApproach) => {
    const { divisions, playerTeamId } = get();
    set({
      divisions: divisions.map(division => ({
        ...division,
        teams: division.teams.map(team =>
          team.id === playerTeamId
            ? { ...team, tactics: { formation, approach }, lineup: createLineup(team.squad, formation) }
            : team
        ),
      })),
    });
  },

  makeOffer: (offerId: string, price: number, salary: number) => {
    const { transferOffers, finances, playerTeamId, divisions } = get();
    const offer = transferOffers.find(o => o.id === offerId);
    if (!offer) return { success: false, reason: 'Oferta não encontrada.' };

    if (price > finances.balance) {
      return { success: false, reason: 'Saldo insuficiente para essa proposta.' };
    }

    const result = attemptSigning(offer, price, salary);

    if (result.success) {
      // Add player to squad
      const player = { ...offer.player, salary, contractYears: 3, morale: 75 };
      const updatedDivisions = divisions.map(div => ({
        ...div,
        teams: div.teams.map(team => {
          if (team.id === playerTeamId) return { ...team, squad: [...team.squad, player] };
          if (team.id === offer.fromTeamId) {
            return {
              ...team,
              budget: team.budget + price,
              squad: team.squad.filter(candidate => candidate.id !== offer.player.id),
              lineup: team.lineup?.filter(id => id !== offer.player.id),
            };
          }
          return team;
        }),
      }));

      // Update finances
      const entry: FinanceEntry = {
        round: 0,
        type: 'transfer_out',
        amount: -price,
        description: `Contratação: ${player.name} (${player.position})`,
      };

      set({
        divisions: updatedDivisions,
        finances: {
          ...finances,
          balance: finances.balance - price,
          monthlySalaries: finances.monthlySalaries + salary,
          history: [...finances.history, entry],
        },
        transferOffers: transferOffers.map(o => o.id === offerId ? { ...o, status: 'accepted' as const } : o),
        notifications: [`${player.name} foi contratado!`],
      });
    } else {
      set({
        transferOffers: transferOffers.map(o => o.id === offerId ? { ...o, status: 'rejected' as const } : o),
        notifications: [result.reason],
      });
    }

    return result;
  },

  sellPlayer: (playerId: string) => {
    const { divisions, playerTeamId, finances } = get();
    const playerTeam = divisions.flatMap(division => division.teams).find(team => team.id === playerTeamId);
    const player = playerTeam?.squad.find(candidate => candidate.id === playerId);
    if (!player || !playerTeam) return { success: false, reason: 'Jogador não encontrado.' };
    if (playerTeam.squad.length <= 11) return { success: false, reason: 'Mantenha ao menos 11 jogadores no elenco.' };

    const salePrice = Math.round(player.marketValue * 0.9 / 1000) * 1000;
    const entry: FinanceEntry = {
      round: 0,
      type: 'transfer_in',
      amount: salePrice,
      description: `Venda: ${player.name} (${player.position})`,
    };

    set({
      divisions: divisions.map(division => ({
        ...division,
        teams: division.teams.map(team => team.id === playerTeamId
          ? { ...team, squad: team.squad.filter(candidate => candidate.id !== playerId), lineup: team.lineup?.filter(id => id !== playerId) }
          : team),
      })),
      finances: {
        ...finances,
        balance: finances.balance + salePrice,
        monthlySalaries: finances.monthlySalaries - player.salary,
        history: [...finances.history, entry],
      },
      notifications: [`${player.name} foi vendido por $${salePrice.toLocaleString()}.`],
    });
    return { success: true, reason: 'Venda concluída.' };
  },

  renewContract: (playerId: string, salary: number, years: number) => {
    const { divisions, playerTeamId, finances } = get();
    if (!Number.isFinite(salary) || salary <= 0 || !Number.isInteger(years) || years < 1 || years > 5) {
      return { success: false, reason: 'Informe salário válido e contrato entre 1 e 5 anos.' };
    }
    const playerTeam = divisions.flatMap(division => division.teams).find(team => team.id === playerTeamId);
    const player = playerTeam?.squad.find(candidate => candidate.id === playerId);
    if (!player) return { success: false, reason: 'Jogador não encontrado.' };

    set({
      divisions: divisions.map(division => ({
        ...division,
        teams: division.teams.map(team => team.id === playerTeamId
          ? { ...team, squad: team.squad.map(candidate => candidate.id === playerId ? { ...candidate, salary, contractYears: years, morale: Math.min(100, candidate.morale + 5) } : candidate) }
          : team),
      })),
      finances: { ...finances, monthlySalaries: finances.monthlySalaries - player.salary + salary },
      notifications: [`Contrato de ${player.name} renovado por ${years} ano(s).`],
    });
    return { success: true, reason: 'Contrato renovado.' };
  },

  dismissOffer: (offerId: string) => {
    const { transferOffers } = get();
    set({
      transferOffers: transferOffers.filter(o => o.id !== offerId),
    });
  },

  resetGame: () => {
    set({
      phase: 'menu',
      coachName: '',
      playerTeamId: null,
      season: 1,
      divisions: [],
      lastRoundResults: [],
      seasonHistory: [],
      finances: INITIAL_FINANCES,
      transferOffers: [],
      cup: null,
      objective: null,
      liveMatch: null,
      preMatchAnalysis: null,
      postMatchReport: null,
      notifications: []
    });
  },
}), {
  name: 'tecnico-de-futebol-career',
  version: 1,
  partialize: (state) => ({
    phase: state.phase,
    coachName: state.coachName,
    playerTeamId: state.playerTeamId,
    season: state.season,
    divisions: state.divisions,
    lastRoundResults: state.lastRoundResults,
    seasonHistory: state.seasonHistory,
    finances: state.finances,
    transferOffers: state.transferOffers,
    cup: state.cup,
    objective: state.objective,
    liveMatch: state.liveMatch,
    preMatchAnalysis: state.preMatchAnalysis,
    postMatchReport: state.postMatchReport,
    notifications: state.notifications,
  }),
}));
