'use client';

import React, { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import { CardSectionBand } from '@/components/ui/table/CardSectionBand';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import AssetNameLink from '@/components/carteira/AssetNameLink';
import { useCarteiraLaunch } from '@/components/carteira/CarteiraLaunchContext';
import PlanejadoNameCell from './PlanejadoNameCell';
import EmptyState from './EmptyState';
import { quantoFaltaMobile } from './quantoFaltaClass';
import { CARD_HERO_VALUE_CLASS } from './cardStyles';
import {
  COLUNAS_VISIVEIS_PLANEJADO,
  MAX_DETAIL_GRID,
  orderDetailColumns,
  resolveAssetMobileLabel,
  resolveAssetMobileRole,
} from './mobileColumnRoles';
import { simplifyAssetName } from '@/utils/assetDisplayName';
import type { ColumnDef, Formatters } from './GenericAssetTable';

/**
 * Abas da carteira em CARTÕES abaixo de lg (PWA fase 1, fatia B — telas c/d do protótipo).
 *
 * O desktop continua na <table> do `GenericAssetTable`; aqui é só o ramo `isBelowLg`. Nenhum
 * cálculo novo: os ativos já chegam enriquecidos (percentualCarteira, quantoFalta,
 * necessidadeAporte) e os subtotais/totais saem dos MESMOS `renderSectionTotal`/`renderGrandTotal`
 * das colunas. "Ordenar" reordena uma CÓPIA dentro de cada seção (os totais não mudam).
 */

// ── Contexto de um cartão (as células editáveis leem o "assunto" e o rótulo) ────────────────

export interface AssetCardContextValue {
  /** O que está sendo editado (ticker ou nome do ativo). */
  subject: string;
  /** Rótulo do campo no cartão (ex.: 'Objetivo', 'Cotização'). */
  label: string;
  /** % da aba do ativo (dica do objetivo). */
  percentualAtual?: number;
  /** Soma dos objetivos da aba (dica do objetivo). */
  somaObjetivos?: number;
  formatPercentage?: (value: number) => string;
}

const AssetCardContext = createContext<AssetCardContextValue | null>(null);

/** Contexto do cartão em volta de uma célula editável (null fora do cartão/no desktop). */
export const useAssetCardContext = () => useContext(AssetCardContext);

/**
 * Valor + botão "Editar" (44px) de uma célula editável no cartão. O botão leva
 * `data-mf-edit={field}` (contrato dos e2e) e abre o `MobileEditSheet` da célula.
 */
export function MobileEditTrigger({
  field,
  display,
  ariaLabel,
  onOpen,
  muted = false,
}: {
  field: 'objetivo' | 'valor' | 'texto';
  display: ReactNode;
  ariaLabel: string;
  onOpen: () => void;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={twMerge(
          'min-w-0 break-words tabular-nums',
          muted && 'font-normal text-gray-500 dark:text-gray-400',
        )}
      >
        {display}
      </span>
      <button
        type="button"
        data-mf-edit={field}
        aria-label={ariaLabel}
        onClick={onOpen}
        className={twMerge(TABLE_MOBILE_STYLES.editButton, 'shrink-0')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Editar
      </button>
    </div>
  );
}

// ── Ordenação (só celular) ──────────────────────────────────────────────────────────────────

export type AssetSortKey = 'padrao' | 'valor' | 'rent' | 'qf' | 'nome';

export const ASSET_SORT_OPTIONS: ReadonlyArray<{ value: AssetSortKey; label: string }> = [
  { value: 'padrao', label: 'Ordem da carteira' },
  { value: 'valor', label: 'Maior valor' },
  { value: 'rent', label: 'Rentabilidade' },
  { value: 'qf', label: 'Mais longe do objetivo' },
  { value: 'nome', label: 'Nome' },
];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Ordena uma CÓPIA (a ordem da carteira fica intacta para o desktop e para os totais). */
export function sortAtivos<TAtivo>(
  ativos: TAtivo[],
  sort: AssetSortKey,
  titleOf: (a: TAtivo) => string,
): TAtivo[] {
  if (sort === 'padrao') return ativos;
  const rec = (a: TAtivo) => a as unknown as Record<string, unknown>;
  const cmp: Record<Exclude<AssetSortKey, 'padrao'>, (a: TAtivo, b: TAtivo) => number> = {
    valor: (a, b) => num(rec(b).valorAtualizado) - num(rec(a).valorAtualizado),
    rent: (a, b) => num(rec(b).rentabilidade) - num(rec(a).rentabilidade),
    // "Mais longe do objetivo": distância nos dois sentidos (10% acima vem antes de 2% faltando).
    qf: (a, b) => Math.abs(num(rec(b).quantoFalta)) - Math.abs(num(rec(a).quantoFalta)),
    nome: (a, b) => titleOf(a).localeCompare(titleOf(b), 'pt-BR', { sensitivity: 'base' }),
  };
  return [...ativos].sort(cmp[sort]);
}

// ── Pedaços visuais ─────────────────────────────────────────────────────────────────────────

const isPlanejado = (ativo: unknown): boolean =>
  !!(ativo as { planejado?: boolean } | null)?.planejado;

/** Pílula do Quanto Falta: ponto colorido + palavra + valor (a cor nunca é o único sinal). */
export function QuantoFaltaPill({
  value,
  formatPercentage,
}: {
  value: number | null | undefined;
  formatPercentage: (v: number) => string;
}) {
  const qf = quantoFaltaMobile(value);
  const v = Number(value);
  const showNumber = qf.tone === 'falta' || qf.tone === 'quase' || qf.tone === 'acima';
  return (
    <span
      className={twMerge(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums dark:bg-white/[0.06]',
        qf.textClass,
      )}
    >
      <span aria-hidden="true" className={twMerge('h-2 w-2 shrink-0 rounded-full', qf.dotClass)} />
      <span>
        {qf.label}
        {showNumber ? ` ${formatPercentage(Math.abs(v))}` : ''}
      </span>
    </span>
  );
}

/** Rentabilidade sob o valor: '▲ 3,20%' / '▼ −1,05%' (negativo em vermelho semântico). */
export function RentabilidadeDelta({
  value,
  formatPercentage,
  suffix,
}: {
  value: number | null | undefined;
  formatPercentage: (v: number) => string;
  suffix?: string;
}) {
  const v = num(value);
  const negative = v < 0;
  return (
    <span
      className={twMerge(
        'block text-xs font-medium tabular-nums',
        negative ? TABLE_MOBILE_STYLES.negative : TABLE_MOBILE_STYLES.positive,
      )}
    >
      <span aria-hidden="true">{negative ? '▼ ' : '▲ '}</span>
      {negative ? '−' : ''}
      {formatPercentage(Math.abs(v))}
      {suffix}
    </span>
  );
}

// ── Resumo da aba no celular (cartão-resumo + Necessidade de aporte + Caixa da aba) ─────────

export interface AssetTabMobileSummaryProps {
  heroLabel: string;
  heroValue: string;
  /** Rentabilidade da aba (sob o número principal). */
  rentabilidade?: { value: number; formatPercentage: (v: number) => string };
  /** Linha de mini-indicadores (Rendimento, Saldo início do mês…). */
  minis?: { label: string; value: string; negative?: boolean }[];
  necessidadeAporte?: string;
  /** O `CaixaParaInvestirCard` da aba (mesma API do desktop). */
  caixa?: ReactNode;
}

export function AssetTabMobileSummary({
  heroLabel,
  heroValue,
  rentabilidade,
  minis = [],
  necessidadeAporte,
  caixa,
}: AssetTabMobileSummaryProps) {
  return (
    <div className="flex flex-col gap-2" data-mf-tab-summary="">
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{heroLabel}</p>
        <p className={twMerge(CARD_HERO_VALUE_CLASS, 'text-gray-800 dark:text-white/90')}>
          {heroValue}
        </p>
        {rentabilidade && (
          <RentabilidadeDelta
            value={rentabilidade.value}
            formatPercentage={rentabilidade.formatPercentage}
            suffix=" de rentabilidade"
          />
        )}
        {minis.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            {minis.map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">{m.label}</dt>
                <dd
                  className={twMerge(
                    'text-sm font-semibold tabular-nums break-words text-gray-800 dark:text-gray-100',
                    m.negative && TABLE_MOBILE_STYLES.negative,
                  )}
                >
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {(necessidadeAporte !== undefined || caixa) && (
        <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
          {necessidadeAporte !== undefined && (
            <div className={twMerge(TABLE_MOBILE_STYLES.needBlock, 'min-w-0')}>
              <p className="text-xs font-medium">Necessidade de aporte</p>
              <p className="mt-1 text-lg font-semibold tabular-nums break-words">
                {necessidadeAporte}
              </p>
              <p className="text-[11px] opacity-80">para chegar nos objetivos</p>
            </div>
          )}
          {caixa && <div className="min-w-0">{caixa}</div>}
        </div>
      )}
    </div>
  );
}

// ── Lista de cartões por seção ──────────────────────────────────────────────────────────────

export interface AssetCardSectionsProps<TAtivo, TSecao> {
  sections: TSecao[];
  columns: ColumnDef<TAtivo, TSecao>[];
  formatters: Formatters;
  getSectionKey: (secao: TSecao) => string;
  getSectionName: (secao: TSecao) => string;
  getSectionAtivos: (secao: TSecao) => TAtivo[];
  /** MESMO estado de seções abertas do desktop. */
  expandedSections: Set<string>;
  onToggleSection: (key: string) => void;
  totalGeral: Record<string, unknown>;
  /** MESMO handler do desktop (DELETE /api/carteira/planejados/:id). */
  onRemovePlanejado: (planejadoId: string) => void;
  removendoPlanejado?: string | null;
  /** Nome da lista (ex.: 'Ações - Detalhamento'). */
  ariaLabel: string;
  /** Título do cartão = nome do ativo (fundos, previdência…) em vez do ticker. */
  titleFromName?: boolean;
  /** Subtítulo do cartão (padrão: nome · quantidade). */
  getSubtitle?: (ativo: TAtivo, formatters: Formatters) => string | null | undefined;
  /** Unidade da quantidade no subtítulo (ex.: 'ações', 'cotas'). */
  quantityUnit?: string;
  /** Conteúdo extra no fim do cartão de total (ex.: REIT/Stocks 'Total em USD'). */
  extraTotal?: ReactNode;
}

const rec = (a: unknown) => (a ?? {}) as Record<string, unknown>;

export function cardTitleOf(ativo: unknown, titleFromName = false): string {
  const a = rec(ativo);
  const ticker = String(a.ticker ?? '').trim();
  const nome = simplifyAssetName(a.nome as string | undefined);
  return (titleFromName ? nome || ticker : ticker || nome) || String(a.nome ?? '');
}

const isEmptyTotal = (node: ReactNode) => node === undefined || node === null || node === '-';

/** Colunas do cartão de total, na ordem do protótipo. */
const TOTAL_KEYS = [
  'valorTotal',
  'valorInicialAplicado',
  'rentabilidade',
  'objetivo',
  'quantoFalta',
  'proventos',
  'necessidadeAporte',
];

export default function AssetCardSections<TAtivo, TSecao>({
  sections,
  columns,
  formatters,
  getSectionKey,
  getSectionName,
  getSectionAtivos,
  expandedSections,
  onToggleSection,
  totalGeral,
  onRemovePlanejado,
  removendoPlanejado = null,
  ariaLabel,
  titleFromName = false,
  getSubtitle,
  quantityUnit,
  extraTotal,
}: AssetCardSectionsProps<TAtivo, TSecao>) {
  const baseId = useId();
  const [sort, setSort] = useState<AssetSortKey>('padrao');
  const launch = useCarteiraLaunch();
  const { formatCurrency, formatPercentage, formatNumber } = formatters;

  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const roles = useMemo(
    () => columns.map((col) => ({ col, role: resolveAssetMobileRole(col) })),
    [columns],
  );
  const detailCols = useMemo(
    () => orderDetailColumns(roles.filter((r) => r.role === 'detail').map((r) => r.col)),
    [roles],
  );
  const editCols = useMemo(
    () => roles.filter((r) => r.role === 'edit' || r.col.mobileEdit).map((r) => r.col),
    [roles],
  );
  const valueCol = roles.find((r) => r.role === 'value')?.col;

  const allAtivos = useMemo(
    () => sections.flatMap((s) => getSectionAtivos(s) ?? []),
    [sections, getSectionAtivos],
  );
  const planejadosCount = allAtivos.filter(isPlanejado).length;
  const posicoesCount = allAtivos.length - planejadosCount;
  const somaObjetivos = allAtivos.reduce((s, a) => s + num(rec(a).objetivo), 0);

  const titleOf = (a: TAtivo) => cardTitleOf(a, titleFromName);

  const subtitleOf = (a: TAtivo): string | null => {
    if (getSubtitle) return getSubtitle(a, formatters) || null;
    const r = rec(a);
    const nome = String(r.nome ?? '').trim();
    const title = titleOf(a);
    const parts: string[] = [];
    if (nome && simplifyAssetName(nome) !== title && nome !== title) parts.push(nome);
    if (!isPlanejado(a) && typeof r.quantidade === 'number') {
      const unit =
        quantityUnit && r.quantidade === 1 ? quantityUnit.replace(/s$/, '') : quantityUnit;
      parts.push(`${formatNumber(r.quantidade)}${unit ? ` ${unit}` : ''}`);
    }
    return parts.join(' · ') || null;
  };

  const textOf = (col: ColumnDef<TAtivo, TSecao>, a: TAtivo) =>
    (col.mobileRender ?? col.render)(a, formatters);

  // Cabeçalho do cartão (só texto: ele inteiro é o <button> que abre/fecha).
  const headColumns: ResponsiveColumn<TAtivo>[] = [
    {
      id: '__titulo',
      header: 'Ativo',
      mobile: 'primary',
      cell: (a) => titleOf(a),
      mobileCell: (a) =>
        isPlanejado(a) ? (
          <PlanejadoNameCell variant="card" ticker={titleOf(a)} />
        ) : (
          <span className="line-clamp-2 break-words">{titleOf(a)}</span>
        ),
    },
    {
      id: '__subtitulo',
      header: '',
      mobile: 'subtitle',
      cell: (a) => subtitleOf(a),
      mobileCell: (a) => {
        const s = subtitleOf(a);
        return s ? <span className="line-clamp-2 break-words">{s}</span> : null;
      },
    },
    {
      id: '__valor',
      header: 'Valor atualizado',
      mobile: 'value',
      cell: () => null,
      mobileCell: (a) =>
        isPlanejado(a) ? (
          <>
            <span className="block text-gray-400">—</span>
            <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
              sem posição
            </span>
          </>
        ) : (
          <>
            <span className="block whitespace-nowrap">
              {valueCol ? textOf(valueCol, a) : formatCurrency(num(rec(a).valorAtualizado))}
            </span>
            {byKey.has('rentabilidade') && (
              <RentabilidadeDelta
                value={rec(a).rentabilidade as number}
                formatPercentage={formatPercentage}
              />
            )}
          </>
        ),
    },
  ];
  // Linha 2 do cartão fechado (protótipo): pílula do Quanto Falta + "Obj. x · atual y".
  // Vai como subtítulo (e não na grade de 3) para caber sem cortar até 320px.
  if (byKey.has('quantoFalta') || byKey.has('objetivo')) {
    headColumns.push({
      id: '__meta',
      header: 'Quanto falta',
      mobile: 'subtitle',
      cell: () => null,
      mobileCell: (a) => (
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {byKey.has('quantoFalta') && (
            <QuantoFaltaPill
              value={rec(a).quantoFalta as number}
              formatPercentage={formatPercentage}
            />
          )}
          {byKey.has('objetivo') && (
            <span className="tabular-nums">
              Obj. {formatPercentage(num(rec(a).objetivo))}
              {byKey.has('percentualCarteira') &&
                ` · atual ${formatPercentage(num(rec(a).percentualCarteira))}`}
            </span>
          )}
        </span>
      ),
    });
  }

  const renderEditRow = (col: ColumnDef<TAtivo, TSecao>, a: TAtivo) => (
    <div
      key={col.key}
      className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-800"
      data-mf-edit-row={col.key}
    >
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{resolveAssetMobileLabel(col)}</p>
      <AssetCardContext.Provider
        value={{
          subject: titleOf(a),
          label: resolveAssetMobileLabel(col),
          percentualAtual: num(rec(a).percentualCarteira),
          somaObjetivos,
          formatPercentage,
        }}
      >
        <div className="text-[15px] font-semibold tabular-nums text-gray-800 dark:text-gray-100">
          {col.render(a, formatters)}
        </div>
      </AssetCardContext.Provider>
    </div>
  );

  const renderCardBody = (a: TAtivo) => {
    const planejado = isPlanejado(a);
    const visible = (col: ColumnDef<TAtivo, TSecao>) =>
      !planejado || COLUNAS_VISIVEIS_PLANEJADO.has(col.key);
    const details = detailCols.filter(visible);
    const grid = details.slice(0, MAX_DETAIL_GRID);
    const extra = details.slice(MAX_DETAIL_GRID);
    const cellOf = (col: ColumnDef<TAtivo, TSecao>) =>
      planejado && col.key === 'cotacaoAtual' && !(num(rec(a).cotacaoAtual) > 0)
        ? '—'
        : textOf(col, a);
    const observacoes = String(rec(a).observacoes ?? '').trim();
    return (
      <>
        {grid.length > 0 && (
          <dl className={TABLE_MOBILE_STYLES.cardDetailGrid}>
            {grid.map((col) => (
              <div key={col.key} className="min-w-0">
                <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>
                  {resolveAssetMobileLabel(col)}
                </dt>
                <dd className={twMerge(TABLE_MOBILE_STYLES.cardDetailValue, 'break-words')}>
                  {cellOf(col)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {extra.length > 0 && (
          <dl className="mt-2 flex flex-col gap-1">
            {extra.map((col) => (
              <div key={col.key} className="flex items-baseline justify-between gap-3">
                <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>
                  {resolveAssetMobileLabel(col)}
                </dt>
                <dd className={twMerge(TABLE_MOBILE_STYLES.cardDetailValue, 'text-right')}>
                  {cellOf(col)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {observacoes && !planejado && (
          <p className="mt-2 text-xs break-words text-gray-600 dark:text-gray-300">
            <span className="text-gray-500 dark:text-gray-400">Observações: </span>
            {observacoes}
          </p>
        )}
        {editCols.filter(visible).map((col) => renderEditRow(col, a))}
      </>
    );
  };

  const renderCardFooter = (a: TAtivo) => {
    const r = rec(a);
    if (isPlanejado(a)) {
      const busy = removendoPlanejado === String(r.id);
      return (
        <button
          type="button"
          onClick={() => onRemovePlanejado(String(r.id))}
          disabled={!!removendoPlanejado}
          aria-busy={busy || undefined}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-[#D92D20] disabled:opacity-60 dark:text-[#F97066]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {busy ? 'Removendo…' : 'Remover do planejamento'}
        </button>
      );
    }
    return (
      <AssetNameLink
        variant="card-link"
        portfolioId={String(r.id)}
        ticker={titleOf(a)}
        nome={r.nome as string | undefined}
      />
    );
  };

  const visibleSections = sections
    .map((secao) => ({ secao, ativos: getSectionAtivos(secao) ?? [] }))
    // Seções vazias (ex.: Growth sem ativos) ficam escondidas no celular.
    .filter(({ ativos }) => ativos.length > 0);

  if (visibleSections.length === 0) {
    return (
      <div
        className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
        data-mf-empty-tab=""
      >
        <EmptyState
          title="Nenhum ativo nesta aba"
          description={
            launch
              ? 'Cadastre um ativo desta classe para acompanhar aqui.'
              : 'Use o botão ＋ Lançar para cadastrar um ativo desta classe.'
          }
        />
        {launch && (
          <div className="px-4 pb-6">
            <button
              type="button"
              onClick={launch.openAdd}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mf-patrimonio px-4 text-base font-semibold text-white"
            >
              Adicionar investimento
            </button>
          </div>
        )}
      </div>
    );
  }

  const valorTotalGeral =
    valueCol?.renderGrandTotal?.(totalGeral, formatters) ??
    formatCurrency(num(totalGeral.valorAtualizado));

  const totalItems = TOTAL_KEYS.map((key) => byKey.get(key))
    .filter((col): col is ColumnDef<TAtivo, TSecao> => !!col?.renderGrandTotal)
    .map((col) => ({
      col,
      node:
        col.key === 'quantoFalta' ? (
          <QuantoFaltaPill
            value={num(totalGeral.quantoFalta)}
            formatPercentage={formatPercentage}
          />
        ) : (
          col.renderGrandTotal!(totalGeral, formatters)
        ),
    }))
    .filter(({ node }) => !isEmptyTotal(node));

  const countLabel = [
    `${posicoesCount} ${posicoesCount === 1 ? 'ativo' : 'ativos'}`,
    planejadosCount > 0
      ? `${planejadosCount} ${planejadosCount === 1 ? 'planejado' : 'planejados'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sortId = `${baseId}-ordenar`;

  return (
    <div className="flex flex-col gap-3" data-mf-asset-cards="">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm whitespace-nowrap text-gray-600 dark:text-gray-300">{countLabel}</p>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={sortId} className="text-sm text-gray-600 dark:text-gray-300">
            Ordenar
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => setSort(e.target.value as AssetSortKey)}
            className="h-11 max-w-[11rem] rounded-xl border border-gray-300 bg-white px-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {ASSET_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleSections.map(({ secao, ativos }, i) => {
        const key = getSectionKey(secao);
        const expanded = expandedSections.has(key);
        const bodyId = `${baseId}-secao-${i}`;
        const subtotal = valueCol?.renderSectionTotal?.(secao, formatters);
        return (
          <div key={key ?? i} className="flex flex-col gap-2">
            <CardSectionBand
              id={bodyId}
              label={getSectionName(secao)}
              count={ativos.length}
              subtotal={isEmptyTotal(subtotal) ? undefined : subtotal}
              expanded={expanded}
              onToggle={() => onToggleSection(key)}
            />
            <div id={bodyId} hidden={!expanded}>
              {expanded && (
                <ResponsiveCardList<TAtivo>
                  ariaLabel={`${ariaLabel} — ${getSectionName(secao)}`}
                  columns={headColumns}
                  rows={sortAtivos(ativos, sort, titleOf)}
                  getRowKey={(a, idx) => String(rec(a).id ?? idx)}
                  expandable
                  getRowAttributes={(a) => ({
                    'data-planejado': isPlanejado(a) ? 'true' : undefined,
                  })}
                  cardClassName={(a) =>
                    isPlanejado(a) ? 'border-dashed border-mf-tranquilidade' : undefined
                  }
                  renderCardBody={(a) => renderCardBody(a)}
                  renderCardFooter={(a) => renderCardFooter(a)}
                />
              )}
            </div>
          </div>
        );
      })}

      <section
        className={twMerge(TABLE_MOBILE_STYLES.totalCard, 'flex flex-col gap-3')}
        aria-label={`Total geral — ${ariaLabel}`}
        data-mf-total-card=""
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">Total geral</span>
          <span className="text-base font-semibold tabular-nums">{valorTotalGeral}</span>
        </div>
        {totalItems.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {totalItems.map(({ col, node }) => (
              <div key={col.key} className="min-w-0">
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">
                  {col.key === 'valorTotal' || col.key === 'valorInicialAplicado'
                    ? 'Valor aplicado'
                    : resolveAssetMobileLabel(col)}
                </dt>
                <dd className="text-sm font-semibold tabular-nums break-words">{node}</dd>
              </div>
            ))}
          </dl>
        )}
        {extraTotal}
      </section>
    </div>
  );
}

// ── "Resumo de Aportes" (FII, ETF, Stocks, REIT) em cartões ─────────────────────────────────

export interface ResumoAporteItem {
  key: string | number;
  nome: string;
  /** Segunda linha (ex.: o nome quando o título é o ticker). */
  detalhe?: string;
  cotacao: string;
  necessidade: string;
  lote: string;
  /** Data da compra (Stocks). */
  data?: string;
}

const RESUMO_APORTES_COLUMNS: ResponsiveColumn<ResumoAporteItem>[] = [
  {
    id: 'nome',
    header: 'Ativo',
    mobile: 'primary',
    cell: (i) => (
      <>
        <span className="block break-words">{i.nome}</span>
        {i.detalhe && (
          <span className="block text-xs font-normal break-words text-gray-500 dark:text-gray-400">
            {i.detalhe}
          </span>
        )}
      </>
    ),
  },
  { id: 'necessidade', header: 'Nec. aporte', mobile: 'value', cell: (i) => i.necessidade },
  { id: 'cotacao', header: 'Cotação', mobile: 'field', cell: (i) => i.cotacao },
  { id: 'lote', header: 'Lote aprox.', mobile: 'field', cell: (i) => i.lote },
];

const RESUMO_APORTES_DATA_COLUMN: ResponsiveColumn<ResumoAporteItem> = {
  id: 'data',
  header: 'Compra',
  mobile: 'field',
  cell: (i) => i.data ?? '-',
};

/** Par mobile da tabela "Resumo de Aportes" (o desktop mantém a <table> manual). */
export function ResumoAportesCards({
  items,
  ariaLabel = 'Resumo de Aportes',
  withData = false,
}: {
  items: ResumoAporteItem[];
  ariaLabel?: string;
  withData?: boolean;
}) {
  return (
    <ResponsiveCardList<ResumoAporteItem>
      ariaLabel={ariaLabel}
      columns={
        withData ? [...RESUMO_APORTES_COLUMNS, RESUMO_APORTES_DATA_COLUMN] : RESUMO_APORTES_COLUMNS
      }
      rows={items}
      getRowKey={(i) => i.key}
      emptyState="Nenhum aporte sugerido por enquanto."
    />
  );
}

/** Linha "Total em USD" no cartão de total (Stocks/REIT; par da linha extra da tabela). */
export function UsdTotalMobile({ aplicado, atualizado }: { aplicado: string; atualizado: string }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
      <div className="min-w-0">
        <dt className="text-[11px] text-gray-500 dark:text-gray-400">Aplicado em USD</dt>
        <dd className="text-sm font-semibold tabular-nums break-words">{aplicado}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] text-gray-500 dark:text-gray-400">Atualizado em USD</dt>
        <dd className="text-sm font-semibold tabular-nums break-words">{atualizado}</dd>
      </div>
    </dl>
  );
}
