'use client';

import React, { useMemo } from 'react';
import { twMerge } from 'tailwind-merge';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import type { DividaDTO } from '@/hooks/useDividas';
import { TIPO_LABELS, formatBRL, formatTaxaPercent, formatYearMonth } from '../utils';
import { dividaSituacao } from './dividaSituacao';

export type CetSort = 'desc' | 'asc' | null;

interface DividasCardsProps {
  /** Já na ordem do DividasTable (ordenação por CET aplicada lá). */
  dividas: DividaDTO[];
  totalDevido: number;
  totalParcelas: number;
  cetSort: CetSort;
  /** Mesmo ciclo do cabeçalho "CET a.m." da tabela: maior → menor → ordem original. */
  onCycleCetSort: () => void;
  onSelectDivida: (id: string) => void;
}

const CET_LABEL: Record<'desc' | 'asc' | 'none', string> = {
  none: 'Ordenar por CET',
  desc: 'CET: maior primeiro',
  asc: 'CET: menor primeiro',
};

/**
 * Lista de dívidas em cartões (PWA fase 3, só abaixo de lg — o DividasTable decide o ramo). Cada
 * cartão: nome, instituição · tipo, saldo (corrigido quando indexada), situação em ponto + palavra,
 * barra de parcelas pagas e a próxima parcela. Concluídas vão para o fim, com a barra suave.
 */
export default function DividasCards({
  dividas,
  totalDevido,
  totalParcelas,
  cetSort,
  onCycleCetSort,
  onSelectDivida,
}: DividasCardsProps) {
  // Partição estável: a ordem (original ou por CET) vale dentro de cada grupo.
  const ordenadas = useMemo(
    () => [
      ...dividas.filter((d) => d.status !== 'quitada'),
      ...dividas.filter((d) => d.status === 'quitada'),
    ],
    [dividas],
  );

  return (
    <div data-mf-mobile="" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCycleCetSort}
          aria-pressed={cetSort !== null}
          className={twMerge(TABLE_MOBILE_STYLES.chip, cetSort && TABLE_MOBILE_STYLES.chipActive)}
        >
          {CET_LABEL[cetSort ?? 'none']}
          <span aria-hidden="true" className="ml-1">
            {cetSort === 'desc' ? '↓' : cetSort === 'asc' ? '↑' : '↕'}
          </span>
        </button>
        <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {dividas.length} dívida{dividas.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className={TABLE_MOBILE_STYLES.list}>
        {ordenadas.map((d) => {
          const r = d.resumo;
          const situacao = dividaSituacao(d.status);
          const quitada = d.status === 'quitada';
          const isFinanciamento = d.modalidade === 'financiamento';
          const pagas = r?.parcelasPagas ?? null;
          const total = r?.totalParcelas ?? null;
          const pct = isFinanciamento && pagas != null && total ? (pagas / total) * 100 : null;
          const saldo = r?.saldoCorrigido ?? r?.saldoDevedor;
          const prox = r?.proximaParcela ?? null;
          const subtitulo = [
            d.instituicao,
            TIPO_LABELS[d.tipo],
            d.taxaAm != null ? `CET ${formatTaxaPercent(d.taxaAm)} a.m.` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={d.id}>
              <button
                type="button"
                data-mf-card=""
                onClick={() => onSelectDivida(d.id)}
                className={twMerge(
                  TABLE_MOBILE_STYLES.card,
                  TABLE_MOBILE_STYLES.cardClickable,
                  'block w-full text-left',
                )}
              >
                <span className={TABLE_MOBILE_STYLES.cardHeader}>
                  <span className="min-w-0">
                    <span className={`block truncate ${TABLE_MOBILE_STYLES.cardTitle}`}>
                      {d.nome}
                    </span>
                    <span className={`mt-0.5 block ${TABLE_MOBILE_STYLES.cardSubtitle}`}>
                      {subtitulo}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={TABLE_MOBILE_STYLES.valuePrimary}>
                      {quitada ? '—' : formatBRL(saldo)}
                    </span>
                    <MobileStatusPill tone={situacao.tone}>{situacao.label}</MobileStatusPill>
                  </span>
                </span>
                {pct !== null ? (
                  <span
                    aria-hidden="true"
                    className="mt-3 block h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
                  >
                    <span
                      data-mf-divida-progresso=""
                      className={`block h-full rounded-full ${quitada ? 'bg-[#0079F2]/35' : 'bg-[#0079F2]'}`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </span>
                ) : null}
                <span className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="tabular-nums">
                    {isFinanciamento && pagas != null && total
                      ? `${pagas} de ${total} parcelas pagas`
                      : isFinanciamento
                        ? 'Financiamento'
                        : 'Rotativa'}
                  </span>
                  {prox ? (
                    <span className="tabular-nums">
                      Próxima: {formatYearMonth(prox.mes)} ·{' '}
                      <span className="font-medium text-gray-700 dark:text-gray-200">
                        {formatBRL(r?.proximaParcelaCorrigida ?? prox.parcela)}
                      </span>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={`${TABLE_MOBILE_STYLES.totalCard} flex items-baseline justify-between gap-3`}>
        <span className="text-sm">Total em aberto</span>
        <span className="text-right">
          <span className="block text-base font-semibold tabular-nums">
            {formatBRL(totalDevido)}
          </span>
          {totalParcelas > 0 ? (
            <span className="block text-xs text-gray-500 tabular-nums dark:text-gray-400">
              parcelas: {formatBRL(totalParcelas)}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
