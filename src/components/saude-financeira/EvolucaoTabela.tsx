'use client';

import type { EvolucaoPonto, SnapshotData } from '@/hooks/useSaudeFinanceira';
import { formatBRLCompact, formatPercent, MONTH_NAMES_PT, STATUS_META } from './utils';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';

interface EvolucaoTabelaProps {
  snapshots: EvolucaoPonto[];
}

/** Últimas N fotos exibidas na tabela (a mais recente sempre entra). */
const MAX_COLUNAS = 12;

interface LinhaIndicador {
  chave: string;
  label: string;
  render: (data: SnapshotData) => string;
}

const LINHAS: LinhaIndicador[] = [
  { chave: 'renda', label: 'Renda mensal', render: (d) => formatBRLCompact(d.rendaMensal) },
  { chave: 'gasto', label: 'Gasto mensal', render: (d) => formatBRLCompact(d.gastoMensal) },
  {
    chave: 'poupanca',
    label: 'Poupança mensal',
    render: (d) => formatBRLCompact(d.poupancaMensal),
  },
  { chave: 'taxa', label: 'Taxa de poupança', render: (d) => formatPercent(d.taxaPoupanca) },
  {
    chave: 'altaLiquidez',
    label: 'Invest. alta liquidez',
    render: (d) => formatBRLCompact(d.ativosAltaLiquidez),
  },
  {
    chave: 'baixaLiquidez',
    label: 'Invest. baixa liquidez',
    render: (d) => formatBRLCompact(d.ativosBaixaLiquidez),
  },
  {
    chave: 'totalInvestimentos',
    label: 'Total de ativos',
    render: (d) => formatBRLCompact(d.ativosAltaLiquidez + d.ativosBaixaLiquidez),
  },
  {
    chave: 'rentabilidade',
    label: 'Rentabilidade (a.a.)',
    render: (d) => formatPercent(d.rentabilidadeAA),
  },
  {
    chave: 'patrimonioLiquido',
    label: 'Patrimônio líquido',
    render: (d) => formatBRLCompact(d.patrimonioLiquido),
  },
];

/**
 * Tabela "Evolução Indicadores Financeiros" da planilha: uma coluna por foto
 * mensal, uma linha por indicador, fechando com o status ED/FR/EQ do mês.
 */
export default function EvolucaoTabela({ snapshots }: EvolucaoTabelaProps) {
  const pontos = snapshots.slice(-MAX_COLUNAS);
  if (pontos.length < 2) return null;

  return (
    <div className={`mt-4 ${TABLE_STYLES.wrapper}`}>
      {/* Até 13 colunas (indicador + 12 fotos): variante compacta do padrão. */}
      <table className={`${TABLE_STYLES.table} min-w-[560px]`}>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th className={`${TABLE_STYLES.compact.th} text-left`}>Indicador</th>
            {pontos.map((p) => (
              <th key={`${p.year}-${p.month}`} className={`${TABLE_STYLES.compact.th} text-right`}>
                {MONTH_NAMES_PT[p.month] ?? p.month + 1}/{String(p.year).slice(-2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((linha) => (
            <tr key={linha.chave} className={TABLE_STYLES.row}>
              <td className={TABLE_STYLES.compact.td}>{linha.label}</td>
              {pontos.map((p) => (
                <td
                  key={`${p.year}-${p.month}`}
                  className={`${TABLE_STYLES.compact.td} text-right font-medium text-gray-900 dark:text-white/90`}
                >
                  {linha.render(p.data)}
                </td>
              ))}
            </tr>
          ))}
          <tr className={TABLE_STYLES.row}>
            <td className={TABLE_STYLES.compact.td}>Status</td>
            {pontos.map((p) => {
              const meta = STATUS_META[p.data.status];
              return (
                <td
                  key={`${p.year}-${p.month}`}
                  className={`${TABLE_STYLES.compact.td} text-right`}
                >
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                    title={meta.label}
                  >
                    {p.data.status}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
