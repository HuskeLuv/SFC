'use client';
import React, { useState, useMemo, ReactNode } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComponentCard from '@/components/common/ComponentCard';
import { ChevronDownIcon, ChevronUpIcon } from '@/icons';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { MetricCard } from '@/components/carteira/shared';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import { BasicTablePlaceholderRows } from '@/components/carteira/shared';

const MIN_PLACEHOLDER_ROWS = 4;
const HEADER_BG_COLOR = '#9E8A58';
const SECTION_BG_COLOR = '#808080';
const TOTAL_BG_COLOR = '#404040';

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

export interface ColumnDef<TAtivo, TSecao = Record<string, unknown>> {
  key: string;
  header: string | ReactNode;
  align?: 'left' | 'center' | 'right';
  headerClassName?: string;
  cellClassName?: string;
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

export interface MetricCardConfig {
  title: string;
  getValue: (resumo: Record<string, unknown>, necessidadeAporte?: number) => string;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

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
}

function GenericSection<TAtivo, TSecao>({
  secao,
  columns,
  formatters,
  isExpanded,
  onToggle,
  getSectionAtivos,
  getSectionName,
}: GenericSectionProps<TAtivo, TSecao>) {
  const ativos = getSectionAtivos(secao);
  const placeholderCount = Math.max(0, MIN_PLACEHOLDER_ROWS - ativos.length);

  return (
    <>
      {/* Section header row */}
      <tr className="bg-[#808080] cursor-pointer" onClick={onToggle}>
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
                className={`px-2 py-2 text-xs bg-[${SECTION_BG_COLOR}] text-white font-bold ${alignClass} ${col.cellClassName ?? ''}`}
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
              className={`px-2 py-2 text-xs bg-[${SECTION_BG_COLOR}] text-white font-bold ${alignClass}`}
            >
              {content}
            </td>
          );
        })}
      </tr>

      {/* Asset rows */}
      {isExpanded &&
        ativos.map((ativo, ativoIdx) => (
          <tr
            key={((ativo as Record<string, unknown>).id as string) ?? ativoIdx}
            className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
          >
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';

              return (
                <td
                  key={col.key}
                  className={`px-2 py-2 text-xs text-black ${alignClass} ${col.cellClassName ?? ''}`}
                >
                  {col.render(ativo, formatters)}
                </td>
              );
            })}
          </tr>
        ))}

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
  normalizedSections: normalizedSectionsProp,
  dataComRisco: dataComRiscoProp,
  extraTotalRows,
  children,
}: GenericAssetTableProps<TAtivo, TSecao>) {
  const { necessidadeAporteMap } = useCarteiraResumoContext();

  // Default risk calculation
  const dataComRiscoDefault = useMemo(() => {
    if (!data) return data;
    const totalGeral = getTotalGeral(data);
    const totalTabValue = (totalGeral?.valorAtualizado as number) || 0;
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
          totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0;

        return {
          ...a,
          riscoPorAtivo: shouldCalculateRisco
            ? Math.min(100, ((a.valorAtualizado as number) / totalCarteira) * 100)
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
  }, [data, totalCarteira, getTotalGeral, getSecoes, getSectionAtivos]);

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
              color={card.color}
            />
          );
        })}
      </div>

      {/* Main table */}
      <ComponentCard title={tableTitle}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0">
            <thead>
              <tr
                className="border-b border-gray-200 dark:border-gray-700"
                style={{ backgroundColor: HEADER_BG_COLOR }}
              >
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
                      className={`px-2 py-2 font-bold text-black text-xs ${alignClass} ${col.headerClassName ?? ''}`}
                      style={{ backgroundColor: HEADER_BG_COLOR }}
                    >
                      {col.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Grand total row */}
              <tr className={`bg-[${TOTAL_BG_COLOR}] border-t-2 border-gray-300`}>
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
                        className={`px-2 py-2 text-xs text-white font-bold ${alignClass}`}
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
                      className={`px-2 py-2 text-xs text-white font-bold ${alignClass}`}
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
