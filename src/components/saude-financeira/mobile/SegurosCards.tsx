'use client';

import React from 'react';
import type { SeguroDTO } from '@/hooks/useSeguros';
import { MobileStatusPill, type MobileStatusTone } from '@/components/ui/mobile/MobileStatusPill';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import {
  SEGURO_COBERTURA_LABELS,
  SEGURO_RISCO_LABELS,
  SEGURO_TIPO_LABELS,
  formatBRL,
} from '../utils';

/**
 * Seguros no celular (PWA fase 3): um cartão por apólice com nome, tipo, custo anual e os campos
 * Cobertura / Risco / Capital; rodapé com Editar e Excluir de 44px. Cobertura em ponto + palavra
 * (sem verde). Montado só no ramo `useIsBelowLg` (`hidden mscreen:block`).
 */

const COBERTURA_TONE: Record<string, MobileStatusTone> = {
  total: 'ok',
  parcial: 'atencao',
  nenhuma: 'problema',
};

interface SegurosCardsProps {
  seguros: SeguroDTO[];
  onEdit(seguro: SeguroDTO): void;
  onDelete(seguro: SeguroDTO): void;
}

export default function SegurosCards({ seguros, onEdit, onDelete }: SegurosCardsProps) {
  return (
    <ul data-mf-mobile="" className={TABLE_MOBILE_STYLES.list}>
      {seguros.map((s) => (
        <li key={s.id} data-mf-card="" className={TABLE_MOBILE_STYLES.card}>
          <div className={TABLE_MOBILE_STYLES.cardHeader}>
            <div className="min-w-0">
              <p className={`${TABLE_MOBILE_STYLES.cardTitle} truncate`}>{s.nome}</p>
              <p className={TABLE_MOBILE_STYLES.cardSubtitle}>
                {SEGURO_TIPO_LABELS[s.tipo] ?? s.tipo}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={TABLE_MOBILE_STYLES.valuePrimary}>{formatBRL(s.custoAnual)}</p>
              <p className={TABLE_MOBILE_STYLES.cardSubtitle}>por ano</p>
            </div>
          </div>
          <dl className={TABLE_MOBILE_STYLES.cardGrid}>
            <div className="min-w-0">
              <dt className={TABLE_MOBILE_STYLES.dt}>Cobertura</dt>
              <dd className="mt-0.5">
                <MobileStatusPill tone={COBERTURA_TONE[s.cobertura] ?? 'neutro'}>
                  {SEGURO_COBERTURA_LABELS[s.cobertura] ?? s.cobertura}
                </MobileStatusPill>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={TABLE_MOBILE_STYLES.dt}>Risco</dt>
              <dd className={TABLE_MOBILE_STYLES.dd}>{SEGURO_RISCO_LABELS[s.risco] ?? s.risco}</dd>
            </div>
            <div className="min-w-0">
              <dt className={TABLE_MOBILE_STYLES.dt}>Capital</dt>
              <dd className={`${TABLE_MOBILE_STYLES.dd} truncate`}>
                {s.capitalSegurado != null ? formatBRL(s.capitalSegurado) : '—'}
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex justify-end gap-2 border-t border-gray-100 pt-1 dark:border-gray-800">
            <button
              type="button"
              onClick={() => onEdit(s)}
              aria-label={`Editar ${s.nome}`}
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-mf-patrimonio dark:text-mf-tranquilidade"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => onDelete(s)}
              aria-label={`Excluir ${s.nome}`}
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-[#D92D20] dark:text-[#F97066]"
            >
              Excluir
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
