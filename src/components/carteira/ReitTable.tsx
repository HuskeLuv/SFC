'use client';
import React from 'react';
import { useReit } from '@/hooks/useReit';
import { ReitAtivo, ReitSecao } from '@/types/reit';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  BasicTablePlaceholderRows,
  metricColorBySign,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import ComponentCard from '@/components/common/ComponentCard';
import { TABLE_STYLES, TABLE_HEADER_STYLE } from '@/components/ui/table/tableStyles';
import PieChartReitAtivo from '@/components/charts/pie/PieChartReitAtivo';

const SECTION_ORDER = ['value', 'growth', 'risk'] as const;
const SECTION_NAMES: Record<string, string> = {
  value: 'Value',
  growth: 'Growth',
  risk: 'Risk',
};
const MIN_PLACEHOLDER_ROWS = 4;

interface ReitTableProps {
  totalCarteira?: number;
}

export default function ReitTable({ totalCarteira = 0 }: ReitTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useReit();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const cotacaoDolar = data?.cotacaoDolar ?? null;
  const formatCurrencyBRL = (valueUSD: number) =>
    cotacaoDolar != null
      ? (valueUSD * cotacaoDolar).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })
      : formatCurrency(valueUSD);
  // Para valores que JÁ estão em BRL (ex.: necessidade de aporte, calculada
  // sobre a carteira total em reais) — não converter por cotacaoDolar.
  const formatBRL = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const columns: ColumnDef<ReitAtivo, ReitSecao>[] = [
    {
      key: 'nome',
      header: 'Nome do Ativo',
      align: 'left',
      render: (a) => (
        <div>
          <AssetNameLink portfolioId={a.id} ticker={a.ticker} nome={a.nome} />
          {a.observacoes && (
            <div className="text-xs text-gray-900 dark:text-white mt-1">{a.observacoes}</div>
          )}
        </div>
      ),
    },
    {
      key: 'setor',
      header: 'Setor',
      align: 'center',
      render: (a) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {a.setor.charAt(0).toUpperCase() + a.setor.slice(1).replace('_', ' ')}
        </span>
      ),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'quantidade',
      header: 'Quantidade',
      align: 'right',
      render: (a, f) => f.formatNumber(a.quantidade),
      renderSectionTotal: (s, f) => f.formatNumber(s.totalQuantidade),
      renderGrandTotal: (t, f) => f.formatNumber((t?.quantidade as number) || 0),
    },
    {
      key: 'precoAquisicao',
      header: 'Preco Medio',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.precoAquisicao),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorTotal',
      header: 'Valor Total',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.valorTotal),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAplicado),
      renderGrandTotal: (t) => formatCurrencyBRL((t?.valorAplicado as number) || 0),
    },
    {
      key: 'cotacaoAtual',
      header: 'Cotacao Atual',
      align: 'right',
      render: (a, f) => (
        <span className="text-gray-900 dark:text-white">{f.formatCurrency(a.cotacaoAtual)}</span>
      ),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorAtualizado',
      header: 'Valor Atualizado',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.valorAtualizado),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
      renderGrandTotal: (t) => formatCurrencyBRL((t?.valorAtualizado as number) || 0),
    },
    {
      key: 'riscoPorAtivo',
      header: (
        <>
          <span className="block">Risco Por Ativo</span>
          <span className="block">(Carteira Total)</span>
        </>
      ),
      align: 'right',
      render: (a, f) => f.formatPercentage(a.riscoPorAtivo),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalRisco),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.risco as number) || 0),
    },
    {
      key: 'percentualCarteira',
      header: '% da Aba',
      highlight: true,
      align: 'right',
      render: (a, f) => f.formatPercentage(a.percentualCarteira),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalPercentualCarteira),
      renderGrandTotal: () => '100.00%',
    },
    {
      key: 'objetivo',
      header: 'Objetivo',
      align: 'right',
      render: (a, f) => (
        <EditableObjetivoCell
          ativoId={a.id}
          objetivo={a.objetivo}
          formatPercentage={f.formatPercentage}
          onUpdateObjetivo={handleUpdateObjetivo}
        />
      ),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalObjetivo),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.objetivo as number) || 0),
    },
    {
      key: 'quantoFalta',
      header: 'Quanto Falta',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.quantoFalta),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalQuantoFalta),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.quantoFalta as number) || 0),
    },
    {
      key: 'necessidadeAporte',
      header: 'Nec. Aporte $',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.necessidadeAporte),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalNecessidadeAporte),
      renderGrandTotal: (t) => formatCurrencyBRL((t?.necessidadeAporte as number) || 0),
    },
    {
      key: 'proventos',
      header: 'Proventos',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.proventos ?? 0),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalProventos ?? 0),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.proventos as number) || 0),
    },
    {
      key: 'rentabilidade',
      header: 'Rentabilidade',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.rentabilidade),
      renderSectionTotal: (s, f) => f.formatPercentage(s.rentabilidadeMedia),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.rentabilidade as number) || 0),
    },
  ];

  // Extra "TOTAL EM USD" row
  const extraTotalRows = (
    <tr className={TABLE_STYLES.totalRow}>
      <td className={`${TABLE_STYLES.compact.td} font-semibold`}>TOTAL EM USD</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-center`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-center`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>
        {formatCurrency(
          ((data?.totalGeral as unknown as Record<string, unknown>)?.valorAplicado as number) ?? 0,
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-center`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>
        {formatCurrency(
          ((data?.totalGeral as unknown as Record<string, unknown>)?.valorAtualizado as number) ??
            0,
        )}
      </td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
      <td className={`${TABLE_STYLES.compact.td} font-semibold text-right`}>-</td>
    </tr>
  );

  const metricCards: MetricCardConfig[] = [
    {
      title: 'Necessidade de Aporte Total',
      // nec vem do necessidadeAporteMap (base carteira, já em BRL) — sem conversão.
      getValue: (_r, nec) => formatBRL(nec ?? 0),
      color: 'warning',
    },
    { title: '__CAIXA_PARA_INVESTIR__', getValue: () => '', color: 'success' },
    {
      title: 'Saldo Inicio do Mes',
      getValue: (r) => formatCurrencyBRL((r?.saldoInicioMes as number) ?? 0),
    },
    {
      title: 'Valor Atualizado',
      getValue: (r) => formatCurrencyBRL((r?.valorAtualizado as number) ?? 0),
    },
    {
      title: 'Rendimento',
      getValue: (r) => formatCurrencyBRL((r?.rendimento as number) ?? 0),
      getColor: (r) => metricColorBySign((r?.rendimento as number) ?? 0),
    },
    {
      title: 'Rentabilidade',
      getValue: (r) => formatPercentage((r?.rentabilidade as number) ?? 0),
      getColor: (r) => metricColorBySign((r?.rentabilidade as number) ?? 0),
    },
  ];

  return (
    <GenericAssetTable<ReitAtivo, ReitSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados REIT..."
      columns={columns}
      getSecoes={(d) => (d.secoes as ReitSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.estrategia}
      getSectionName={(s) => s.nome || SECTION_NAMES[s.estrategia]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="reits"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="REIT - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
      cotacaoParaBRL={cotacaoDolar}
      extraTotalRows={extraTotalRows}
    >
      {/* Charts and aux table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Resumo de Aportes">
            <div className={TABLE_STYLES.wrapper}>
              <table className={TABLE_STYLES.table}>
                <thead>
                  <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                    <th className={`${TABLE_STYLES.th} text-left`}>Nome Ativo</th>
                    <th className={`${TABLE_STYLES.th} text-right`}>Cotacao Atual</th>
                    <th className={`${TABLE_STYLES.th} text-right`}>Necessidade Aporte</th>
                    <th className={`${TABLE_STYLES.th} text-right`}>Lote Aproximado</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.tabelaAuxiliar || []).map((item, index) => (
                    <tr key={index} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                      <td className={`${TABLE_STYLES.td} font-medium`}>{item.nome}</td>
                      <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                        {formatCurrency(item.cotacaoAtual)}
                      </td>
                      <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                        {formatCurrency(item.necessidadeAporte)}
                      </td>
                      <td className={`${TABLE_STYLES.td} text-right font-medium`}>
                        {formatNumber(item.loteAproximado)}
                      </td>
                    </tr>
                  ))}
                  <BasicTablePlaceholderRows
                    count={Math.max(0, MIN_PLACEHOLDER_ROWS - (data?.tabelaAuxiliar?.length || 0))}
                    colSpan={4}
                    compact={false}
                  />
                </tbody>
              </table>
            </div>
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Distribuicao por Ativo">
            <PieChartReitAtivo data={data?.alocacaoAtivo ?? []} />
          </ComponentCard>
        </div>
      </div>
    </GenericAssetTable>
  );
}
