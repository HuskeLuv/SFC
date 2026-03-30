'use client';
import React from 'react';
import { useEtf } from '@/hooks/useEtf';
import { EtfAtivo, EtfSecao } from '@/types/etf';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  BasicTablePlaceholderRows,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import ComponentCard from '@/components/common/ComponentCard';
import PieChartEtfAtivo from '@/components/charts/pie/PieChartEtfAtivo';

const SECTION_ORDER = ['brasil', 'estados_unidos'] as const;
const SECTION_NAMES: Record<string, string> = {
  brasil: 'Brasil',
  estados_unidos: 'EUA',
};
const MIN_PLACEHOLDER_ROWS = 4;

interface EtfTableProps {
  totalCarteira?: number;
}

export default function EtfTable({ totalCarteira = 0 }: EtfTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useEtf();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const columns: ColumnDef<EtfAtivo, EtfSecao>[] = [
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
      key: 'indiceRastreado',
      header: 'Indice Rastreado',
      align: 'center',
      render: (a) =>
        a.indiceRastreado.charAt(0).toUpperCase() + a.indiceRastreado.slice(1).replace('_', ' '),
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
      render: (a, f) => {
        const currency = a.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(a.precoAquisicao, currency);
      },
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorTotal',
      header: 'Valor Total',
      align: 'right',
      render: (a, f) => {
        const currency = a.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(a.valorTotal, currency);
      },
      renderSectionTotal: (s, f) => {
        const currency = s.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(s.totalValorAplicado, currency);
      },
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAplicado as number) || 0),
    },
    {
      key: 'cotacaoAtual',
      header: 'Cotacao Atual',
      align: 'right',
      render: (a, f) => {
        const currency = a.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return <span className="text-black">{f.formatCurrency(a.cotacaoAtual, currency)}</span>;
      },
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorAtualizado',
      header: 'Valor Atualizado',
      align: 'right',
      render: (a, f) => {
        const currency = a.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(a.valorAtualizado, currency);
      },
      renderSectionTotal: (s, f) => {
        const currency = s.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(s.totalValorAtualizado, currency);
      },
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAtualizado as number) || 0),
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
      render: (a, f) => {
        const currency = a.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(a.necessidadeAporte, currency);
      },
      renderSectionTotal: (s, f) => {
        const currency = s.regiao === 'estados_unidos' ? 'USD' : 'BRL';
        return f.formatCurrency(s.totalNecessidadeAporte, currency);
      },
      renderGrandTotal: (t, f) => f.formatCurrency((t?.necessidadeAporte as number) || 0),
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

  const metricCards: MetricCardConfig[] = [
    {
      title: 'Necessidade de Aporte Total',
      getValue: (_r, nec) => formatCurrency(nec ?? 0),
      color: 'warning',
    },
    { title: '__CAIXA_PARA_INVESTIR__', getValue: () => '', color: 'success' },
    {
      title: 'Saldo Inicio do Mes',
      getValue: (r) => formatCurrency((r?.saldoInicioMes as number) ?? 0),
    },
    {
      title: 'Valor Atualizado',
      getValue: (r) => formatCurrency((r?.valorAtualizado as number) ?? 0),
    },
    {
      title: 'Rendimento',
      getValue: (r) => formatCurrency((r?.rendimento as number) ?? 0),
      color: 'success',
    },
    {
      title: 'Rentabilidade',
      getValue: (r) => formatPercentage((r?.rentabilidade as number) ?? 0),
      color: 'success',
    },
  ];

  return (
    <GenericAssetTable<EtfAtivo, EtfSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados ETF..."
      columns={columns}
      getSecoes={(d) => (d.secoes as EtfSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.regiao}
      getSectionName={(s) => s.nome || SECTION_NAMES[s.regiao]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="etfs"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="ETF's - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
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
                      <td className="px-2 py-2 text-xs font-medium text-black">{item.ticker}</td>
                      <td className="px-2 py-2 text-xs text-right font-medium text-black">
                        {formatCurrency(item.cotacaoAtual)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-medium">
                        <span
                          className={
                            item.necessidadeAporte > 0
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-gray-600 dark:text-gray-400'
                          }
                        >
                          {formatCurrency(item.necessidadeAporte)}
                        </span>
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
            <PieChartEtfAtivo data={data?.alocacaoAtivo ?? []} />
          </ComponentCard>
        </div>
      </div>
    </GenericAssetTable>
  );
}
