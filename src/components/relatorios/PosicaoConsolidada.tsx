'use client';

import { CATEGORIA_LABELS } from '@/lib/carteiraCategoryColors';

/**
 * Posição Consolidada do relatório (ticket 20/08/2026, formato Gorila):
 * tabela por categoria → ativo com valor atual e % da carteira, com
 * subtotais por categoria e total geral. Dados de /api/historico/ativos.
 */

export interface PosicaoSecao {
  categoria: string;
  ativos: Array<{ portfolioId: string; nome: string; symbol: string; valorAtual: number }>;
}

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pctOf = (v: number, total: number): string =>
  total > 0
    ? `${((v / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : '—';

export default function PosicaoConsolidada({ secoes }: { secoes: PosicaoSecao[] }) {
  const totalGeral = secoes.reduce(
    (sum, secao) => sum + secao.ativos.reduce((s, a) => s + a.valorAtual, 0),
    0,
  );

  if (secoes.length === 0 || totalGeral <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Sem posições para exibir.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ativo
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Valor Atual
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              % da Carteira
            </th>
          </tr>
        </thead>
        <tbody>
          {secoes.map((secao) => {
            const subtotal = secao.ativos.reduce((s, a) => s + a.valorAtual, 0);
            return (
              <SecaoRows
                key={secao.categoria}
                secao={secao}
                subtotal={subtotal}
                totalGeral={totalGeral}
              />
            );
          })}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold dark:border-gray-700 dark:bg-gray-900">
            <td className="px-4 py-3 text-gray-900 dark:text-white">Total Geral</td>
            <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
              {brl(totalGeral)}
            </td>
            <td className="px-4 py-3 text-right text-gray-900 dark:text-white">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SecaoRows({
  secao,
  subtotal,
  totalGeral,
}: {
  secao: PosicaoSecao;
  subtotal: number;
  totalGeral: number;
}) {
  return (
    <>
      <tr className="border-t border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]">
        <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-100">
          {CATEGORIA_LABELS[secao.categoria] ?? secao.categoria}
        </td>
        <td className="px-4 py-2 text-right font-medium text-gray-800 dark:text-gray-100">
          {brl(subtotal)}
        </td>
        <td className="px-4 py-2 text-right font-medium text-gray-800 dark:text-gray-100">
          {pctOf(subtotal, totalGeral)}
        </td>
      </tr>
      {secao.ativos
        .slice()
        .sort((a, b) => b.valorAtual - a.valorAtual)
        .map((ativo) => (
          <tr key={ativo.portfolioId} className="border-t border-gray-100 dark:border-gray-800/60">
            <td className="px-4 py-2 pl-8 text-gray-600 dark:text-gray-300">{ativo.nome}</td>
            <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-200">
              {brl(ativo.valorAtual)}
            </td>
            <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">
              {pctOf(ativo.valorAtual, totalGeral)}
            </td>
          </tr>
        ))}
    </>
  );
}
