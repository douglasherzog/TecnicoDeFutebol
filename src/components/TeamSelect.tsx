import { useState } from 'react';
import { User, Shuffle } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export function NewGame() {
  const { phase, startNewGame } = useGameStore();
  const [name, setName] = useState('');

  if (phase !== 'new-game') return null;

  const handleStart = () => {
    if (name.trim().length < 2) return;
    startNewGame(name.trim());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-900/50 flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Novo Técnico</h1>
          <p className="text-gray-400 mt-1">Digite seu nome para começar</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="coach-name" className="text-sm font-medium text-gray-300">
            Nome do Técnico
          </label>
          <input
            id="coach-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="Ex: Carlos Alberto"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            autoFocus
          />
        </div>

        <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Shuffle className="w-4 h-4 text-yellow-400" />
            <span>Você receberá um time aleatório da <strong className="text-yellow-400">Terceira Divisão</strong></span>
          </div>
          <p className="text-xs text-gray-500">
            Sua missão: subir de divisão, gerenciar finanças e montar um elenco competitivo até chegar ao torneio internacional.
          </p>
        </div>

        <button
          onClick={handleStart}
          disabled={name.trim().length < 2}
          className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition cursor-pointer"
        >
          Iniciar Carreira
        </button>

        <button
          onClick={() => useGameStore.setState({ phase: 'menu' })}
          className="w-full text-center text-gray-400 hover:text-white transition text-sm cursor-pointer"
        >
          ← Voltar ao Menu
        </button>
      </div>
    </div>
  );
}
