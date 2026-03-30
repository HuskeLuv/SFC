'use client';
import React from 'react';
import { useFii } from '@/hooks/useFii';
import { FiiAtivo, FiiSecao, TipoFii } from '@/types/fii';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  BasicTablePlaceholderRows,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import ComponentCard from '@/components/common/ComponentCard';
import PieChartFiiSegmento from '@/components/charts/pie/PieChartFiiSegmento';
import PieChartFiiAtivo from '@/components/charts/pie/PieChartFiiAtivo';
import {
  StandardTable,
  StandardTableHeader,
  StandardTableHeaderRow,
  StandardTableHeaderCell,
  StandardTableRow,
  StandardTableBodyCell,
  TableBody,
} from '@/components/ui/table/StandardTable';

const SECTION_ORDER = ['fof', 'tvm', 'tijolo'] as const;
const SECTION_NAMES: Record<string, string> = {
  fof: 'FOF',
  tvm: 'TVM',
  tijolo: 'Tijolo',
};
const MIN_PLACEHOLDER_ROWS = 4;

interface FiiTableProps {
  totalCarteira?: number;
}

export default function FiiTable({ totalCarteira = 0 }: FiiTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useFii();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  // FII has a custom normalization for section types (fofi -> fof, ijol -> tijolo)
  const normalizeTipo = (tipo: TipoFii) => {
    if (tipo === 'fofi' || tipo === 'fof') return 'fof';
    if (tipo === 'ijol' || tipo === 'tijolo') return 'tijolo';
    if (tipo === 'tvm') return 'tvm';
    return null;
  };

  const columns: ColumnDef<FiiAtivo, FiiSecao>[] = [
    {
      key: 'nome',
      header: 'Nome do Ativo',
      align: 'left',
      render: (a) => (
        <div>
          <AssetNameLink portfolioId={a.id} ticker={a.ticker} nome={a.nome} />
          {a.observacoes && <div className="text-xs mt-1">{a.observacoes}</div>}
        </div>
      ),
    },
    {
      key: 'mandato',
      header: 'Mandato',
      align: 'center',
      render: (a) => a.mandato,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'segmento',
      header: 'Segmento',
      align: 'center',
      render: (a) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {a.segmento.charAt(0).toUpperCase() + a.segmento.slice(1)}
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
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAplicado as number) || 0),
    },
    {
      key: 'cotacaoAtual',
      header: 'Cotacao Atual',
      align: 'right',
      render: (a, f) => <span>{f.formatCurrency(a.cotacaoAtual)}</span>,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorAtualizado',
      header: 'Valor Atualizado',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.valorAtualizado),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
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
      header: 'Nec. Aporte R$',
      align: 'right',
      render: (a, f) => <span>{f.formatCurrency(a.necessidadeAporte)}</span>,
      renderSectionTotal: (s, f) => <span>{f.formatCurrency(s.totalNecessidadeAporte)}</span>,
      renderGrandTotal: (t, f) => (
        <span>{f.formatCurrency((t?.necessidadeAporte as number) || 0)}</span>
      ),
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
    <GenericAssetTable<FiiAtivo, FiiSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados FIIs..."
      columns={columns}
      getSecoes={(d) => (d.secoes as FiiSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => {
        const normalized = normalizeTipo(s.tipo);
        return normalized ?? s.tipo;
      }}
      getSectionName={(s) => s.nome || SECTION_NAMES[normalizeTipo(s.tipo) ?? s.tipo]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      metricGridCols="lg:grid-cols-5"
      necessidadeAporteKey="fiis"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="FIIs - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
    >
      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <ComponentCard title="Alocacao por Segmento">
            <PieChartFiiSegmento data={data?.alocacaoSegmento ?? []} />
          </ComponentCard>
        </div>
        <div className="xl:col-span-6">
          <ComponentCard title="Alocacao por Ativo">
            <PieChartFiiAtivo data={data?.alocacaoAtivo ?? []} />
          </ComponentCard>
        </div>
      </div>

      {/* Aux table */}
      <ComponentCard title="Resumo de Aportes">
        <StandardTable>
          <StandardTableHeader headerBgColor="#9E8A58">
            <StandardTableHeaderRow headerBgColor="#9E8A58">
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">
                Ticker
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="left" headerBgColor="#9E8A58">
                Nome
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Cotacao Atual
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Necessidade Aporte
              </StandardTableHeaderCell>
              <StandardTableHeaderCell align="right" headerBgColor="#9E8A58">
                Lote Aproximado
              </StandardTableHeaderCell>
            </StandardTableHeaderRow>
          </StandardTableHeader>
          <TableBody>
            {(data?.tabelaAuxiliar || []).map((item, index) => (
              <StandardTableRow key={index}>
                <StandardTableBodyCell align="left">{item.ticker}</StandardTableBodyCell>
                <StandardTableBodyCell align="left">{item.nome}</StandardTableBodyCell>
                <StandardTableBodyCell align="right">
                  {formatCurrency(item.cotacaoAtual)}
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right">
                  <span>{formatCurrency(item.necessidadeAporte)}</span>
                </StandardTableBodyCell>
                <StandardTableBodyCell align="right">
                  {formatNumber(item.loteAproximado)}
                </StandardTableBodyCell>
              </StandardTableRow>
            ))}
            <BasicTablePlaceholderRows
              count={Math.max(0, MIN_PLACEHOLDER_ROWS - (data?.tabelaAuxiliar?.length || 0))}
              colSpan={5}
            />
          </TableBody>
        </StandardTable>
      </ComponentCard>
    </GenericAssetTable>
  );
}
