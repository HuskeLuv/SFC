'use client';
import React from 'react';
import { useReit } from '@/hooks/useReit';
import { ReitAtivo, ReitSecao } from '@/types/reit';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  EditableValorCell,
  BasicTablePlaceholderRows,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import ComponentCard from '@/components/common/ComponentCard';
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
    updateValorAtualizado,
    updateCaixaParaInvestir,
  } = useReit();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const handleUpdateValorAtualizado = async (ativoId: string, novoValor: number) => {
    await updateValorAtualizado(ativoId, novoValor);
  };

  const cotacaoDolar = data?.cotacaoDolar ?? null;
  const formatCurrencyBRL = (valueUSD: number) =>
    cotacaoDolar != null
      ? (valueUSD * cotacaoDolar).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })
      : formatCurrency(valueUSD);

  const columns: ColumnDef<ReitAtivo, ReitSecao>[] = [
    {
      key: 'nome',
      header: 'Nome do Ativo',
      align: 'left',
      render: (a) => (
        <div>
          <AssetNameLink portfolioId={a.id} ticker={a.ticker} nome={a.nome} />
          {a.observacoes && <div className="text-xs text-black mt-1">{a.observacoes}</div>}
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
      render: (a, f) => <span className="text-black">{f.formatCurrency(a.cotacaoAtual)}</span>,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorAtualizado',
      header: 'Valor Atualizado',
      align: 'right',
      render: (a, f) => (
        <EditableValorCell
          ativoId={a.id}
          valorAtualizado={a.valorAtualizado}
          formatCurrency={f.formatCurrency}
          onUpdateValorAtualizado={handleUpdateValorAtualizado}
          locale="en-US"
          placeholder="0.00"
        />
      ),
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
      header: '% da Carteira',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.percentualCarteira),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalPercentualCarteira),
      renderGrandTotal: () => '100.00%',
    },
    {
      key: 'objetivo',
      header: 'Objetivo',
      align: 'right',
      cellClassName: 'border border-black',
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
    <tr className="bg-[#404040] border-b border-gray-300">
      <td className="px-2 py-2 text-xs text-white font-bold">TOTAL EM USD</td>
      <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatCurrency(
          ((data?.totalGeral as unknown as Record<string, unknown>)?.valorAplicado as number) ?? 0,
        )}
      </td>
      <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatCurrency(
          ((data?.totalGeral as unknown as Record<string, unknown>)?.valorAtualizado as number) ??
            0,
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
    </tr>
  );

  const metricCards: MetricCardConfig[] = [
    {
      title: 'Necessidade de Aporte Total',
      getValue: (_r, nec) => formatCurrencyBRL(nec ?? 0),
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
      color: 'success',
    },
    {
      title: 'Rentabilidade',
      getValue: (r) => formatPercentage((r?.rentabilidade as number) ?? 0),
      color: 'success',
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
      extraTotalRows={extraTotalRows}
    >
      {/* Charts and aux table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Resumo de Aportes">
            <div className="overflow-x-auto">
              <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nome Ativo
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Cotacao Atual
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Necessidade Aporte
                    </th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Lote Aproximado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.tabelaAuxiliar || []).map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-2 py-2 text-xs font-medium text-black">{item.nome}</td>
                      <td className="px-2 py-2 text-xs text-right font-medium text-black">
                        {formatCurrency(item.cotacaoAtual)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-medium text-black">
                        {formatCurrency(item.necessidadeAporte)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-medium text-black">
                        {formatNumber(item.loteAproximado)}
                      </td>
                    </tr>
                  ))}
                  <BasicTablePlaceholderRows
                    count={Math.max(0, MIN_PLACEHOLDER_ROWS - (data?.tabelaAuxiliar?.length || 0))}
                    colSpan={4}
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
