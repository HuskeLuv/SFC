'use client';

import React, { type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export type MobileNumberKind = 'percent' | 'currency' | 'decimal' | 'integer';

/** Caixa de campo do celular: 48px, 16px de fonte (sem zoom no iOS), foco de 3px. */
export const MOBILE_FIELD_CLASS =
  'h-12 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-base text-gray-800 outline-none focus:border-mf-patrimonio focus:ring-[3px] focus:ring-[#0079F2]/30 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-mf-tranquilidade';

/** Borda de erro (vermelho semântico). */
export const MOBILE_FIELD_ERROR_CLASS =
  'border-[#D92D20] focus:border-[#D92D20] focus:ring-[#D92D20]/20 dark:border-[#F97066] dark:focus:border-[#F97066]';

export const MOBILE_FIELD_LABEL_CLASS =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export const MOBILE_FIELD_ERROR_TEXT_CLASS =
  'mt-1.5 text-[12.5px] text-[#D92D20] dark:text-[#F97066]';

export const MOBILE_FIELD_HINT_CLASS = 'mt-1.5 text-xs text-gray-500 dark:text-gray-400';

export interface MobileNumberFieldProps {
  id: string;
  label: ReactNode;
  kind: MobileNumberKind;
  /** Texto do campo, como digitado (o parse é de quem usa: `parseDecimalInput`). */
  value: string;
  onChange: (value: string) => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>['enterKeyHint'];
  autoFocus?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

/**
 * Campo numérico do celular (PWA fase 1): texto livre com teclado numérico (`inputMode`), sem
 * `type=number` — aceita vírgula decimal e não some com o valor em entradas parciais.
 */
export function MobileNumberField({
  id,
  label,
  kind,
  value,
  onChange,
  prefix,
  suffix,
  error,
  hint,
  enterKeyHint,
  autoFocus,
  onKeyDown,
  disabled,
}: MobileNumberFieldProps) {
  const errorId = `${id}-erro`;
  const hintId = `${id}-dica`;
  const describedBy = error ? errorId : hint ? hintId : '';
  return (
    <div>
      <label htmlFor={id} className={MOBILE_FIELD_LABEL_CLASS}>
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix != null && (
          <span
            className="pointer-events-none absolute left-3.5 text-base text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
          autoComplete="off"
          enterKeyHint={enterKeyHint}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={twMerge(
            MOBILE_FIELD_CLASS,
            'tabular-nums',
            prefix != null && 'pl-10',
            suffix != null && 'pr-10',
            error && MOBILE_FIELD_ERROR_CLASS,
          )}
        />
        {suffix != null && (
          <span
            className="pointer-events-none absolute right-3.5 text-base text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          >
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className={MOBILE_FIELD_HINT_CLASS}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default MobileNumberField;
