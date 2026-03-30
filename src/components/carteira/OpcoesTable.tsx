'use client';
import React from 'react';
import { useOpcoes } from '@/hooks/useOpcoes';
import { OpcaoAtivo, OpcaoSecao } from '@/types/opcoes';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';

const SECTION_ORDER = ['put', 'call'] as const;
const SECTION_NAMES: Record<string, string> = {
  put: 'PUT',
  call: 'CALL',
};

const formatVencimento = (vencimento: string) => {
  const date = new Date(vencimento);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

interface OpcoesTableProps {
  totalCarteira?: number;
}

export default function OpcoesTable({ totalCarteira = 0 }: OpcoesTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useOpcoes();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  const columns: ColumnDef<OpcaoAtivo, OpcaoSecao>[] = [
    {
      key: 'nome',
      header: 'Nome do Ativo',
      align: 'left',
      render: (a) => (
        <div>
          <AssetNameLink portfolioId={a.id} ticker={a.nome} nomeComoPrincipal />
          {a.observacoes && <div className="text-xs text-black mt-1">{a.observacoes}</div>}
        </div>
      ),
      renderSectionTotal: (s) => (
        <div className="flex items-center space-x-2">
          <span>{s.nome}</span>
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
            {s.tipo === 'put' ? 'PUT' : 'CALL'}
          </span>
        </div>
      ),
    },
    {
      key: 'compraVenda',
      header: 'Compra/Venda',
      align: 'center',
      render: (a) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {a.compraVenda.charAt(0).toUpperCase() + a.compraVenda.slice(1)}
        </span>
      ),
      renderSectionTotal: () => '-',
      renderGrandTotal: () => '-',
    },
    {
      key: 'vencimento',
      header: 'Vencimento',
      align: 'center',
      render: (a) => (
        <span className="font-medium text-black">{formatVencimento(a.vencimento)}</span>
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
      header: 'Preco Aquisicao',
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
      header: 'Cotacao em Tempo Real',
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

  return (
    <GenericAssetTable<OpcaoAtivo, OpcaoSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados de opcoes..."
      columns={columns}
      getSecoes={(d) => (d.secoes as OpcaoSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.tipo}
      getSectionName={(s) => s.nome || SECTION_NAMES[s.tipo]}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="opcoes"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="Opcoes - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
    />
  );
}
