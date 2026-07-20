// ==================== CORE ====================

export type Position = 'GOL' | 'ZAG' | 'LAT' | 'VOL' | 'MEI' | 'ATA';

export interface Player {
  id: string;
  name: string;
  age: number;
  position: Position;
  overall: number; // 1-100
  potential: number; // max overall this player can reach
  stamina: number; // 1-100, affects consistency
  salary: number; // monthly salary in dollars
  marketValue: number; // transfer value in dollars
  contractYears: number; // years left on contract
  morale: number; // 1-100
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  colors: { primary: string; secondary: string };
  squad: Player[];
  budget: number; // available cash in dollars
}

export interface Standing {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
}

export interface Round {
  number: number;
  matches: Match[];
}

export interface Division {
  id: number; // 1, 2, or 3
  name: string;
  teams: Team[];
  standings: Standing[];
  rounds: Round[];
  currentRound: number;
}

// ==================== FINANCES ====================

export interface FinanceEntry {
  round: number;
  type: 'gate' | 'tv' | 'prize' | 'win_bonus' | 'draw_bonus' | 'transfer_in' | 'salary' | 'transfer_out' | 'travel';
  amount: number; // positive = income, negative = expense
  description: string;
}

export interface Finances {
  balance: number;
  monthlyIncome: number;
  monthlySalaries: number;
  history: FinanceEntry[];
}

// ==================== TRANSFERS ====================

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface TransferOffer {
  id: string;
  player: Player;
  fromTeamId: string | null; // null = free agent
  askingPrice: number;
  salary: number; // salary the player wants
  deadline: number; // round number when offer expires
  status: OfferStatus;
  competingOffers: number; // how many other clubs want this player
}

// ==================== GAME STATE ====================

export type GamePhase = 'menu' | 'new-game' | 'playing' | 'end-season' | 'transfer-window';

export interface SeasonResult {
  season: number;
  division: number;
  position: number;
  promoted: boolean;
  relegated: boolean;
}

