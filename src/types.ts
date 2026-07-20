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

export type Formation = '4-3-3' | '4-4-2' | '4-2-3-1';
export type TacticalApproach = 'defensive' | 'balanced' | 'attacking';

export interface TeamTactics {
  formation: Formation;
  approach: TacticalApproach;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  colors: { primary: string; secondary: string };
  squad: Player[];
  lineup?: string[];
  tactics?: TeamTactics;
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

export type MatchEventType =
  | 'kickoff' | 'goal' | 'save' | 'miss' | 'foul' | 'card' | 'red_card'
  | 'penalty_goal' | 'penalty_miss' | 'injury' | 'own_goal' | 'sub'
  | 'halftime' | 'fulltime';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  teamId: string | null;
  description: string;
  xg?: number; // expected goals of the attempt, attributed to the attacking team
  playerId?: string; // player involved in the event
}

export type CommentatorStyle = 'technical' | 'passionate' | 'neutral';

export interface PlayerRating {
  playerId: string;
  name: string;
  position: Position;
  rating: number; // 0-10
  goals: number;
  assists: number;
  saves: number;
  cards: number;
}

export interface PreMatchAnalysis {
  homeStrength: number;
  awayStrength: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  recentForm: { teamId: string; results: ('W' | 'D' | 'L')[] }[];
}

export interface PostMatchReport {
  match: Match;
  homeStats: LiveTeamStats;
  awayStats: LiveTeamStats;
  homeRatings: PlayerRating[];
  awayRatings: PlayerRating[];
  manOfTheMatch: PlayerRating | null;
  homeApproach: TacticalApproach;
  awayApproach: TacticalApproach;
  events: MatchEvent[];
}

export interface LiveTeamStats {
  shots: number;
  onTarget: number;
  xg: number;
  fouls: number;
  cards: number;
  possession: number;
}

export interface LiveMatch {
  match: Match;
  events: MatchEvent[];
  homeApproach: TacticalApproach;
  awayApproach: TacticalApproach;
  substitutionsUsed?: number;
  commentatorStyle?: CommentatorStyle;
  postMatchReport?: PostMatchReport;
}

export interface Division {
  id: number; // 1, 2, or 3
  name: string;
  teams: Team[];
  standings: Standing[];
  rounds: Round[];
  currentRound: number;
}

export interface CupRound {
  name: string;
  matches: Match[];
}

export interface CupCompetition {
  name: string;
  rounds: CupRound[];
  currentRound: number;
  championId: string | null;
}

export interface SeasonObjective {
  description: string;
  targetPosition: number;
  cupTargetRound: number;
  status: 'in-progress' | 'achieved' | 'missed';
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

export type GamePhase = 'menu' | 'new-game' | 'playing' | 'pre-match' | 'live-match' | 'post-match' | 'end-season' | 'transfer-window';

export interface SeasonResult {
  season: number;
  division: number;
  position: number;
  promoted: boolean;
  relegated: boolean;
}

