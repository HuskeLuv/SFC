'use client';

import { CATEGORIA_LABELS } from '@/lib/carteiraCategoryColors';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_SECTION_STYLE,
} from '@/components/ui/table/tableStyles';

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
    <div className={TABLE_STYLES.wrapper}>
      <table className={TABLE_STYLES.table}>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th className={`${TABLE_STYLES.th} text-left`}>Ativo</th>
            <th className={`${TABLE_STYLES.th} text-right`}>Valor Atual</th>
            <th className={`${TABLE_STYLES.th} text-right`}>% da Carteira</th>
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
          <tr className={`${TABLE_STYLES.totalRow} font-semibold`}>
            <td className={`${TABLE_STYLES.td} font-semibold`}>Total Geral</td>
            <td className={`${TABLE_STYLES.td} text-right font-semibold`}>{brl(totalGeral)}</td>
            <td className={`${TABLE_STYLES.td} text-right font-semibold`}>100%</td>
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
      {/* Linha da categoria = seção (azul tranquilidade) do padrão único de tabelas */}
      <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
        <td className={`${TABLE_STYLES.td} text-white`}>
          {CATEGORIA_LABELS[secao.categoria] ?? secao.categoria}
        </td>
        <td className={`${TABLE_STYLES.td} text-right text-white`}>{brl(subtotal)}</td>
        <td className={`${TABLE_STYLES.td} text-right text-white`}>
          {pctOf(subtotal, totalGeral)}
        </td>
      </tr>
      {secao.ativos
        .slice()
        .sort((a, b) => b.valorAtual - a.valorAtual)
        .map((ativo) => (
          <tr key={ativo.portfolioId} className={TABLE_STYLES.row}>
            <td className={`${TABLE_STYLES.td} pl-8`}>{ativo.nome}</td>
            <td className={`${TABLE_STYLES.td} text-right`}>{brl(ativo.valorAtual)}</td>
            <td className={`${TABLE_STYLES.td} text-right`}>
              <span className="text-gray-500 dark:text-gray-400">
                {pctOf(ativo.valorAtual, totalGeral)}
              </span>
            </td>
          </tr>
        ))}
    </>
  );
}
