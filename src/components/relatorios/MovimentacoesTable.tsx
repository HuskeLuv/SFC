'use client';

import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';
import MovimentacoesCards from './mobile/MovimentacoesCards';

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
  /** Categoria efetiva (a da pizza/aba, com o mover) — use esta para classificar por classe. */
  categoria: CategoriaCarteira | null;
  quantidade: number;
  /** Valor em R$ (o que o resumo do período soma). */
  total: number;
  jaInvestido: boolean;
  /** Unidade gravada da transação (Carteira EUA em US$). Ausente = 'BRL'. */
  moeda?: 'BRL' | 'USD';
  /** Total na `moeda` (US$ sem taxas quando moeda = 'USD'). */
  totalMoeda?: number;
  /** Câmbio da operação (R$ por US$ 1); null em R$ ou sem câmbio. */
  cotacaoMoeda?: number | null;
  /** Total em R$ (US$ × câmbio + taxas); null = sem câmbio. */
  valorBRL?: number | null;
}

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const usd = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

/** Linha em US$: valor nativo com o R$ ao lado (ou o aviso de câmbio ausente). */
export function ValorMovimentacao({ mov }: { mov: Movimentacao }) {
  if (mov.moeda !== 'USD') return <>{brl(mov.total)}</>;
  const cotacao =
    mov.cotacaoMoeda != null
      ? `US$ 1 = R$ ${mov.cotacaoMoeda.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
      : undefined;
  return (
    <span className="inline-flex flex-col items-end">
      <span>{usd(mov.totalMoeda ?? 0)}</span>
      <span className="text-xs font-normal text-gray-500 dark:text-gray-400" title={cotacao}>
        {mov.valorBRL != null ? `≈ ${brl(mov.valorBRL)}` : 'sem câmbio'}
      </span>
    </span>
  );
}

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
  const isBelowLg = useIsBelowLg();
  if (movimentacoes.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Sem movimentações no período selecionado.
      </div>
    );
  }

  return (
    <>
      {isBelowLg ? (
        <div className="hidden mscreen:block">
          <MovimentacoesCards movimentacoes={movimentacoes} totalNoPeriodo={totalNoPeriodo} />
        </div>
      ) : null}
      <div className={`${TABLE_STYLES.wrapper}${isBelowLg ? ' mscreen:hidden' : ''}`}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              {['Data', 'Operação', 'Ativo', 'Valor'].map((h, i) => (
                <th key={h} className={`${TABLE_STYLES.th} ${i >= 3 ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimentacoes.map((mov) => (
              <tr key={mov.id} className={TABLE_STYLES.row}>
                <td className={TABLE_STYLES.td}>{fmtData(mov.data)}</td>
                <td className={TABLE_STYLES.td}>
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
                <td className={TABLE_STYLES.td}>{mov.ativo}</td>
                <td
                  className={`${TABLE_STYLES.td} text-right font-medium text-gray-900 dark:text-white`}
                >
                  <ValorMovimentacao mov={mov} />
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
    </>
  );
}
