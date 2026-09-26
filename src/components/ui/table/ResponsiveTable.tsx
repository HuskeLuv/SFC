'use client';

import React, { Fragment, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import {
  TABLE_HEADER_STYLE,
  TABLE_HIGHLIGHT_HEADER_STYLE,
  TABLE_MOBILE_STYLES,
  TABLE_SECTION_STYLE,
  TABLE_STYLES,
} from './tableStyles';

/**
 * Tabela que vira lista de cartões abaixo de lg (PWA fase 0).
 *
 * - Desktop (≥ lg): <table> com exatamente `TABLE_STYLES` — o mesmo visual das tabelas atuais.
 * - Mobile (< lg): <ul> de cartões com `TABLE_MOBILE_STYLES`. Cada coluna escolhe o papel no
 *   cartão via `mobile`: `primary` (título, à esquerda), `value` (valor, à direita), `subtitle`
 *   (linha sob o título), `field` (grade de até 3; os excedentes viram linhas dt/dd) ou `hidden`.
 *   Sem `mobile`, a 1ª coluna é `primary` e as demais `field`.
 *
 * `strategy='css'` (padrão) renderiza as duas versões e alterna por CSS (sem flash na hidratação).
 * `strategy='js'` renderiza só uma, via `useIsBelowLg` — para tabelas grandes onde o DOM em dobro
 * pesa. Nenhuma tabela existente foi migrada nesta fase.
 *
 * A lista de cartões também é exportada sozinha (`ResponsiveCardList`, PWA fase 1) para as tabelas
 * da carteira, que mantêm o JSX de desktop e fazem `isBelowLg ? <ResponsiveCardList/> : <table>`.
 */

/**
 * Papel da coluna no cartão. `detail` (fase 1) só aparece no corpo do cartão ABERTO de uma lista
 * `expandable`; numa lista comum vira `field` excedente (linha dt/dd).
 */
export type ResponsiveMobileRole = 'primary' | 'value' | 'subtitle' | 'field' | 'detail' | 'hidden';

export interface ResponsiveColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  mobile?: ResponsiveMobileRole;
  /** Rótulo no cartão (padrão: `header`). */
  mobileLabel?: ReactNode;
  /**
   * Conteúdo SÓ TEXTO para o cabeçalho do cartão (usado no lugar de `cell` nos papéis primary,
   * value, subtitle e field). Obrigatório na prática quando `cell` tem link/botão e a lista é
   * `expandable`: o cabeçalho inteiro vira um <button> e não pode conter elemento interativo.
   */
  mobileCell?: (row: T, index: number) => ReactNode;
  /** Coluna em destaque no desktop (`TABLE_STYLES.highlightTd`). */
  highlight?: boolean;
  thClassName?: string;
  tdClassName?: string;
}

export interface ResponsiveTableGroup {
  key: string;
  label: ReactNode;
  subtotal?: ReactNode;
}

export interface ResponsiveTableTotal {
  label: ReactNode;
  /** Conteúdo por `column.id`. */
  cells: Partial<Record<string, ReactNode>>;
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  ariaLabel: string;
  onRowClick?: (row: T, index: number) => void;
  groupBy?: (row: T) => ResponsiveTableGroup;
  total?: ResponsiveTableTotal;
  emptyState?: ReactNode;
  compact?: boolean;
  /** Substitui o cartão padrão (o conteúdo vai dentro do <li>). */
  renderMobileCard?: (row: T, index: number) => ReactNode;
  strategy?: 'css' | 'js';
}

const MAX_GRID_FIELDS = 3;

const alignClassOf = (align: ResponsiveColumn<unknown>['align'] = 'left') =>
  ({ left: 'text-left', center: 'text-center', right: 'text-right' })[align];

export const resolveMobileRole = <T,>(col: ResponsiveColumn<T>, index: number) =>
  col.mobile ?? (index === 0 ? 'primary' : 'field');

interface Section<T> {
  group: ResponsiveTableGroup | null;
  items: { row: T; index: number }[];
}

/** Agrupa preservando a ordem da primeira aparição de cada grupo. */
function buildSections<T>(rows: T[], groupBy?: (row: T) => ResponsiveTableGroup): Section<T>[] {
  if (!groupBy) return [{ group: null, items: rows.map((row, index) => ({ row, index })) }];
  const byKey = new Map<string, Section<T>>();
  rows.forEach((row, index) => {
    const group = groupBy(row);
    let section = byKey.get(group.key);
    if (!section) {
      section = { group, items: [] };
      byKey.set(group.key, section);
    }
    section.items.push({ row, index });
  });
  return [...byKey.values()];
}

