'use client';
import React, { useState, useMemo, ReactNode } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import { twMerge } from 'tailwind-merge';
import { ChevronDownIcon, ChevronUpIcon } from '@/icons';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { logger } from '@/lib/logger';
import PlanejadoNameCell from './PlanejadoNameCell';
import { MetricCard } from '@/components/carteira/shared';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import { BasicTablePlaceholderRows } from '@/components/carteira/shared';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_HIGHLIGHT_HEADER_STYLE,
  TABLE_SECTION_STYLE,
} from '@/components/ui/table/tableStyles';

const MIN_PLACEHOLDER_ROWS = 4;

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

export interface ColumnDef<TAtivo, TSecao = Record<string, unknown>> {
  key: string;
  header: string | ReactNode;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  cellClassName?: string;
  /**
   * Coluna em destaque (cabeçalho sólido `outside` + células de item tingidas),
   * como a coluna do mês atual no Fluxo de Caixa. Usado no "Objetivo".
   */
  highlight?: boolean;
  /** Render the cell content for a single asset row */
  render: (ativo: TAtivo, formatters: Formatters) => ReactNode;
  /** Render the cell content for the section total row. Return '-' to show a dash. */
  renderSectionTotal?: (secao: TSecao, formatters: Formatters) => ReactNode;
  /** Render the cell content for the grand total row. Return '-' to show a dash. */
  renderGrandTotal?: (totalGeral: Record<string, unknown>, formatters: Formatters) => ReactNode;
}

export interface Formatters {
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
}

// ---------------------------------------------------------------------------
// Metric card configuration
// ---------------------------------------------------------------------------

export type MetricCardColor = 'primary' | 'success' | 'warning' | 'error';

export interface MetricCardConfig {
  title: string;
  getValue: (resumo: Record<string, unknown>, necessidadeAporte?: number) => string;
  color?: MetricCardColor;
  /**
   * Cor derivada do dado (ex.: rendimento negativo → 'error'). Quando
   * definida, tem precedência sobre `color`.
   */
  getColor?: (resumo: Record<string, unknown>, necessidadeAporte?: number) => MetricCardColor;
}

/**
 * 2.13 (auditoria jul/2026): cards Rendimento/Rentabilidade tinham
 * `color: 'success'` fixo — prejuízo aparecia em card verde. Helper único
 * para derivar a cor pelo sinal do valor.
 */
export const metricColorBySign = (value: number): MetricCardColor =>
  value < 0 ? 'error' : 'success';

// ---------------------------------------------------------------------------
// Props for the generic table
// ---------------------------------------------------------------------------

export interface GenericAssetTableProps<TAtivo, TSecao> {
  // Data & state
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  loadingText?: string;

  // Column definitions
  columns: ColumnDef<TAtivo, TSecao>[];

  // Data extractors
  getSecoes: (data: Record<string, unknown>) => TSecao[];
  getSectionAtivos: (secao: TSecao) => TAtivo[];
  getSectionKey: (secao: TSecao) => string;
  getSectionName: (secao: TSecao) => string;
  getTotalGeral: (data: Record<string, unknown>) => Record<string, unknown>;
  getResumo: (data: Record<string, unknown>) => Record<string, unknown>;

  // Metric cards
  metricCards: MetricCardConfig[];
  metricGridCols?: string;
  necessidadeAporteKey?: string;

  // CaixaParaInvestir
  onUpdateCaixaParaInvestir: (valor: number) => Promise<boolean>;

  // Section config
  sectionOrder: readonly string[];
  sectionNames: Record<string, string>;

  // Table presentation
  tableTitle: string;

  // Formatters
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;

  // Risk calculation
  totalCarteira?: number;

