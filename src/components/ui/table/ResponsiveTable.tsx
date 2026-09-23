'use client';

import React, { Fragment, type KeyboardEvent, type ReactNode } from 'react';
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
 */

export type ResponsiveMobileRole = 'primary' | 'value' | 'subtitle' | 'field' | 'hidden';

export interface ResponsiveColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  mobile?: ResponsiveMobileRole;
  /** Rótulo no cartão (padrão: `header`). */
  mobileLabel?: ReactNode;
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

  // ── Mobile ─────────────────────────────────────────────────────────────────
  const roles = columns.map((col, i) => ({ col, role: resolveMobileRole(col, i) }));
  const primaryCol = roles.find((r) => r.role === 'primary')?.col;
  const valueCol = roles.find((r) => r.role === 'value')?.col;
  const subtitleCols = roles.filter((r) => r.role === 'subtitle').map((r) => r.col);
  const fieldCols = roles.filter((r) => r.role === 'field').map((r) => r.col);
  const gridFields = fieldCols.slice(0, MAX_GRID_FIELDS);
  const extraFields = fieldCols.slice(MAX_GRID_FIELDS);

  const labelOf = (col: ResponsiveColumn<T>) => col.mobileLabel ?? col.header;

  const renderCardBody = (row: T, index: number) => (
    <>
      <div className={TABLE_MOBILE_STYLES.cardHeader}>
        <div className="min-w-0">
          {primaryCol && (
            <div className={TABLE_MOBILE_STYLES.cardTitle}>{primaryCol.cell(row, index)}</div>
          )}
          {subtitleCols.map((col) => (
            <div key={col.id} className={TABLE_MOBILE_STYLES.cardSubtitle}>
              {col.cell(row, index)}
            </div>
          ))}
        </div>
        {valueCol && (
          <div className={TABLE_MOBILE_STYLES.valuePrimary}>{valueCol.cell(row, index)}</div>
        )}
      </div>
      {gridFields.length > 0 && (
        <dl className={TABLE_MOBILE_STYLES.cardGrid}>
          {gridFields.map((col) => (
            <div key={col.id} className="min-w-0">
              <dt className={TABLE_MOBILE_STYLES.dt}>{labelOf(col)}</dt>
              <dd className={TABLE_MOBILE_STYLES.dd}>{col.cell(row, index)}</dd>
            </div>
          ))}
        </dl>
      )}
      {extraFields.length > 0 && (
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

  const renderCard = (row: T, index: number) => {
    if (renderMobileCard) return renderMobileCard(row, index);
    if (!onRowClick)
      return <div className={TABLE_MOBILE_STYLES.card}>{renderCardBody(row, index)}</div>;
    const activate = () => onRowClick(row, index);
    return (
      <div
        role="button"
        tabIndex={0}
        className={twMerge(TABLE_MOBILE_STYLES.card, TABLE_MOBILE_STYLES.cardClickable)}
        onClick={activate}
        onKeyDown={(e) => activateOnKey(e, activate)}
      >
        {renderCardBody(row, index)}
      </div>
    );
  };

  const totalFields = total
    ? columns.filter(
        (col) => col.id in total.cells && col.id !== valueCol?.id && col.id !== primaryCol?.id,
      )
    : [];

  const renderMobile = () => (
    <ul
      aria-label={ariaLabel}
      className={twMerge(strategy === 'css' && 'lg:hidden', TABLE_MOBILE_STYLES.list)}
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
            <li key={getRowKey(row, index)}>{renderCard(row, index)}</li>
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

  return (
    <>
      {showDesktop && renderDesktop()}
      {showMobile && renderMobile()}
    </>
  );
}

export default ResponsiveTable;
