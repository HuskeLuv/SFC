'use client';
import React from 'react';
import { useCarteiraStocks } from '@/hooks/useStocks';
import { CarteiraStockAtivo, CarteiraStockSecao } from '@/types/carteiraStocks';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  BasicTablePlaceholderRows,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import ComponentCard from '@/components/common/ComponentCard';
import PieChartStocksAtivo from '@/components/charts/pie/PieChartStocksAtivo';

const SECTION_ORDER = ['value', 'growth', 'risk'] as const;
const SECTION_NAMES: Record<string, string> = {
  value: 'Value',
  growth: 'Growth',
  risk: 'Risk',
};
const MIN_PLACEHOLDER_ROWS = 4;

interface StocksTableProps {
  totalCarteira?: number;
}

export default function StocksTable({ totalCarteira = 0 }: StocksTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useCarteiraStocks();

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

  const columns: ColumnDef<CarteiraStockAtivo, CarteiraStockSecao>[] = [
    {
      key: 'nome',
      header: 'Nome do Ativo',
      align: 'left',
      render: (a) => (
        <div>
          <AssetNameLink portfolioId={a.id} ticker={a.ticker} nome={a.nome} />
          {a.dataCompra && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(a.dataCompra).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sector',
      header: 'Sector',
      align: 'center',
      render: (a) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {a.sector
            ? a.sector.charAt(0).toUpperCase() + a.sector.slice(1).replace('_', ' ')
            : 'Outros'}
        </span>
      ),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'industryCategory',
      header: 'Industry Category',
      align: 'center',
      render: (a) => a.industryCategory,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'quantidade',
      header: 'Quantidade',
      align: 'right',
      render: (a, f) => f.formatNumber(a.quantidade),
      renderSectionTotal: (s, f) => f.formatNumber(s.totalQuantidade),
      renderGrandTotal: (t, f) => f.formatNumber((t?.quantidade as number) ?? 0),
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
      renderGrandTotal: (t) => formatCurrencyBRL((t?.valorAplicado as number) ?? 0),
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
      render: (a, f) => f.formatCurrency(a.valorAtualizado),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
      renderGrandTotal: (t) => formatCurrencyBRL((t?.valorAtualizado as number) ?? 0),
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
      renderGrandTotal: (t, f) => f.formatPercentage((t?.objetivo as number) ?? 0),
    },
    {
      key: 'quantoFalta',
      header: 'Quanto Falta',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.quantoFalta),
      renderSectionTotal: (s, f) => f.formatPercentage(s.totalQuantoFalta),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.quantoFalta as number) ?? 0),
    },
    {
      key: 'necessidadeAporte',
      header: 'Nec. Aporte $',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.necessidadeAporte),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalNecessidadeAporte),
      renderGrandTotal: (t) => formatCurrencyBRL((t?.necessidadeAporte as number) ?? 0),
    },
    {
      key: 'rentabilidade',
      header: 'Rentabilidade',
      align: 'right',
      render: (a, f) => f.formatPercentage(a.rentabilidade),
      renderSectionTotal: (s, f) => f.formatPercentage(s.rentabilidadeMedia),
      renderGrandTotal: (t, f) => f.formatPercentage((t?.rentabilidade as number) ?? 0),
    },
  ];

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

  // Extra "TOTAL EM USD" row — mesma ordem e contagem das 14 colunas acima
  const extraTotalRows = (
    <tr className="bg-[#404040] border-b border-gray-300">
      <td className="px-2 py-2 text-xs text-white font-bold">TOTAL EM USD</td>
      <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-center text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">
        {formatCurrency(
          ((data?.totalGeral as unknown as Record<string, unknown>)?.valorAplicado as number) ?? 0,
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-white font-bold">-</td>
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

  return (
    <GenericAssetTable<CarteiraStockAtivo, CarteiraStockSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados Stocks..."
      columns={columns}
      getSecoes={(d) => (d.secoes as CarteiraStockSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.estrategia}
      getSectionName={(s) => s.nome || SECTION_NAMES[s.estrategia]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="stocks"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="Stocks - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
      extraTotalRows={extraTotalRows}
    >
      {/* Charts and aux table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Distribuicao por Ativo">
            <PieChartStocksAtivo data={data?.alocacaoAtivo ?? []} />
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Resumo de Aportes">
            <div className="overflow-x-auto">
              <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Data da Compra
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
                      <td className="px-2 py-2 text-xs text-black">{item.nome}</td>
                      <td className="px-2 py-2 text-xs text-black">
                        {item.dataCompra
                          ? new Date(item.dataCompra).toLocaleDateString('pt-BR')
                          : '-'}
                      </td>
                      <td className="px-2 py-2 text-xs text-right text-black">
                        {formatCurrency(item.cotacaoAtual)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right text-black">
                        {formatCurrency(item.necessidadeAporte)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right text-black">
                        {formatNumber(item.loteAproximado)}
                      </td>
                    </tr>
                  ))}
                  <BasicTablePlaceholderRows
                    count={Math.max(0, MIN_PLACEHOLDER_ROWS - (data?.tabelaAuxiliar?.length || 0))}
                    colSpan={5}
                  />
                </tbody>
              </table>
            </div>
          </ComponentCard>
        </div>
      </div>
    </GenericAssetTable>
  );
}
