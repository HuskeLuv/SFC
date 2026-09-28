'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { CashflowGroup } from '@/types/cashflow';
import { aggregateCashflow } from '@/services/cashflow/cashflowAggregation';
import { CANONICAL_GROUPS, canonicalName } from '@/services/cashflow/groupMatchers';
import {
  DESPESAS_PERCENT_STYLE,
  getGroupCapabilities,
  READONLY_REASON_TEXT,
} from '@/lib/cashflow/itemCapabilities';
import { formatBRL } from '@/utils/format';
import { MONTH_NAMES } from '@/components/cashflow/mobile/MonthStepper';
import { ActionRow, ICONS, InfoNote } from './sheetUi';

/**
 * Ações do grupo (⋯ da faixa, PWA fase 2, protótipo cenário d3): subtotal do mês e do ano (e o %
 * da receita no Despesas raiz, com as faixas do desktop), "Adicionar linha", "Reordenar linhas"
 * (modo com setas da visão do mês) e o atalho para o Planejamento de Sonhos. Não há renomear
 * grupo (o desktop também não tem).
 */

export interface GroupSheetProps {
  month: number;
  group: CashflowGroup;
  groups: CashflowGroup[];
  onAddItem(): void;
  onStartReorder(): void;
}

export function GroupSheet({ month, group, groups, onAddItem, onStartReorder }: GroupSheetProps) {
  // Mesma agregação do desktop (useProcessedData → aggregateCashflow).
  const aggregation = useMemo(() => aggregateCashflow(groups), [groups]);
  const monthTotal = aggregation.groupTotals[group.id]?.[month] ?? 0;
  const annualTotal = aggregation.groupAnnualTotals[group.id] ?? 0;
  const canonical = canonicalName(group);
  const isDespesasRoot = canonical === CANONICAL_GROUPS.DESPESAS && !group.parentId;
  const percent = aggregation.groupPercentages[group.id] ?? 0;
  const isPlanejamento = canonical === 'Planejamento Financeiro';
  const isInvestimento = group.type === 'investimento';
  const caps = getGroupCapabilities(group);
  const visibleItems = (group.items ?? []).filter((i) => !i.hidden);
  const canReorder = !isInvestimento && visibleItems.length >= 2;

  return (
    <div className="flex flex-col gap-2 pb-3">
      <p className="text-sm text-gray-600 tabular-nums dark:text-gray-300">
        <span className="font-semibold text-gray-800 dark:text-white/90">
          {formatBRL(monthTotal)}
        </span>{' '}
        em {MONTH_NAMES[month]} · {formatBRL(annualTotal)} no ano
      </p>
      {isDespesasRoot && percent > 0 && (
        <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <span
            className="rounded-md px-2 py-0.5 text-[13px] font-semibold tabular-nums"
            style={DESPESAS_PERCENT_STYLE(percent)}
          >
            {percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
          da receita no ano
        </p>
      )}
      <div className="mt-1">
        {caps.addRow && (
          <ActionRow
            icon={ICONS.add}
            title="Adicionar linha"
            description={`Nova linha no fim de ${group.name}`}
            onClick={onAddItem}
          />
        )}
        {canReorder && (
          <ActionRow
            icon={ICONS.reorder}
            title="Reordenar linhas"
            description="Setas para subir e descer, sem arrastar"
            onClick={onStartReorder}
            chevron={false}
          />
        )}
        {isPlanejamento && (
          <Link
            href="/planejamento-financeiro"
            className="grid min-h-[52px] w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40 active:bg-gray-100 dark:active:bg-white/5"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-[10px] bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"
              aria-hidden="true"
            >
              {ICONS.link}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-gray-800 dark:text-white/90">
                Abrir Planejamento de Sonhos
              </span>
              <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">
                Os sonhos se editam lá
              </span>
            </span>
            <span className="text-gray-400" aria-hidden="true">
              {ICONS.chevron}
            </span>
          </Link>
        )}
      </div>
      {isInvestimento && <InfoNote>{READONLY_REASON_TEXT.investimento}.</InfoNote>}
      {!isInvestimento && !caps.addRow && !canReorder && !isPlanejamento && (
        <InfoNote>
          Este grupo soma as seções de baixo. Use o ⋯ de cada seção para adicionar ou reordenar
          linhas.
        </InfoNote>
      )}
    </div>
  );
}

export default GroupSheet;
