import type { Player, Position } from '../types';
import { firstNames, lastNames } from '../data/playerNames';

let playerIdCounter = 0;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateName(): string {
  return `${randomFromArray(firstNames)} ${randomFromArray(lastNames)}`;
}

// Division affects overall ranges
// Division 1: 65-92 | Division 2: 50-75 | Division 3: 35-65
function getOverallRange(divisionId: number): [number, number] {
  switch (divisionId) {
    case 1: return [65, 92];
    case 2: return [50, 75];
    case 3: return [35, 65];
    default: return [40, 60];
  }
}

// Salary scales with overall (per month in dollars)
function calculateSalary(overall: number, divisionId: number): number {
  const base = overall * overall * 2; // quadratic scaling
  const divMultiplier = divisionId === 1 ? 3 : divisionId === 2 ? 1.5 : 1;
  return Math.round((base * divMultiplier) / 100) * 100; // round to nearest 100
}

// Market value scales with overall, age, and potential
function calculateMarketValue(overall: number, age: number, potential: number): number {
  const baseValue = overall * overall * 50;
  const ageFactor = age < 24 ? 1.5 : age < 28 ? 1.2 : age < 32 ? 0.8 : 0.4;
  const potentialBonus = (potential - overall) * 1000;
  return Math.round((baseValue * ageFactor + potentialBonus) / 1000) * 1000;
}

// Standard squad composition: 3 GOL, 4 ZAG, 4 LAT, 4 VOL, 4 MEI, 3 ATA = 22 players
const SQUAD_TEMPLATE: Position[] = [
  'GOL', 'GOL', 'GOL',
  'ZAG', 'ZAG', 'ZAG', 'ZAG',
  'LAT', 'LAT', 'LAT', 'LAT',
  'VOL', 'VOL', 'VOL', 'VOL',
  'MEI', 'MEI', 'MEI', 'MEI',
  'ATA', 'ATA', 'ATA', 'ATA',
];

export function generatePlayer(position: Position, divisionId: number, isStarter: boolean = true): Player {
  const [minOvr, maxOvr] = getOverallRange(divisionId);
  const starterBonus = isStarter ? 5 : -3;
  const overall = Math.min(99, Math.max(1, randomInt(minOvr + starterBonus, maxOvr + starterBonus)));
  const age = randomInt(18, 35);
  const potential = Math.min(99, overall + randomInt(0, age < 24 ? 15 : 5));

  playerIdCounter++;
  const id = `player-${playerIdCounter}`;

  return {
    id,
    name: generateName(),
    age,
    position,
    overall,
    potential,
    stamina: randomInt(50, 95),
    salary: calculateSalary(overall, divisionId),
    marketValue: calculateMarketValue(overall, age, potential),
    contractYears: randomInt(1, 4),
    morale: randomInt(55, 85),
  };
}

export function generateSquad(divisionId: number): Player[] {
  return SQUAD_TEMPLATE.map((position, index) => {
    // First players in each position group are starters
    const isStarter = (
      (position === 'GOL' && index < 1) ||
      (position === 'ZAG' && index < 5) ||
      (position === 'LAT' && index < 9) ||
      (position === 'VOL' && index < 11) ||
      (position === 'MEI' && index < 15) ||
      (position === 'ATA' && index < 19)
    );
    return generatePlayer(position, divisionId, isStarter);
  });
}

export function getTeamStrength(squad: Player[]): number {
  if (squad.length === 0) return 30;
  // Best 11 players' average overall
  const sorted = [...squad].sort((a, b) => b.overall - a.overall);
  const best11 = sorted.slice(0, 11);
  const avg = best11.reduce((sum, p) => sum + p.overall, 0) / best11.length;
  return Math.round(avg);
}

export function generateFreeAgent(divisionId: number): Player {
  const position = randomFromArray(SQUAD_TEMPLATE);
  return generatePlayer(position, divisionId, false);
}

export function resetPlayerIdCounter() {
  playerIdCounter = 0;
}
