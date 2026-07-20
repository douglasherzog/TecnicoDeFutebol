import { afterEach, describe, expect, it, vi } from 'vitest';
import { attemptSigning, generateTransferOffers } from './transferMarket';
import type { Team, TransferOffer } from '../types';

const offer: TransferOffer = {
  id: 'offer-1',
  player: {
    id: 'player-1',
    name: 'Jogador Teste',
    age: 23,
    position: 'ATA',
    overall: 70,
    potential: 80,
    stamina: 85,
    salary: 10000,
    marketValue: 500000,
    contractYears: 2,
    morale: 80,
  },
  fromTeamId: null,
  askingPrice: 500000,
  salary: 10000,
  deadline: 3,
  status: 'pending',
  competingOffers: 0,
};

const sourceTeam: Team = {
  id: 'source-team',
  name: 'Clube Vendedor',
  shortName: 'CV',
  colors: { primary: '#000000', secondary: '#FFFFFF' },
  squad: [offer.player],
  budget: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('attemptSigning', () => {
  it('creates a club-owned offer when a source team is available', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const [generatedOffer] = generateTransferOffers(3, 0, 1, [sourceTeam]);

    expect(generatedOffer.fromTeamId).toBe(sourceTeam.id);
    expect(generatedOffer.player.id).toBe(offer.player.id);
  });

  it('rejects an offer below the minimum transfer value', () => {
    expect(attemptSigning(offer, 424999, 10000)).toMatchObject({
      success: false,
      reason: 'Proposta muito baixa. O jogador recusou.',
    });
  });

  it('rejects an offer below the minimum salary', () => {
    expect(attemptSigning(offer, 500000, 7999)).toMatchObject({
      success: false,
      reason: 'Salário oferecido muito baixo. O jogador recusou.',
    });
  });

  it('accepts a strong proposal with a favorable roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(attemptSigning(offer, 600000, 12000)).toMatchObject({
      success: true,
      reason: 'O jogador aceitou a proposta!',
    });
  });
});
