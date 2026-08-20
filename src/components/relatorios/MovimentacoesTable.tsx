'use client';

/**
 * Movimentações do período no relatório (ticket 20/08/2026, formato do
 * extrato dos relatórios Gorila/Kinvo). Presentacional; dados da rota
 * /api/relatorios/movimentacoes.
 */

export interface Movimentacao {
  id: string;
  data: string; // yyyy-mm-dd
  operacao: string; // compra | venda
  ativo: string;
  tipoAtivo: string | null;
  quantidade: number;
  total: number;
  jaInvestido: boolean;
}

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function MovimentacoesTable({
  movimentacoes,
  totalNoPeriodo,
}: {
  movimentacoes: Movimentacao[];
  totalNoPeriodo: number;
}) {
  if (movimentacoes.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Sem movimentações no período selecionado.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            {['Data', 'Operação', 'Ativo', 'Valor'].map((h, i) => (
              <th
                key={h}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${i >= 3 ? 'text-right' : 'text-left'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {movimentacoes.map((mov) => (
            <tr key={mov.id} className="border-t border-gray-100 dark:border-gray-800/60">
              <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{fmtData(mov.data)}</td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    mov.operacao === 'compra'
                      ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400'
                      : 'bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400'
                  }`}
                >
                  {mov.operacao === 'compra' ? 'Compra' : 'Venda'}
                </span>
                {mov.jaInvestido && (
                  <span
                    className="ml-2 text-[11px] text-gray-400"
                    title="Dinheiro já estava investido (rolagem/troca/posição pré-existente)"
                  >
                    já investido
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{mov.ativo}</td>
              <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">
                {brl(mov.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalNoPeriodo > movimentacoes.length && (
        <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400 dark:border-gray-800">
          Exibindo as {movimentacoes.length} movimentações mais recentes de {totalNoPeriodo} no
          período.
        </p>
      )}
    </div>
  );
}
