import { useState } from 'react';
import { ShoppingCart, X, UserPlus } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import type { TransferOffer } from '../types';

function OfferCard({ offer }: { offer: TransferOffer }) {
  const { makeOffer, dismissOffer, finances } = useGameStore();
  const [offeredPrice, setOfferedPrice] = useState(offer.askingPrice);
  const [offeredSalary, setOfferedSalary] = useState(offer.salary);
  const [result, setResult] = useState<string | null>(null);
  const [showNegotiation, setShowNegotiation] = useState(false);

  const canAfford = finances.balance >= offeredPrice;

  const handleMakeOffer = () => {
    const res = makeOffer(offer.id, offeredPrice, offeredSalary);
    setResult(res.reason);
  };

  if (offer.status !== 'pending') return null;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-white font-semibold">{offer.player.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
              {offer.player.position}
            </span>
            <span className="text-xs text-gray-400">OVR: {offer.player.overall}</span>
            <span className="text-xs text-gray-400">POT: {offer.player.potential}</span>
            <span className="text-xs text-gray-400">{offer.player.age} anos</span>
          </div>
        </div>
        <button
          onClick={() => dismissOffer(offer.id)}
          className="text-gray-500 hover:text-red-400 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
        <div>
          <p className="text-gray-400 text-xs">Valor pedido</p>
          <p className="text-white font-medium">${offer.askingPrice.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Salário pedido</p>
          <p className="text-white font-medium">${offer.salary.toLocaleString()}/mês</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Concorrência</p>
          <p className={`font-medium ${offer.competingOffers > 1 ? 'text-red-400' : offer.competingOffers > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            {offer.competingOffers === 0 ? 'Nenhuma' : `${offer.competingOffers} clube(s)`}
          </p>
        </div>
      </div>

      {result && (
        <div className={`mt-3 p-2 rounded text-sm ${result.includes('aceitou') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
          {result}
        </div>
      )}

      {!result && !showNegotiation && (
        <button
          onClick={() => setShowNegotiation(true)}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Negociar
        </button>
      )}

      {!result && showNegotiation && (
        <div className="mt-3 space-y-3 border-t border-gray-700 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Sua oferta (valor)</label>
              <input
                type="number"
                value={offeredPrice}
                onChange={(e) => setOfferedPrice(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-green-500"
                step={1000}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Salário oferecido</label>
              <input
                type="number"
                value={offeredSalary}
                onChange={(e) => setOfferedSalary(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-green-500"
                step={100}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMakeOffer}
              disabled={!canAfford}
              className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition cursor-pointer"
            >
              {canAfford ? 'Enviar Proposta' : 'Saldo Insuficiente'}
            </button>
            <button
              onClick={() => setShowNegotiation(false)}
              className="px-3 py-2 text-gray-400 hover:text-white text-sm transition cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransferMarket() {
  const { transferOffers, finances } = useGameStore();

  const pendingOffers = transferOffers.filter(o => o.status === 'pending');

  return (
    <div className="space-y-4">
      {/* Budget info */}
      <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-yellow-400" />
          <span className="text-white font-medium">Orçamento disponível</span>
        </div>
        <span className={`text-xl font-bold ${finances.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          ${finances.balance.toLocaleString()}
        </span>
      </div>

      {/* Available offers */}
      {pendingOffers.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">Nenhum jogador disponível no momento.</p>
          <p className="text-gray-500 text-sm mt-1">Novas ofertas aparecem a cada 5 rodadas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingOffers.map(offer => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}
