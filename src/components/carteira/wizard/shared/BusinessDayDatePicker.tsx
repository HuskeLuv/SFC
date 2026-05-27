'use client';

import React, { useEffect, useState } from 'react';
import DatePicker from '@/components/form/date-picker';
import { isNonBusinessDayB3, nextBusinessDayB3 } from '@/utils/feriadosB3';

interface BusinessDayDatePickerProps {
  id: string;
  label: string;
  placeholder?: string;
  /** Valor controlado em ISO 'YYYY-MM-DD' (mesmo formato dos demais Step4*). */
  value: string;
  /** Callback recebe sempre uma data útil (UTC), no formato 'YYYY-MM-DD'. */
  onChange: (isoDate: string) => void;
  /** Mensagem de erro de validação (renderizada em vermelho como nos demais). */
  error?: string;
  staticPosition?: boolean;
  appendToBody?: boolean;
}

/** 'YYYY-MM-DD' → timestamp UTC midnight. */
const isoToUtcMidnight = (iso: string): number | null => {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const ts = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Number.isFinite(ts) ? ts : null;
};

/** timestamp UTC midnight → 'YYYY-MM-DD' */
const utcMidnightToIso = (ts: number): string => new Date(ts).toISOString().split('T')[0];

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' para mensagens em PT-BR. */
const isoToBrDate = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
};

interface Adjustment {
  reason: 'fim de semana' | 'feriado B3';
  originalIso: string;
  adjustedIso: string;
}

const computeAdjustment = (rawIso: string): Adjustment | null => {
  const rawTs = isoToUtcMidnight(rawIso);
  if (rawTs === null) return null;
  if (!isNonBusinessDayB3(rawTs)) return null;
  const nextTs = nextBusinessDayB3(rawTs);
  const dow = new Date(rawTs).getUTCDay();
  const reason: Adjustment['reason'] = dow === 0 || dow === 6 ? 'fim de semana' : 'feriado B3';
  return {
    reason,
    originalIso: rawIso,
    adjustedIso: utcMidnightToIso(nextTs),
  };
};

/**
 * DatePicker do wizard que detecta finais de semana e feriados B3.
 *
 * Comportamento (UX decidida em F1.5):
 *   1. Usuário escolhe data não-útil (sábado/domingo/feriado nacional).
 *   2. Componente auto-desloca para o próximo dia útil B3 via `nextBusinessDayB3`.
 *   3. Avisa em texto amarelo abaixo do campo enquanto o usuário não trocar
 *      novamente pra um BD. Não bloqueia o botão Avançar.
 *
 * Não cobre feriados estaduais/municipais nem feriados-ponte por decreto pontual
 * — alinhado com o escopo de `src/utils/feriadosB3.ts`.
 */
export default function BusinessDayDatePicker({
  id,
  label,
  placeholder,
  value,
  onChange,
  error,
  staticPosition,
  appendToBody,
}: BusinessDayDatePickerProps) {
  // Mantém o aviso visível mesmo após auto-correção (`value` já foi corrigido,
  // mas o usuário precisa entender que houve ajuste)
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);

  // Se o valor inicial (vindo de defaultDate ou edição) é não-útil, ajusta na montagem
  useEffect(() => {
    if (!value) return;
    const adj = computeAdjustment(value);
    if (adj && adj.adjustedIso !== value) {
      setAdjustment(adj);
      onChange(adj.adjustedIso);
    }
    // Intencional: só uma vez na montagem para corrigir dados legados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <DatePicker
        id={id}
        label={label}
        placeholder={placeholder}
        defaultDate={value}
        staticPosition={staticPosition}
        appendToBody={appendToBody}
        onChange={(selectedDates) => {
          if (!selectedDates || selectedDates.length === 0) return;
          const rawIso = selectedDates[0].toISOString().split('T')[0];
          const adj = computeAdjustment(rawIso);
          if (adj) {
            setAdjustment(adj);
            if (adj.adjustedIso !== value) {
              onChange(adj.adjustedIso);
            }
          } else {
            setAdjustment(null);
            if (rawIso !== value) {
              onChange(rawIso);
            }
          }
        }}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {!error && adjustment && (
        <p
          className="mt-1 text-sm text-amber-600 dark:text-amber-400"
          data-testid={`${id}-business-day-warning`}
        >
          A data {isoToBrDate(adjustment.originalIso)} é {adjustment.reason} sem pregão. A operação
          foi movida para <strong>{isoToBrDate(adjustment.adjustedIso)}</strong>.
        </p>
      )}
    </div>
  );
}

// Helpers expostos para testes diretos
export const __testing__ = {
  isoToUtcMidnight,
  utcMidnightToIso,
  isoToBrDate,
  computeAdjustment,
};