function activateOnKey(e: KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

export function ResponsiveTable<T>({
  columns,
  rows,
  getRowKey,
  ariaLabel,
  onRowClick,
  groupBy,
  total,
  emptyState,
  compact = false,
  renderMobileCard,
  strategy = 'css',
}: ResponsiveTableProps<T>) {
  const isBelowLg = useIsBelowLg();
  const sections = buildSections(rows, groupBy);
  const isEmpty = rows.length === 0;

  const showDesktop = strategy === 'css' || !isBelowLg;
  const showMobile = strategy === 'css' || isBelowLg;

  const thBase = compact ? TABLE_STYLES.compact.th : TABLE_STYLES.th;
  const tdBase = compact ? TABLE_STYLES.compact.td : TABLE_STYLES.td;

  // ── Desktop ────────────────────────────────────────────────────────────────
  const renderDesktop = () => (
    <div className={strategy === 'css' ? 'hidden lg:block' : undefined}>
      <div className={TABLE_STYLES.wrapper}>
        <table className={TABLE_STYLES.table} aria-label={ariaLabel}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={twMerge(thBase, alignClassOf(col.align), col.thClassName)}
                  style={col.highlight ? TABLE_HIGHLIGHT_HEADER_STYLE : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty && emptyState !== undefined && (
              <tr className={TABLE_STYLES.placeholderRow}>
                <td colSpan={columns.length} className={twMerge(tdBase, 'text-center')}>
                  {emptyState}
                </td>
              </tr>
            )}
            {sections.map((section, s) => (
              <Fragment key={section.group?.key ?? `__all-${s}`}>
                {section.group && (
                  <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
                    <td
                      colSpan={
                        section.group.subtotal !== undefined && columns.length > 1
                          ? columns.length - 1
                          : columns.length
                      }
                      className={tdBase}
                    >
                      {section.group.label}
                    </td>
                    {section.group.subtotal !== undefined && columns.length > 1 && (
                      <td className={twMerge(tdBase, 'text-right')}>{section.group.subtotal}</td>
                    )}
                  </tr>
                )}
                {section.items.map(({ row, index }) => (
                  <tr
                    key={getRowKey(row, index)}
                    className={twMerge(
                      TABLE_STYLES.row,
                      onRowClick && `${TABLE_STYLES.rowHover} cursor-pointer`,
                    )}
                    onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={twMerge(
                          tdBase,
                          alignClassOf(col.align),
                          col.highlight && TABLE_STYLES.highlightTd,
                          col.tdClassName,
                        )}
                      >
                        {col.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className={TABLE_STYLES.totalRow}>
                {columns.map((col, i) => (
                  <td key={col.id} className={twMerge(tdBase, alignClassOf(col.align))}>
                    {col.id in total.cells ? total.cells[col.id] : i === 0 ? total.label : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );

  return (
    <>
      {showDesktop && renderDesktop()}
      {showMobile && (
        <ResponsiveCardList<T>
          columns={columns}
          rows={rows}
          getRowKey={getRowKey}
          ariaLabel={ariaLabel}
          onRowClick={onRowClick}
          groupBy={groupBy}
          total={total}
          emptyState={emptyState}
          renderMobileCard={renderMobileCard}
          className={strategy === 'css' ? 'lg:hidden' : undefined}
        />
      )}
    </>
  );
}

// ── Lista de cartões (mobile) ────────────────────────────────────────────────────────────────

export interface ResponsiveCardListProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  ariaLabel: string;
  /** Cartão clicável (só sem `expandable`: com ele, o toque abre/fecha o cartão). */
  onRowClick?: (row: T, index: number) => void;
  groupBy?: (row: T) => ResponsiveTableGroup;
  total?: ResponsiveTableTotal;
  emptyState?: ReactNode;
  /** Substitui o cartão padrão (o conteúdo vai dentro do <li>). */
  renderMobileCard?: (row: T, index: number) => ReactNode;
  /**
   * Cartão que abre e fecha: o cabeçalho (primary, subtitle, value e fields, via `mobileCell`)
   * vira `button[data-mf-card-toggle]` com `aria-expanded`/`aria-controls`, e o corpo
   * (`[data-mf-card-body]`) só é montado aberto.
   */
  expandable?: boolean;
  /** Abre o cartão na primeira renderização (depois vale o toque do usuário). */
  defaultExpanded?: (row: T) => boolean;
  /** Atributos extras no <li> (ex.: `data-planejado`). `undefined` não é renderizado. */
  getRowAttributes?: (row: T) => Record<string, string | undefined>;
  /** Conteúdo do cartão ABERTO — substitui a grade padrão das colunas `detail`. */
  renderCardBody?: (row: T, index: number) => ReactNode;
  /** Rodapé do cartão aberto (links e botões: "Ver ativo", "Editar"…). */
  renderCardFooter?: (row: T, index: number) => ReactNode;
  /** Classe extra do cartão (ex.: borda tracejada do ativo planejado). */
  cardClassName?: (row: T) => string | undefined;
  /** Classe extra do <ul> (o `ResponsiveTable` passa `lg:hidden`). */
  className?: string;
}

const domIdOf = (key: string | number) => String(key).replace(/[^\w-]/g, '_');

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={twMerge(
        'mt-0.5 shrink-0 text-gray-400 motion-safe:transition-transform motion-safe:duration-150 dark:text-gray-500',
        open && 'rotate-90',
      )}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Lista de cartões — o lado mobile do `ResponsiveTable`, exportado para uso direto (PWA fase 1).
 * Sem `expandable`, o DOM é exatamente o da fase 0. Todo cartão de linha é um `li[data-mf-card]`.
 */
export function ResponsiveCardList<T>({
  columns,
  rows,
  getRowKey,
  ariaLabel,
  onRowClick,
  groupBy,
  total,
  emptyState,
  renderMobileCard,
  expandable = false,
  defaultExpanded,
  getRowAttributes,
  renderCardBody,
  renderCardFooter,
  cardClassName,
  className,
}: ResponsiveCardListProps<T>) {
  const baseId = useId();
  // Só o que o usuário tocou; o resto segue `defaultExpanded` (linhas que chegam depois inclusive).
  const [toggled, setToggled] = useState<Map<string | number, boolean>>(() => new Map());

  const sections = buildSections(rows, groupBy);
  const isEmpty = rows.length === 0;

  const roles = columns.map((col, i) => ({ col, role: resolveMobileRole(col, i) }));
  const primaryCol = roles.find((r) => r.role === 'primary')?.col;
  const valueCol = roles.find((r) => r.role === 'value')?.col;
  const subtitleCols = roles.filter((r) => r.role === 'subtitle').map((r) => r.col);
  const fieldCols = roles.filter((r) => r.role === 'field').map((r) => r.col);
  const detailCols = roles.filter((r) => r.role === 'detail').map((r) => r.col);
  const gridFields = fieldCols.slice(0, MAX_GRID_FIELDS);
  // Numa lista comum, `detail` é tratado como `field` excedente.
  const extraFields = expandable
    ? fieldCols.slice(MAX_GRID_FIELDS)
    : [...fieldCols.slice(MAX_GRID_FIELDS), ...detailCols];

  const labelOf = (col: ResponsiveColumn<T>) => col.mobileLabel ?? col.header;
  // No cabeçalho de um cartão expansível (um <button>) só entra texto.
  const headCell = (col: ResponsiveColumn<T>, row: T, index: number) =>
    expandable && col.mobileCell ? col.mobileCell(row, index) : col.cell(row, index);

  const renderCardHead = (row: T, index: number) => (
    <>
      <div className={TABLE_MOBILE_STYLES.cardHeader}>
        <div className="min-w-0">
          {primaryCol && (
            <div className={TABLE_MOBILE_STYLES.cardTitle}>{headCell(primaryCol, row, index)}</div>
          )}
          {subtitleCols.map((col) => (
            <div key={col.id} className={TABLE_MOBILE_STYLES.cardSubtitle}>
              {headCell(col, row, index)}
            </div>
          ))}
        </div>
        {valueCol && (
          <div className={TABLE_MOBILE_STYLES.valuePrimary}>{headCell(valueCol, row, index)}</div>
        )}
      </div>
      {gridFields.length > 0 && (
        <dl className={TABLE_MOBILE_STYLES.cardGrid}>
          {gridFields.map((col) => (
            <div key={col.id} className="min-w-0">
              <dt className={TABLE_MOBILE_STYLES.dt}>{labelOf(col)}</dt>
              <dd className={TABLE_MOBILE_STYLES.dd}>{headCell(col, row, index)}</dd>
            </div>
          ))}
        </dl>
      )}
      {!expandable && extraFields.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1">
          {extraFields.map((col) => (
            <div key={col.id} className="flex items-baseline justify-between gap-3">
              <dt className={TABLE_MOBILE_STYLES.dt}>{labelOf(col)}</dt>
              <dd className={twMerge(TABLE_MOBILE_STYLES.dd, 'text-right')}>
                {col.cell(row, index)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  const renderDefaultBody = (row: T, index: number) => {
    const cols = [...detailCols, ...extraFields];
    if (cols.length === 0) return null;
    return (
      <dl className={TABLE_MOBILE_STYLES.cardDetailGrid}>
        {cols.map((col) => (
          <div key={col.id} className="min-w-0">
            <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>{labelOf(col)}</dt>
            <dd className={TABLE_MOBILE_STYLES.cardDetailValue}>{col.cell(row, index)}</dd>
          </div>
        ))}
      </dl>
    );
  };

  const renderExpandableCard = (row: T, index: number) => {
    const key = getRowKey(row, index);
    const open = toggled.has(key) ? toggled.get(key)! : !!defaultExpanded?.(row);
    const bodyId = `${baseId}-card-${domIdOf(key)}`;
    const toggle = () =>
      setToggled((prev) => {
        const next = new Map(prev);
        next.set(key, !open);
        return next;
      });
    const footer = open ? renderCardFooter?.(row, index) : null;
    return (
      <div className={twMerge(TABLE_MOBILE_STYLES.card, 'p-0', cardClassName?.(row))}>
        <button
          type="button"
          data-mf-card-toggle=""
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className="flex w-full min-h-[72px] items-start gap-2 rounded-2xl px-4 py-3.5 text-left"
        >
          <div className="min-w-0 flex-1">{renderCardHead(row, index)}</div>
          <ChevronIcon open={open} />
        </button>
        {open && (
          <div id={bodyId} data-mf-card-body="" className="px-4 pb-3.5">
            {renderCardBody ? renderCardBody(row, index) : renderDefaultBody(row, index)}
            {footer != null && footer !== false && <div className="mt-3">{footer}</div>}
          </div>
        )}
      </div>
    );
  };

  const renderCard = (row: T, index: number) => {
    if (renderMobileCard) return renderMobileCard(row, index);
    if (expandable) return renderExpandableCard(row, index);
    const extra = cardClassName?.(row);
    if (!onRowClick)
      return (
        <div className={twMerge(TABLE_MOBILE_STYLES.card, extra)}>{renderCardHead(row, index)}</div>
      );
    const activate = () => onRowClick(row, index);
    return (
      <div
        role="button"
        tabIndex={0}
        className={twMerge(TABLE_MOBILE_STYLES.card, TABLE_MOBILE_STYLES.cardClickable, extra)}
        onClick={activate}
        onKeyDown={(e) => activateOnKey(e, activate)}
      >
        {renderCardHead(row, index)}
      </div>
    );
  };

  const rowAttributes = (row: T) => {
    const attrs = getRowAttributes?.(row);
    if (!attrs) return undefined;
    return Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined));
  };

  const totalFields = total
    ? columns.filter(
        (col) => col.id in total.cells && col.id !== valueCol?.id && col.id !== primaryCol?.id,
      )
    : [];

  return (
    <ul
      aria-label={ariaLabel}
      className={twMerge(
        className,
        expandable ? TABLE_MOBILE_STYLES.cardList : TABLE_MOBILE_STYLES.list,
      )}
    >
      {isEmpty && emptyState !== undefined && (
        <li className={twMerge(TABLE_MOBILE_STYLES.card, TABLE_MOBILE_STYLES.cardSubtitle)}>
          {emptyState}
        </li>
      )}
      {sections.map((section, s) => (
        <Fragment key={section.group?.key ?? `__all-${s}`}>
          {section.group && (
            <li className={TABLE_MOBILE_STYLES.groupBand}>
              <span className="min-w-0">{section.group.label}</span>
              {section.group.subtotal !== undefined && (
                <span className="tabular-nums">{section.group.subtotal}</span>
              )}
            </li>
          )}
          {section.items.map(({ row, index }) => (
            <li key={getRowKey(row, index)} data-mf-card="" {...rowAttributes(row)}>
              {renderCard(row, index)}
            </li>
          ))}
        </Fragment>
      ))}
      {total && (
        <li className={TABLE_MOBILE_STYLES.totalCard}>
          <div className={TABLE_MOBILE_STYLES.cardHeader}>
            <span>
              {primaryCol && primaryCol.id in total.cells
                ? total.cells[primaryCol.id]
                : total.label}
            </span>
            {valueCol && valueCol.id in total.cells && (
              <span className="tabular-nums">{total.cells[valueCol.id]}</span>
            )}
          </div>
          {totalFields.length > 0 && (
            <dl className="mt-2 flex flex-col gap-1">
              {totalFields.map((col) => (
                <div key={col.id} className="flex items-baseline justify-between gap-3">
                  <dt className={TABLE_MOBILE_STYLES.dt}>{labelOf(col)}</dt>
                  <dd className={twMerge(TABLE_MOBILE_STYLES.dd, 'text-right')}>
                    {total.cells[col.id]}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      )}
    </ul>
  );
}

export default ResponsiveTable;
