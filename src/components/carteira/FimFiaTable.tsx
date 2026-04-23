'use client';
import React from 'react';
import { useFimFia } from '@/hooks/useFimFia';
import { FimFiaAtivo, FimFiaSecao } from '@/types/fimFia';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
  EditableValorCell,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';

const SECTION_ORDER = ['fim', 'fia'] as const;
const SECTION_NAMES: Record<string, string> = {
  fim: 'FIM',
  fia: 'FIA',
};

interface FimFiaTableProps {
  totalCarteira?: number;
}

export default function FimFiaTable({ totalCarteira = 0 }: FimFiaTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    updateObjetivo,
    updateValorAtualizado,
    updateCaixaParaInvestir,
  } = useFimFia();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const handleUpdateValorAtualizado = async (ativoId: string, novoValor: number) => {
    await updateValorAtualizado(ativoId, novoValor);
  };

  const columns: ColumnDef<FimFiaAtivo, FimFiaSecao>[] = [
    {
      key: 'nome',
      header: 'Nome dos Ativos',
      align: 'left',
      render: (a) => (
        <div>
          <AssetNameLink
            portfolioId={a.id}
            ticker={`${a.categoriaNivel1} \u2022 ${a.subcategoriaNivel2}`}
            nome={a.nome}
            nomeComoPrincipal
          />
          {a.observacoes && <div className="text-xs mt-1">{a.observacoes}</div>}
        </div>
      ),
    },
    {
      key: 'cotizacaoResgate',
      header: 'Cot. Resgate',
      align: 'center',
      render: (a) => a.cotizacaoResgate,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'liquidacaoResgate',
      header: 'Liq. Resgate',
      align: 'center',
      render: (a) => a.liquidacaoResgate,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'categoriaNivel1',
      header: 'Cat. Nivel 1',
      align: 'center',
      render: (a) => a.categoriaNivel1,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'subcategoriaNivel2',
      header: 'Subcat. Nivel 2',
      align: 'center',
      render: (a) => a.subcategoriaNivel2,
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'valorInicialAplicado',
      header: 'Valor Inicial',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.valorInicialAplicado),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAplicado),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAplicado as number) || 0),
    },
    {
      key: 'aporte',
      header: 'Aporte',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.aporte),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalAporte),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.aporte as number) || 0),
    },
    {
      key: 'resgate',
      header: 'Resgate',
      align: 'right',
      render: (a, f) => f.formatCurrency(a.resgate),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalResgate),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.resgate as number) || 0),
    },
    {
      key: 'valorAtualizado',
      header: 'Valor Atualizado',
      align: 'right',
      render: (a, f) =>
        a.isAutoUpdated ? (
          <span title="Sincronizado automaticamente (cota CVM)">
            {f.formatCurrency(a.valorAtualizado)}
          </span>
        ) : (
          <EditableValorCell
            ativoId={a.id}
            valorAtualizado={a.valorAtualizado}
            formatCurrency={f.formatCurrency}
            onUpdateValorAtualizado={handleUpdateValorAtualizado}
            locale="pt-BR"
            placeholder="0,00"
          />
        ),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalValorAtualizado),
      renderGrandTotal: (t, f) => f.formatCurrency((t?.valorAtualizado as number) || 0),
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
      render: (a, f) => f.formatCurrency(a.necessidadeAporte),
      renderSectionTotal: (s, f) => f.formatCurrency(s.totalNecessidadeAporte),
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

  // formatNumber is not used by FimFia but is required by GenericAssetTable
  const formatNumber = (value: number) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <GenericAssetTable<FimFiaAtivo, FimFiaSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados FIM/FIA..."
      columns={columns}
      getSecoes={(d) => (d.secoes as FimFiaSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.tipo}
      getSectionName={(s) => s.nome || SECTION_NAMES[s.tipo]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="fimFia"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="FIM/FIA - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
    />
  );
}