  /**
   * Cotação para converter valorAtualizado (moeda da aba, ex.: USD em
   * Stocks/REIT) para BRL SÓ no cálculo do risco, cujo denominador
   * (totalCarteira = resumo.totais.dinheiro) é em BRL. Não afeta
   * percentualCarteira/necessidadeAporte, que são relativos à própria aba.
   * Se null/ausente (cotação indisponível), mantém o comportamento anterior
   * (sem conversão).
   */
  cotacaoParaBRL?: number | null;

  // normalizedSections override — some tables need custom section normalization
  normalizedSections?: TSecao[];

  // dataComRisco override — some tables compute risk differently
  dataComRisco?: Record<string, unknown> | null;

  // Extra total rows (e.g., REIT has a "TOTAL EM USD" row)
  extraTotalRows?: ReactNode;

  // Extra content after the main table (charts, aux tables)
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

interface GenericSectionProps<TAtivo, TSecao> {
  secao: TSecao;
  columns: ColumnDef<TAtivo, TSecao>[];
  formatters: Formatters;
  isExpanded: boolean;
  onToggle: () => void;
  getSectionAtivos: (secao: TSecao) => TAtivo[];
  getSectionName: (secao: TSecao) => string;
  onRemovePlanejado: (planejadoId: string) => void;
}

/**
 * Ativo PLANEJADO (sem posição, 16/09/2026): só as colunas de planejamento
 * mostram valor; quantidade/preços/valores viram traço. A 1ª coluna é
 * renderizada aqui (nome + selo + remover) porque a coluna da tabela
 * linka para /ativos/<id>, e o id do planejado não é uma posição.
 */
const COLUNAS_VISIVEIS_PLANEJADO = new Set([
  'cotacaoAtual',
  'percentualCarteira',
  'objetivo',
  'quantoFalta',
  'necessidadeAporte',
]);
const isPlanejado = (ativo: unknown): boolean =>
  !!(ativo as { planejado?: boolean } | null)?.planejado;

function GenericSection<TAtivo, TSecao>({
  secao,
  columns,
  formatters,
  isExpanded,
  onToggle,
  getSectionAtivos,
  getSectionName,
  onRemovePlanejado,
}: GenericSectionProps<TAtivo, TSecao>) {
  const ativos = getSectionAtivos(secao);
  const placeholderCount = Math.max(0, MIN_PLACEHOLDER_ROWS - ativos.length);

  return (
    <>
      {/* Section header row */}
      <tr
        className={`${TABLE_STYLES.sectionRow} cursor-pointer`}
        style={TABLE_SECTION_STYLE}
        onClick={onToggle}
      >
        {columns.map((col, idx) => {
          const alignClass =
            col.align === 'right'
              ? 'text-right'
              : col.align === 'center'
                ? 'text-center'
                : 'text-left';

          if (idx === 0) {
            return (
              <td
                key={col.key}
                className={twMerge(
                  TABLE_STYLES.compact.td,
                  'text-white dark:text-white',
                  alignClass,
                  col.cellClassName,
                )}
              >
                <div className="flex items-center space-x-2">
                  {isExpanded ? (
                    <ChevronUpIcon className="w-4 h-4" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4" />
                  )}
                  <span>{getSectionName(secao)}</span>
                </div>
              </td>
            );
          }

          const content = col.renderSectionTotal ? col.renderSectionTotal(secao, formatters) : '-';

          return (
            <td
              key={col.key}
              className={twMerge(TABLE_STYLES.compact.td, 'text-white dark:text-white', alignClass)}
            >
              {content}
            </td>
          );
        })}
      </tr>

      {/* Asset rows */}
      {isExpanded &&
        ativos.map((ativo, ativoIdx) => {
          const planejado = isPlanejado(ativo);
          const a = ativo as Record<string, unknown>;
          return (
            <tr
              key={(a.id as string) ?? ativoIdx}
              className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}
              data-planejado={planejado ? 'true' : undefined}
            >
              {columns.map((col, idx) => {
                const alignClass =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                const className = `${TABLE_STYLES.compact.td} ${alignClass} ${
                  col.highlight ? TABLE_STYLES.highlightTd : ''
                } ${col.cellClassName ?? ''}`;

                if (planejado) {
                  if (idx === 0) {
                    return (
                      <td key={col.key} className={className}>
                        <PlanejadoNameCell
                          ticker={String(a.ticker ?? a.nome ?? '')}
                          nome={a.nome ? String(a.nome) : undefined}
                          onRemove={() => onRemovePlanejado(String(a.id))}
                        />
                      </td>
                    );
                  }
                  if (!COLUNAS_VISIVEIS_PLANEJADO.has(col.key)) {
                    return (
                      <td key={col.key} className={`${className} text-gray-400`}>
                        —
                      </td>
                    );
                  }
                  if (col.key === 'cotacaoAtual' && !(Number(a.cotacaoAtual) > 0)) {
                    return (
                      <td key={col.key} className={`${className} text-gray-400`}>
                        —
                      </td>
                    );
                  }
                }

                return (
                  <td key={col.key} className={className}>
                    {col.render(ativo, formatters)}
                  </td>
                );
              })}
            </tr>
          );
        })}

      {/* Placeholder rows */}
      {isExpanded && (
        <BasicTablePlaceholderRows count={placeholderCount} colSpan={columns.length} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main GenericAssetTable
// ---------------------------------------------------------------------------

export default function GenericAssetTable<TAtivo, TSecao>({
  data,
  loading,
  error,
  loadingText = 'Carregando dados...',
  columns,
  getSecoes,
  getSectionAtivos,
  getSectionKey,
  getSectionName,
  getTotalGeral,
  getResumo,
  metricCards,
  metricGridCols = 'lg:grid-cols-6',
  necessidadeAporteKey,
  onUpdateCaixaParaInvestir,
  sectionOrder,
  sectionNames,
  tableTitle,
  formatCurrency,
  formatPercentage,
  formatNumber,
  totalCarteira = 0,
  cotacaoParaBRL = null,
  normalizedSections: normalizedSectionsProp,
  dataComRisco: dataComRiscoProp,
  extraTotalRows,
  children,
}: GenericAssetTableProps<TAtivo, TSecao>) {
  const { necessidadeAporteMap } = useCarteiraResumoContext();
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();
  const [removendoPlanejado, setRemovendoPlanejado] = useState<string | null>(null);

  // Desistir de um ativo planejado (sem posição): DELETE + invalida as abas.
  const handleRemovePlanejado = async (planejadoId: string) => {
    if (removendoPlanejado) return;
    setRemovendoPlanejado(planejadoId);
    try {
      const res = await csrfFetch(`/api/carteira/planejados/${planejadoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        logger.error('Erro ao remover ativo planejado:', body?.error ?? res.status);
        return;
      }
      invalidatePortfolioDerivedQueries(queryClient);
    } catch (error) {
      logger.error('Erro ao remover ativo planejado:', error);
    } finally {
      setRemovendoPlanejado(null);
    }
  };

  // Default risk calculation
  const dataComRiscoDefault = useMemo(() => {
    if (!data) return data;
    const totalGeral = getTotalGeral(data);
    const totalTabValue = (totalGeral?.valorAtualizado as number) || 0;
    // Aba VAZIA (só planejados, sem caixa): a necessidade de aporte não tem
    // base (0 × objetivo). Usa o valor-alvo da classe na Alocação de Ativos —
    // que, com a aba zerada, é exatamente a necessidade da classe no card.
    const alvoClasse = necessidadeAporteKey
      ? ((necessidadeAporteMap as Record<string, number>)[necessidadeAporteKey] ?? 0)
      : 0;
    const baseAporte = totalTabValue > 0 ? totalTabValue : alvoClasse;
    const shouldCalculateRisco = totalCarteira > 0;
    const secoes = getSecoes(data);

    const secoesComRisco = secoes.map((secao) => {
      const ativos = getSectionAtivos(secao);
      const totalPercentualCarteira =
        totalTabValue > 0
          ? (ativos.reduce(
              (sum, a) => sum + ((a as Record<string, unknown>).valorAtualizado as number),
              0,
            ) /
              totalTabValue) *
            100
          : 0;

      const updatedAtivos = ativos.map((ativo) => {
        const a = ativo as Record<string, unknown>;
        const percentualCarteira =
          totalTabValue > 0 ? ((a.valorAtualizado as number) / totalTabValue) * 100 : 0;
        const objetivo = (a.objetivo as number) || 0;
        const quantoFalta = objetivo - percentualCarteira;
        const necessidadeAporte =
          baseAporte > 0 && quantoFalta > 0 ? (quantoFalta / 100) * baseAporte : 0;

        return {
          ...a,
          // totalCarteira é BRL; valorAtualizado pode estar em USD (Stocks/REIT)
          // — converte via cotacaoParaBRL quando disponível.
          riscoPorAtivo: shouldCalculateRisco
            ? Math.min(
                100,
                (((a.valorAtualizado as number) * (cotacaoParaBRL ?? 1)) / totalCarteira) * 100,
              )
            : 0,
          percentualCarteira,
          quantoFalta,
          necessidadeAporte,
        } as unknown as TAtivo;
      });

      const totalRisco = updatedAtivos.reduce(
        (sum, a) => sum + ((a as Record<string, unknown>).riscoPorAtivo as number),
        0,
      );
      const totalQuantoFalta = updatedAtivos.reduce(
        (sum, a) => sum + ((a as Record<string, unknown>).quantoFalta as number),
        0,
      );
      const totalNecessidadeAporte = updatedAtivos.reduce(
        (sum, a) => sum + ((a as Record<string, unknown>).necessidadeAporte as number),
        0,
      );

      return {
        ...secao,
        ativos: updatedAtivos,
        totalPercentualCarteira,
        totalRisco,
        totalQuantoFalta,
        totalNecessidadeAporte,
      } as unknown as TSecao;
    });

    const totalGeralRisco = secoesComRisco.reduce(
      (sum, secao) =>
        sum +
        getSectionAtivos(secao).reduce(
          (s, a) => s + ((a as Record<string, unknown>).riscoPorAtivo as number),
          0,
        ),
      0,
    );
    const totalQuantoFalta = secoesComRisco.reduce(
      (sum, secao) => sum + ((secao as Record<string, unknown>).totalQuantoFalta as number),
      0,
    );
    const totalNecessidadeAporte = secoesComRisco.reduce(
      (sum, secao) => sum + ((secao as Record<string, unknown>).totalNecessidadeAporte as number),
      0,
    );

    return {
      ...data,
      secoes: secoesComRisco,
      totalGeral: {
        ...totalGeral,
        risco: totalGeralRisco,
        percentualCarteira: totalTabValue > 0 ? 100 : 0,
        quantoFalta: totalQuantoFalta,
        necessidadeAporte: totalNecessidadeAporte,
      },
    };
  }, [
    data,
    totalCarteira,
    cotacaoParaBRL,
    getTotalGeral,
    getSecoes,
    getSectionAtivos,
    necessidadeAporteKey,
    necessidadeAporteMap,
  ]);

  const effectiveData = (dataComRiscoProp ?? dataComRiscoDefault) as Record<string, unknown> | null;

  // Normalize sections
  const defaultNormalizedSections = useMemo(() => {
    if (!effectiveData) return [];

    const secoes = getSecoes(effectiveData);
    const sectionMap = new Map<string, TSecao>();
    secoes.forEach((secao) => {
      const key = getSectionKey(secao);
      const nome = sectionNames[key] ?? getSectionName(secao);
      sectionMap.set(key, { ...secao, nome } as unknown as TSecao);
    });

    return sectionOrder.map((key) => {
      if (sectionMap.has(key)) {
        return sectionMap.get(key)!;
      }
      // Create empty section placeholder
      return { nome: sectionNames[key] ?? key, ativos: [] } as unknown as TSecao;
    });
  }, [effectiveData, getSecoes, getSectionKey, getSectionName, sectionOrder, sectionNames]);

  const sections = normalizedSectionsProp ?? defaultNormalizedSections;

  // Expand/collapse state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(sectionOrder));

  const toggleSection = (key: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  // Formatters bundle
  const formatters: Formatters = useMemo(
    () => ({ formatCurrency, formatPercentage, formatNumber }),
    [formatCurrency, formatPercentage, formatNumber],
  );

  // Necessidade de aporte
  const necessidadeAporteTotalCalculada = necessidadeAporteKey
    ? ((necessidadeAporteMap as Record<string, number>)[necessidadeAporteKey] ??
      (data ? ((getResumo(data)?.necessidadeAporteTotal as number) ?? 0) : 0))
    : 0;

  const resumo = data ? getResumo(data) : {};
  const totalGeral = effectiveData ? getTotalGeral(effectiveData) : {};

  // Loading
  if (loading) {
    return <LoadingSpinner text={loadingText} />;
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${metricGridCols}`}>
        {metricCards.map((card, idx) => {
          // Special case: CaixaParaInvestir is always the second card
          if (card.title === '__CAIXA_PARA_INVESTIR__') {
            return (
              <CaixaParaInvestirCard
                key={idx}
                value={(resumo?.caixaParaInvestir as number) ?? 0}
                formatCurrency={(value) => formatCurrency(value ?? 0)}
                onSave={onUpdateCaixaParaInvestir}
                color={card.color ?? 'success'}
              />
            );
          }

          return (
            <MetricCard
              key={idx}
              title={card.title}
              value={card.getValue(resumo, necessidadeAporteTotalCalculada)}
              color={
                card.getColor ? card.getColor(resumo, necessidadeAporteTotalCalculada) : card.color
              }
            />
          );
        })}
      </div>

      {/* Main table */}
      <ComponentCard title={tableTitle}>
        <div className={TABLE_STYLES.wrapper}>
          <table className={TABLE_STYLES.table}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                {columns.map((col) => {
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';

                  return (
                    <th
                      key={col.key}
                      className={`${TABLE_STYLES.compact.th} ${alignClass} ${col.headerClassName ?? ''}`}
                      style={col.highlight ? TABLE_HIGHLIGHT_HEADER_STYLE : TABLE_HEADER_STYLE}
                    >
                      {col.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Grand total row */}
              <tr className={TABLE_STYLES.totalRow}>
                {columns.map((col, idx) => {
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';

                  if (idx === 0) {
                    return (
                      <td
                        key={col.key}
                        className={`${TABLE_STYLES.compact.td} font-semibold ${alignClass}`}
                      >
                        TOTAL GERAL
                      </td>
                    );
                  }

                  const content = col.renderGrandTotal
                    ? col.renderGrandTotal(totalGeral, formatters)
                    : '-';

                  return (
                    <td
                      key={col.key}
                      className={`${TABLE_STYLES.compact.td} font-semibold ${alignClass}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>

              {/* Extra total rows (e.g., REIT "TOTAL EM USD") */}
              {extraTotalRows}

              {/* Sections */}
              {sections.map((secao) => {
                const key = getSectionKey(secao);
                return (
                  <GenericSection
                    key={key}
                    secao={secao}
                    columns={columns}
                    formatters={formatters}
                    onRemovePlanejado={handleRemovePlanejado}
                    isExpanded={expandedSections.has(key)}
                    onToggle={() => toggleSection(key)}
                    getSectionAtivos={getSectionAtivos}
                    getSectionName={getSectionName}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </ComponentCard>

      {/* Extra content (charts, aux tables) */}
      {children}
    </div>
  );
}
