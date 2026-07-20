import type { Team, TransferOffer } from '../types';
import { generateFreeAgent } from './playerGenerator';

let offerIdCounter = 0;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate transfer offers available to the player
// Called every few rounds during transfer windows
export function generateTransferOffers(
  playerDivisionId: number,
  currentRound: number,
  count: number = 3,
  sourceTeams: Team[] = [],
): TransferOffer[] {
  const offers: TransferOffer[] = [];

  for (let i = 0; i < count; i++) {
    // Mix of players from same division and one division above/below
    const divForPlayer = randomInt(
      Math.max(1, playerDivisionId - 1),
      Math.min(3, playerDivisionId + 1),
    );
    const sourceTeam = sourceTeams.length > 0 && Math.random() < 0.65
      ? sourceTeams[randomInt(0, sourceTeams.length - 1)]
      : undefined;
    const player = sourceTeam?.squad[randomInt(0, sourceTeam.squad.length - 1)] ?? generateFreeAgent(divForPlayer);

    // Asking price varies: some are bargains, some are expensive
    const priceVariation = randomInt(80, 150) / 100;
    const askingPrice = Math.round((player.marketValue * priceVariation) / 1000) * 1000;

    // Salary the player demands (can be above or below current calc)
    const salaryVariation = randomInt(85, 130) / 100;
    const salary = Math.round((player.salary * salaryVariation) / 100) * 100;

    // Competing offers make it harder to negotiate
    const competingOffers = randomInt(0, 3);

    offerIdCounter++;
    offers.push({
      id: `offer-${offerIdCounter}`,
      player,
      fromTeamId: sourceTeam?.id ?? null,
      askingPrice,
      salary,
      deadline: currentRound + randomInt(2, 5),
      status: 'pending',
      competingOffers,
    });
  }

  return offers;
}

// Attempt to sign a player. Returns success based on competition and offer quality
export function attemptSigning(
  offer: TransferOffer,
  offeredPrice: number,
  offeredSalary: number,
): { success: boolean; reason: string } {
  // Check if price meets minimum
  if (offeredPrice < offer.askingPrice * 0.85) {
    return { success: false, reason: 'Proposta muito baixa. O jogador recusou.' };
  }

  // Check if salary meets minimum
  if (offeredSalary < offer.salary * 0.8) {
    return { success: false, reason: 'Salário oferecido muito baixo. O jogador recusou.' };
  }

  // Base chance of success
  let chance = 60;

  // Better price = better chance
  const priceRatio = offeredPrice / offer.askingPrice;
  if (priceRatio >= 1.2) chance += 25;
  else if (priceRatio >= 1.0) chance += 15;
  else if (priceRatio >= 0.9) chance += 5;

  // Better salary = better chance
  const salaryRatio = offeredSalary / offer.salary;
  if (salaryRatio >= 1.2) chance += 20;
  else if (salaryRatio >= 1.0) chance += 10;

  // Competing offers reduce chance
  chance -= offer.competingOffers * 15;

  // Roll the dice
  const roll = randomInt(1, 100);

  if (roll <= chance) {
    return { success: true, reason: 'O jogador aceitou a proposta!' };
  }

  // Failure reasons
  if (offer.competingOffers > 0 && roll > chance + 10) {
    return { success: false, reason: 'O jogador preferiu a proposta de outro clube.' };
  }

  return { success: false, reason: 'O jogador não se convenceu com a proposta. Tente melhorar os valores.' };
}

export function resetOfferIdCounter() {
  offerIdCounter = 0;
}
