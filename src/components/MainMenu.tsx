import { Trophy } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export function MainMenu() {
  const { phase, openNewGame } = useGameStore();

  if (phase !== 'menu') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="text-center space-y-8">
        <div className="flex items-center justify-center gap-4">
          <Trophy className="w-16 h-16 text-yellow-400" />
          <h1 className="text-5xl font-bold text-white tracking-tight">
            Técnico de Futebol
          </h1>
          <Trophy className="w-16 h-16 text-yellow-400" />
        </div>
        <p className="text-green-200 text-xl max-w-md mx-auto">
          Comece na Terceira Divisão e conduza seu time até a glória internacional!
        </p>
        <div className="space-y-3 text-green-300/80 text-sm max-w-sm mx-auto">
          <p>3 divisões • 54 times • Promoção e rebaixamento</p>
          <p>Gerencie elenco, finanças e transferências</p>
        </div>
        <button
          onClick={openNewGame}
          className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-green-900 font-bold text-xl rounded-lg shadow-lg transition-all hover:scale-105 cursor-pointer"
        >
          Novo Jogo
        </button>
      </div>
    </div>
  );
}
