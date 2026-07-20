import { create } from 'zustand';
import type { Division, Finances, FinanceEntry, GamePhase, Match, SeasonResult, Standing, Team, TransferOffer } from '../types';
import { division1Teams, division2Teams, division3Teams } from '../data/teams';
import type { TeamBase } from '../data/teams';
import { generateFixtures } from '../engine/fixtureGenerator';
import { simulateMatch } from '../engine/matchEngine';
import { generateSquad, resetPlayerIdCounter } from '../engine/playerGenerator';
import { getStartingBudget, processMatchFinances, processMonthlyFinances, processEndSeasonPrize } from '../engine/financeEngine';
import { generateTransferOffers, attemptSigning, resetOfferIdCounter } from '../engine/transferMarket';

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
  notifications: string[];

  // Actions
  startNewGame: (coachName: string) => void;
  simulateRound: () => void;
  simulateAllRounds: () => void;
  endSeason: () => void;
  getPlayerDivision: () => Division | undefined;
  getPlayerTeam: () => Team | undefined;
  getTeamById: (id: string) => Team | undefined;
  makeOffer: (offerId: string, price: number, salary: number) => { success: boolean; reason: string };
  dismissOffer: (offerId: string) => void;
  resetGame: () => void;
}

function buildTeam(base: TeamBase, divisionId: number): Team {
  return {
    id: base.id,
    name: base.name,
    shortName: base.shortName,
    colors: base.colors,
    squad: generateSquad(divisionId),
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

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  coachName: '',
  playerTeamId: null,
  season: 1,
  divisions: [],
  lastRoundResults: [],
  seasonHistory: [],
  finances: INITIAL_FINANCES,
  transferOffers: [],
  notifications: [],

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
    const offers = generateTransferOffers(3, 0, 3);

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
      notifications: [`Bem-vindo, técnico ${coachName}! Você assumiu o comando do ${playerTeam.name} na Terceira Divisão.`],
    });
  },

  simulateRound: () => {
    const { divisions, playerTeamId, finances, transferOffers } = get();
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
        const result = simulateMatch(homeTeam, awayTeam, match.id);
        allResults.push(result);
        newStandings = updateStandings(newStandings, result);
        return result;
      });

      const updatedRounds = division.rounds.map((r, i) =>
        i === division.currentRound ? { ...r, matches: simulatedMatches } : r
      );

      return {
        ...division,
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
      const newOffers = generateTransferOffers(playerDiv.id, playerDiv.currentRound, 2);
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

    const newDivisions = createDivisions(newDiv1Teams, newDiv2Teams, newDiv3Teams);

    // Generate fresh transfer offers for new season
    const newPlayerDiv = newDivisions.find(d => d.teams.some(t => t.id === playerTeamId));
    const newOffers = generateTransferOffers(newPlayerDiv?.id ?? 3, 0, 4);

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
        teams: div.teams.map(team =>
          team.id === playerTeamId
            ? { ...team, squad: [...team.squad, player] }
            : team
        ),
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
      notifications: [],
    });
  },
}));
