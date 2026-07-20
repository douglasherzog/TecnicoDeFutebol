import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export function FinancesView() {
  const { finances } = useGameStore();

  const recentHistory = [...finances.history].reverse().slice(0, 20);
  const totalIncome = finances.history.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalExpense = finances.history.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-yellow-400" />
            <p className="text-xs text-gray-400">Saldo Atual</p>
          </div>
          <p className={`text-2xl font-bold ${finances.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${finances.balance.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <p className="text-xs text-gray-400">Total Recebido</p>
          </div>
          <p className="text-2xl font-bold text-green-400">${totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <p className="text-xs text-gray-400">Total Gasto</p>
          </div>
          <p className="text-2xl font-bold text-red-400">${Math.abs(totalExpense).toLocaleString()}</p>
        </div>
      </div>

      {/* Monthly Info */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-2">Resumo Mensal</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Folha Salarial</p>
            <p className="text-red-400 font-medium">-${finances.monthlySalaries.toLocaleString()}/mês</p>
          </div>
          <div>
            <p className="text-gray-400">Cotas TV (por mês)</p>
            <p className="text-green-400 font-medium">Varia por divisão</p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <h3 className="text-white font-semibold px-4 py-3 border-b border-gray-700">
          Histórico Financeiro
        </h3>
        {recentHistory.length === 0 ? (
          <p className="text-gray-400 text-sm p-4">Nenhuma movimentação ainda.</p>
        ) : (
          <div className="divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
            {recentHistory.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{entry.description}</p>
                  <p className="text-xs text-gray-500">Rodada {entry.round}</p>
                </div>
                <span className={`font-medium text-sm ml-4 ${entry.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.amount >= 0 ? '+' : ''}${entry.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
