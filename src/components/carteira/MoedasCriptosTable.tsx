'use client';
import React, { useMemo } from 'react';
import { useMoedasCriptos } from '@/hooks/useMoedasCriptos';
import { MoedaCriptoAtivo, MoedaCriptoSecao } from '@/types/moedas-criptos';
import {
  GenericAssetTable,
  ColumnDef,
  MetricCardConfig,
  EditableObjetivoCell,
} from '@/components/carteira/shared';
import AssetNameLink from '@/components/carteira/AssetNameLink';

const SECTION_ORDER = ['moedas', 'criptomoedas', 'metais_joias'] as const;
const SECTION_NAMES: Record<string, string> = {
  moedas: 'Moedas',
  criptomoedas: 'Criptomoedas',
  metais_joias: 'Metais e Joias',
};

interface MoedasCriptosTableProps {
  totalCarteira?: number;
}

export default function MoedasCriptosTable({ totalCarteira = 0 }: MoedasCriptosTableProps) {
  const {
    data,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    formatNumber,
    updateObjetivo,
    updateCaixaParaInvestir,
  } = useMoedasCriptos();

  const handleUpdateObjetivo = async (ativoId: string, novoObjetivo: number) => {
    await updateObjetivo(ativoId, novoObjetivo);
  };

  // MoedasCriptos has a custom risk computation (flat ativos, not per-section)
  const ativosComRisco = useMemo(() => {
    if (!data) return [];

    const ativos = data.secoes.flatMap((secao) => secao.ativos);
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map((ativo) => {
      const percentualCarteira =
        totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
      const objetivo = ativo.objetivo || 0;
      const quantoFalta = objetivo - percentualCarteira;
      const necessidadeAporte =
        totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0;

      return {
        ...ativo,
        riscoPorAtivo: shouldCalculateRisco
          ? Math.min(100, (ativo.valorAtualizado / totalCarteira) * 100)
          : 0,
        percentualCarteira,
        quantoFalta,
        necessidadeAporte,
      };
    });
  }, [data, totalCarteira]);

  const normalizedSections = useMemo(() => {
    const resolveSectionRegion = (ativos: MoedaCriptoAtivo[]) => {
      const hasUs = ativos.some((ativo) => ativo.regiao === 'estados_unidos');
      const hasBr = ativos.some((ativo) => ativo.regiao === 'brasil');
      if (hasUs && hasBr) return 'internacional';
      if (hasUs) return 'estados_unidos';
      return 'brasil';
    };

    const buildSection = (
      tipo: (typeof SECTION_ORDER)[number],
      nome: string,
      ativos: MoedaCriptoAtivo[],
    ): MoedaCriptoSecao => {
      const totalQuantidade = ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
      const totalValorAplicado = ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
      const totalValorAtualizado = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
      const totalRisco = ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
      const totalPercentualCarteira = ativos.reduce(
        (sum, ativo) => sum + ativo.percentualCarteira,
        0,
      );
      const totalObjetivo = ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
      const totalQuantoFalta = ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
      const totalNecessidadeAporte = ativos.reduce(
        (sum, ativo) => sum + ativo.necessidadeAporte,
        0,
      );
      const rentabilidadeMedia = ativos.length
        ? ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / ativos.length
        : 0;

      return {
        tipo,
        nome,
        regiao: resolveSectionRegion(ativos),
        ativos,
        totalQuantidade,
        totalValorAplicado,
        totalValorAtualizado,
        totalRisco,
        totalPercentualCarteira,
        totalObjetivo,
        totalQuantoFalta,
        totalNecessidadeAporte,
        rentabilidadeMedia,
      };
    };

    const grouped = {
      moedas: [] as MoedaCriptoAtivo[],
      criptomoedas: [] as MoedaCriptoAtivo[],
      metais_joias: [] as MoedaCriptoAtivo[],
    };

    ativosComRisco.forEach((ativo) => {
      if (ativo.tipo === 'moeda') {
        grouped.moedas.push(ativo);
        return;
      }
      if (ativo.tipo === 'criptomoeda') {
        grouped.criptomoedas.push(ativo);
        return;
      }
      if (ativo.tipo === 'metal') {
        grouped.metais_joias.push(ativo);
        return;
      }
      grouped.metais_joias.push(ativo);
    });

    return SECTION_ORDER.map((tipo) => {
      const nome = SECTION_NAMES[tipo];
      return buildSection(tipo, nome, grouped[tipo]);
    });
  }, [ativosComRisco]);

  const columns: ColumnDef<MoedaCriptoAtivo, MoedaCriptoSecao>[] = [
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
      render: (a) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs">
          {a.indiceRastreado.charAt(0).toUpperCase() + a.indiceRastreado.slice(1).replace('_', ' ')}
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
      header: 'Preco Aquisicao',
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
      header: 'Cotacao em Tempo Real',
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
    <GenericAssetTable<MoedaCriptoAtivo, MoedaCriptoSecao>
      data={data as unknown as Record<string, unknown>}
      loading={loading}
      error={error}
      loadingText="Carregando dados de moedas e criptomoedas..."
      columns={columns}
      getSecoes={(d) => (d.secoes as MoedaCriptoSecao[]) ?? []}
      getSectionAtivos={(s) => s.ativos}
      getSectionKey={(s) => s.tipo}
      getSectionName={(s) => s.nome}
      getTotalGeral={(d) => (d.totalGeral as Record<string, unknown>) ?? {}}
      getResumo={(d) => (d.resumo as Record<string, unknown>) ?? {}}
      metricCards={metricCards}
      necessidadeAporteKey="moedasCriptos"
      onUpdateCaixaParaInvestir={updateCaixaParaInvestir}
      sectionOrder={SECTION_ORDER}
      sectionNames={SECTION_NAMES}
      tableTitle="Moedas, Criptomoedas & Outros - Detalhamento"
      formatCurrency={formatCurrency}
      formatPercentage={formatPercentage}
      formatNumber={formatNumber}
      totalCarteira={totalCarteira}
      normalizedSections={normalizedSections}
      dataComRisco={data as unknown as Record<string, unknown>}
    />
  );
}
