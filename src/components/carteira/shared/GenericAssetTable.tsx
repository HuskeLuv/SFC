'use client';
import type { SaveCaixaFn } from '@/lib/caixaParaInvestirClient';
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
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import AssetCardSections, { AssetTabMobileSummary } from './AssetCardSections';
import { COLUNAS_VISIVEIS_PLANEJADO, type AssetMobileRole } from './mobileColumnRoles';
import { isSubgrupoValido, type CategoriaMovivel } from '@/lib/carteiraMover';
import type { MoverAlvo } from '@/types/carteiraMover';
import {
  CarteiraDndProvider,
  alvoDaLinha,
  secaoDropId,
  useCarteiraMover,
} from '@/components/carteira/mover/CarteiraDnd';
import { DragHandleCell } from '@/components/carteira/mover/DragHandleCell';
import { LinhaMoverMenu } from '@/components/carteira/mover/LinhaMoverMenu';
import {
  LINHA_REALCE_CLASS,
  SECAO_FAIXA_REALCE_CLASS,
  SecaoDropRow,
} from '@/components/carteira/mover/SecaoDropRow';
import { MovidoBadge, SoltarAquiChip } from '@/components/carteira/mover/MovidoBadge';

export { COLUNAS_VISIVEIS_PLANEJADO };

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
  /**
   * Papel no cartão do celular (PWA fase 1). Sem ele: `DEFAULT_MOBILE_ROLE_BY_KEY[key]` ou
   * `detail` (ver `mobileColumnRoles.ts`).
   */
  mobile?: AssetMobileRole;
  /** Rótulo no cartão (obrigatório na prática quando `header` é ReactNode). */
  mobileLabel?: string;
  /** Conteúdo SÓ TEXTO no cartão (quando `render` tem link/célula editável). */
  mobileRender?: (ativo: TAtivo, formatters: Formatters) => ReactNode;
  /** Além do papel, mostra `render` como linha "rótulo + Editar" no cartão aberto. */
  mobileEdit?: boolean;
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
// Mover investimentos (out/2026)
// ---------------------------------------------------------------------------

/**
 * Liga o mover nas abas movíveis (Ações, FII's, ETF's, Stocks, REIT's, Fundos): alça ⠿ e menu ⋯
 * nas linhas, seções como alvo de soltar, bandeja "Outra aba" durante o arrasto e botão "Mover"
 * no cartão do celular. Sem a prop, a tabela fica exatamente como antes.
 */
export interface GenericAssetMoverConfig<TAtivo> {
  categoria: CategoriaMovivel;
  /** Chave da seção (getSectionKey) → id do subgrupo. Padrão: a própria chave, se válida. */
  subgrupoDaSecao?: (sectionKey: string) => string | null;
  /** Linha → alvo. Padrão: `alvoDaLinha` (null = linha sem alça nem menu). */
  alvoOf?: (ativo: TAtivo) => MoverAlvo | null;
}

interface SecaoMover<TAtivo> {
  categoria: CategoriaMovivel;
  sectionKey: string;
  /** null = seção sem subgrupo conhecido (não vira alvo). */
  subgrupo: string | null;
  alvoOf: (ativo: TAtivo) => MoverAlvo | null;
}

interface LinhaMovidaInfo {
  movido?: boolean;
  movidoEm?: string;
  movidoViaConsultor?: boolean;
  _pendente?: boolean;
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
  onUpdateCaixaParaInvestir: SaveCaixaFn;

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

  // ── Celular (PWA fase 1) ──
  /** Conteúdo extra do cartão de total no celular (ex.: REIT/Stocks 'Total em USD'). */
  extraTotalMobile?: ReactNode;
  /** Título do cartão = nome do ativo (fundos, REIT, opções) em vez do ticker. */
  mobileTitleFromName?: boolean;
  /** Subtítulo do cartão (padrão: nome · quantidade). */
  mobileSubtitle?: (ativo: TAtivo, formatters: Formatters) => string | null | undefined;
  /** Unidade da quantidade no subtítulo do cartão (ex.: 'ações', 'cotas'). */
  mobileQuantityUnit?: string;

  /** Mover investimentos entre seções e abas (só nas abas movíveis). */
  mover?: GenericAssetMoverConfig<TAtivo>;
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
  /** Mover ligado: a seção vira alvo e as linhas ganham alça e menu (coluna extra no fim). */
  mover?: SecaoMover<TAtivo>;
}

/**
 * Ativo PLANEJADO (sem posição, 16/09/2026): só as colunas de planejamento
 * mostram valor (`COLUNAS_VISIVEIS_PLANEJADO`); quantidade/preços/valores viram
 * traço. A 1ª coluna é renderizada aqui (nome + selo + remover) porque a coluna
 * da tabela linka para /ativos/<id>, e o id do planejado não é uma posição.
 */
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
  mover,
}: GenericSectionProps<TAtivo, TSecao>) {
  const moverCtx = useCarteiraMover();
  const ativos = getSectionAtivos(secao);
  const placeholderCount = Math.max(0, MIN_PLACEHOLDER_ROWS - ativos.length);
  const faixaRealce = (realce: boolean) => (realce ? SECAO_FAIXA_REALCE_CLASS : '');
  const dropId = mover ? secaoDropId(mover.categoria, mover.sectionKey) : '';

  const rows = (realce: boolean) => (
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
                  faixaRealce(realce),
                )}
              >
                <div className="flex items-center space-x-2">
                  {isExpanded ? (
                    <ChevronUpIcon className="w-4 h-4" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4" />
                  )}
                  <span className={mover ? 'relative' : undefined}>
                    {getSectionName(secao)}
                    {/* Absoluto: o selo não alarga a 1ª coluna durante o arrasto. */}
                    {realce ? (
                      <span className="absolute top-1/2 left-full z-[1] -translate-y-1/2 whitespace-nowrap">
                        <SoltarAquiChip />
                      </span>
                    ) : null}
                  </span>
                </div>
              </td>
            );
          }

          const content = col.renderSectionTotal ? col.renderSectionTotal(secao, formatters) : '-';

          return (
            <td
              key={col.key}
              className={twMerge(
                TABLE_STYLES.compact.td,
                'text-white dark:text-white',
                alignClass,
                faixaRealce(realce),
              )}
            >
              {content}
            </td>
          );
        })}
        {mover ? (
          <td className={twMerge(TABLE_STYLES.compact.td, faixaRealce(realce))} aria-hidden />
        ) : null}
      </tr>

      {/* Asset rows */}
      {isExpanded &&
        ativos.map((ativo, ativoIdx) => {
          const planejado = isPlanejado(ativo);
          const a = ativo as Record<string, unknown>;
          const alvoBase = mover ? mover.alvoOf(ativo) : null;
          const alvo =
            alvoBase && mover?.subgrupo ? { ...alvoBase, secaoAtual: mover.subgrupo } : alvoBase;
          const info = a as LinhaMovidaInfo;
          const pendente = !!alvo && (!!info._pendente || moverCtx?.pendingId === alvo.id);
          const arrastando = !!alvo && moverCtx?.ativo?.alvo.id === alvo.id;
          const chegou = !!alvo && moverCtx?.realceId === alvo.id;
          const moverRowClass = mover
            ? ` group/linha${arrastando ? ' opacity-35' : pendente ? ' opacity-60' : ''}${chegou ? ` ${LINHA_REALCE_CLASS}` : ''}`
            : '';
          const comAlca = (content: ReactNode) =>
            mover ? (
              <div className="flex items-center gap-1.5">
                {alvo && mover.subgrupo ? (
                  <DragHandleCell
                    alvo={alvo}
                    secaoDropId={dropId}
                    secaoLabel={getSectionName(secao)}
                    disabled={pendente}
                  />
                ) : (
                  <span className="inline-block w-6 shrink-0" aria-hidden />
                )}
                <div className="min-w-0">{content}</div>
                {info.movido ? (
                  <MovidoBadge
                    movidoEm={info.movidoEm}
                    viaConsultor={info.movidoViaConsultor}
                    planejado={planejado}
                  />
                ) : null}
                {pendente ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span
                      aria-hidden
                      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                    />
                    Movendo…
                  </span>
                ) : null}
              </div>
            ) : (
              content
            );
          return (
            <tr
              key={(a.id as string) ?? ativoIdx}
              className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}${moverRowClass}`}
              data-planejado={planejado ? 'true' : undefined}
              data-mover-linha={alvo ? alvo.id : undefined}
              aria-busy={pendente || undefined}
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
                        {comAlca(
                          <PlanejadoNameCell
                            ticker={String(a.ticker ?? a.nome ?? '')}
                            nome={a.nome ? String(a.nome) : undefined}
                            onRemove={() => onRemovePlanejado(String(a.id))}
                          />,
                        )}
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

                const content = col.render(ativo, formatters);
                return (
                  <td key={col.key} className={className}>
                    {idx === 0 ? comAlca(content) : content}
                  </td>
                );
              })}
              {mover ? (
                <td className={`${TABLE_STYLES.compact.td} w-10 text-right`}>
                  {alvo ? (
                    <LinhaMoverMenu
                      alvo={alvo}
                      movido={info.movido}
                      movidoEm={info.movidoEm}
                      movidoViaConsultor={info.movidoViaConsultor}
                      disabled={pendente}
                    />
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}

      {/* Placeholder rows */}
      {isExpanded && (
        <BasicTablePlaceholderRows
          count={placeholderCount}
          colSpan={columns.length + (mover ? 1 : 0)}
        />
      )}
    </>
  );

  if (!mover) return rows(false);
  if (!mover.subgrupo) return <tbody>{rows(false)}</tbody>;
  return (
    <SecaoDropRow
      data={{
        kind: 'secao',
        categoria: mover.categoria,
        sectionKey: mover.sectionKey,
        subgrupo: mover.subgrupo,
        label: getSectionName(secao),
      }}
    >
      {rows}
    </SecaoDropRow>
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
  extraTotalMobile,
  mobileTitleFromName = false,
  mobileSubtitle,
  mobileQuantityUnit,
  mover,
}: GenericAssetTableProps<TAtivo, TSecao>) {
  // Antes dos early returns (regra dos hooks). Desktop (>= lg) segue na <table> de sempre.
  const isBelowLg = useIsBelowLg();
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

  // Mover (abas movíveis): subgrupo de cada seção e alvo de cada linha.
  const moverCategoria = mover?.categoria;
  const subgrupoDaSecaoProp = mover?.subgrupoDaSecao;
  const alvoOfProp = mover?.alvoOf;
  const moverConfig = useMemo(() => {
    if (!moverCategoria) return null;
    const subgrupoDaSecao = (key: string): string | null =>
      subgrupoDaSecaoProp
        ? subgrupoDaSecaoProp(key)
        : isSubgrupoValido(moverCategoria, key)
          ? key
          : null;
    const alvoOf =
      alvoOfProp ??
      ((ativo: TAtivo) => alvoDaLinha(moverCategoria, ativo, (s) => subgrupoDaSecao(s) ?? s));
    return { categoria: moverCategoria, subgrupoDaSecao, alvoOf };
  }, [moverCategoria, subgrupoDaSecaoProp, alvoOfProp]);
  // As seções vazias do padrão não têm o campo da chave: vale a posição em sectionOrder.
  const sectionKeyAt = (secao: TSecao, idx: number): string =>
    normalizedSectionsProp ? getSectionKey(secao) : (sectionOrder[idx] ?? getSectionKey(secao));

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

  const renderCaixaCard = (card: MetricCardConfig, key: React.Key, title?: string) => (
    <CaixaParaInvestirCard
      key={key}
      title={title}
      value={(resumo?.caixaParaInvestir as number) ?? 0}
      formatCurrency={(value) => formatCurrency(value ?? 0)}
      onSave={onUpdateCaixaParaInvestir}
      color={card.color ?? 'success'}
    />
  );

  if (isBelowLg) {
    // Celular: cartão-resumo (valor atualizado em destaque + rentabilidade + mini-indicadores),
    // blocos Necessidade de aporte / Caixa da aba, e a lista de cartões por seção. Os VALORES
    // são os mesmos dos metric cards do desktop (mesmos getValue/getColor).
    const caixaCard = metricCards.find((c) => c.title === '__CAIXA_PARA_INVESTIR__');
    const needCard = metricCards.find((c) => /^necessidade/i.test(c.title));
    const heroCard = metricCards.find((c) => /^valor atualizado/i.test(c.title));
    const rentCard = metricCards.find((c) => /^rentabilidade/i.test(c.title));
    const minis = metricCards
      .filter((c) => c !== caixaCard && c !== needCard && c !== heroCard && c !== rentCard)
      .map((c) => ({
        label: c.title,
        value: c.getValue(resumo, necessidadeAporteTotalCalculada),
        negative: c.getColor?.(resumo, necessidadeAporteTotalCalculada) === 'error',
      }));
    const mobileContent = (
      <div className="space-y-4">
        <AssetTabMobileSummary
          heroLabel="Valor atualizado"
          heroValue={
            heroCard
              ? heroCard.getValue(resumo, necessidadeAporteTotalCalculada)
              : formatCurrency(Number(totalGeral?.valorAtualizado ?? 0) || 0)
          }
          rentabilidade={
            rentCard
              ? { value: Number(resumo?.rentabilidade ?? 0) || 0, formatPercentage }
              : undefined
          }
          minis={minis}
          necessidadeAporte={
            needCard ? needCard.getValue(resumo, necessidadeAporteTotalCalculada) : undefined
          }
          caixa={caixaCard ? renderCaixaCard(caixaCard, 'caixa', 'Caixa da aba') : undefined}
        />
        <AssetCardSections<TAtivo, TSecao>
          sections={sections}
          columns={columns}
          formatters={formatters}
          getSectionKey={getSectionKey}
          getSectionName={getSectionName}
          getSectionAtivos={getSectionAtivos}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          totalGeral={totalGeral}
          onRemovePlanejado={handleRemovePlanejado}
          removendoPlanejado={removendoPlanejado}
          ariaLabel={tableTitle}
          titleFromName={mobileTitleFromName}
          getSubtitle={mobileSubtitle}
          quantityUnit={mobileQuantityUnit}
          extraTotal={extraTotalMobile}
          moverAlvoOf={moverConfig?.alvoOf}
        />
        {children}
      </div>
    );
    // Celular: sem arrastar; o cartão aberto ganha "Mover" (sheet da Fatia D).
    return moverConfig ? (
      <CarteiraDndProvider categoria={moverConfig.categoria} dnd={false}>
        {mobileContent}
      </CarteiraDndProvider>
    ) : (
      mobileContent
    );
  }

  // Grand total row
  const totalRows = (
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
            <td key={col.key} className={`${TABLE_STYLES.compact.td} font-semibold ${alignClass}`}>
              TOTAL GERAL
            </td>
          );
        }

        const content = col.renderGrandTotal ? col.renderGrandTotal(totalGeral, formatters) : '-';

        return (
          <td key={col.key} className={`${TABLE_STYLES.compact.td} font-semibold ${alignClass}`}>
            {content}
          </td>
        );
      })}
      {moverConfig ? <td className={TABLE_STYLES.compact.td} aria-hidden /> : null}
    </tr>
  );

  const tabela = (
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
              {moverConfig ? (
                <th
                  className={`${TABLE_STYLES.compact.th} relative w-10`}
                  style={TABLE_HEADER_STYLE}
                >
                  <span className="sr-only">Ações</span>
                </th>
              ) : null}
            </tr>
          </thead>
          {moverConfig ? (
            <>
              <tbody>
                {totalRows}
                {extraTotalRows}
              </tbody>
              {sections.map((secao, idx) => {
                const key = sectionKeyAt(secao, idx);
                // Seção vazia do padrão (sem o campo da chave) começa recolhida, como sem o
                // mover; a chave própria só serve para abrir/fechar cada uma separadamente.
                const expKey = getSectionKey(secao) || `__vazia__:${key}`;
                return (
                  <GenericSection
                    key={key}
                    secao={secao}
                    columns={columns}
                    formatters={formatters}
                    onRemovePlanejado={handleRemovePlanejado}
                    isExpanded={expandedSections.has(expKey)}
                    onToggle={() => toggleSection(expKey)}
                    getSectionAtivos={getSectionAtivos}
                    getSectionName={getSectionName}
                    mover={{
                      categoria: moverConfig.categoria,
                      sectionKey: key,
                      subgrupo: moverConfig.subgrupoDaSecao(key),
                      alvoOf: moverConfig.alvoOf,
                    }}
                  />
                );
              })}
            </>
          ) : (
            <tbody>
              {totalRows}

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
          )}
        </table>
      </div>
    </ComponentCard>
  );

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
      {moverConfig ? (
        <CarteiraDndProvider categoria={moverConfig.categoria}>{tabela}</CarteiraDndProvider>
      ) : (
        tabela
      )}

      {/* Extra content (charts, aux tables) */}
      {children}
    </div>
  );
}
