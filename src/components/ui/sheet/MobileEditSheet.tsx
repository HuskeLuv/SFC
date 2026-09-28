'use client';

import React, { useEffect, useId, useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import BottomSheet from './BottomSheet';
import MobileSaveToast from './MobileSaveToast';
import {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_HINT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
  MobileNumberField,
} from './MobileNumberField';
import { formatDecimalInput, parseDecimalInput, type DecimalLocale } from '@/lib/ui/numberInput';

export type MobileEditKind =
  | 'percent'
  | 'currency'
  | 'decimal'
  | 'integer'
  | 'text'
  | 'textarea'
  | 'select'
  | 'date';

export type MobileEditValue = number | string | null;

export interface MobileEditOption {
  value: string;
  label: string;
}

export interface MobileEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Título do sheet (ex.: 'Editar objetivo'). */
  title: string;
  /** O que está sendo editado (ex.: o ticker), mostrado acima do campo. */
  subject?: ReactNode;
  /** Rótulo do campo. */
  label: string;
  kind: MobileEditKind;
  initialValue: MobileEditValue;
  /** Opções do `kind='select'`. */
  options?: MobileEditOption[];
  /** Padrão: 'R$' em currency. */
  prefix?: ReactNode;
  /** Padrão: '%' em percent. */
  suffix?: ReactNode;
  locale?: DecimalLocale;
  min?: number;
  max?: number;
  /** `min` exclusivo: o valor tem que ser MAIOR que `min` (ex.: valor atualizado > 0). */
  minExclusive?: boolean;
  /** Campo pode ficar vazio (salva `null` nos numéricos e '' nos de texto). */
  allowEmpty?: boolean;
  /** Validação extra depois do parse: devolve a mensagem de erro ou `null`. */
  validate?: (value: MobileEditValue) => string | null;
  /** Parse próprio do texto digitado (ex.: `parseValorReserva`). `null` = inválido. */
  parseValue?: (raw: string) => number | string | null;
  /** Texto inicial do campo a partir de `initialValue`. */
  formatValue?: (value: MobileEditValue) => string;
  hint?: ReactNode;
  submitLabel?: string;
  /**
   * O MESMO callback do desktop. FALHA = exceção OU retorno `=== false` (os hooks da carteira
   * devolvem false sem lançar): o sheet fica aberto com o erro genérico. `{ error }` = falha com
   * o motivo (recusa por regra de negócio, que não adianta "tentar de novo"). Qualquer outro
   * retorno = sucesso.
   */
  onSubmit: (
    value: MobileEditValue,
  ) => void | boolean | MobileEditFailure | Promise<void | boolean | MobileEditFailure>;
  /** Mostrar o aviso "salvo" ao fechar com sucesso (padrão true). Sem Desfazer na fase 1. */
  showSavedToast?: boolean;
  /** Texto do aviso (padrão 'Salvo'). */
  savedMessage?: (value: MobileEditValue) => string;
}

const NUMERIC_KINDS: ReadonlySet<MobileEditKind> = new Set([
  'percent',
  'currency',
  'decimal',
  'integer',
]);

export const SAVE_ERROR_MESSAGE = 'Não foi possível salvar. Tente de novo.';

/** Falha com mensagem própria (ver `onSubmit`). */
export interface MobileEditFailure {
  error: string;
}

const isFailure = (r: unknown): r is MobileEditFailure =>
  typeof r === 'object' && r !== null && typeof (r as MobileEditFailure).error === 'string';

function defaultFormat(kind: MobileEditKind, value: MobileEditValue, locale: DecimalLocale) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!NUMERIC_KINDS.has(kind)) return String(value);
    if (kind === 'integer') return formatDecimalInput(value, locale, 0).replace(/[.,\s]/g, '');
    // Sem zeros à direita: 12.5 → '12,5'; 1234 → '1.234' só em currency (com centavos).
    if (kind === 'currency') return formatDecimalInput(value, locale, 2);
    return value.toLocaleString(locale, { maximumFractionDigits: 6, useGrouping: false });
  }
  return String(value);
}

const formatLimit = (n: number, locale: DecimalLocale) =>
  n.toLocaleString(locale, { maximumFractionDigits: 6 });

/**
 * Edição de UM campo no celular (PWA fase 1), sobre o `BottomSheet`. Salva no botão ou no Enter
 * (no textarea o Enter quebra linha) — nunca no blur. Durante o save o botão fica ocupado; falha
 * mantém o sheet aberto com o valor digitado; sucesso fecha e mostra o aviso "salvo" por 4s.
 *
 * Mantenha o componente MONTADO e controle só `isOpen`: o aviso vive nele e aparece depois que o
 * sheet fecha.
 */
export function MobileEditSheet({
  isOpen,
  onClose,
  title,
  subject,
  label,
  kind,
  initialValue,
  options,
  prefix,
  suffix,
  locale = 'pt-BR',
  min,
  max,
  minExclusive = false,
  allowEmpty = false,
  validate,
  parseValue,
  formatValue,
  hint,
  submitLabel = 'Salvar',
  onSubmit,
  showSavedToast = true,
  savedMessage,
}: MobileEditSheetProps) {
  const baseId = useId();
  const fieldId = `${baseId}-campo`;
  const formId = `${baseId}-form`;
  const errorId = `${fieldId}-erro`;
  const hintId = `${fieldId}-dica`;

  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Reabre sempre com o valor atual (e sem erros da vez anterior).
  useEffect(() => {
    if (!isOpen) return;
    setText(formatValue ? formatValue(initialValue) : defaultFormat(kind, initialValue, locale));
    setFieldError(null);
    setSaveError(null);
    setSaving(false);
    // Só na abertura: mudar initialValue com o sheet aberto não apaga o que o usuário digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isNumeric = NUMERIC_KINDS.has(kind);
  const effectivePrefix = prefix ?? (kind === 'currency' ? 'R$' : undefined);
  const effectiveSuffix = suffix ?? (kind === 'percent' ? '%' : undefined);

  /** Texto → valor, ou a mensagem de erro. */
  const resolve = (): { value: MobileEditValue } | { error: string } => {
    const raw = kind === 'textarea' || kind === 'text' ? text : text.trim();
    if (raw.trim() === '') {
      if (allowEmpty) return { value: isNumeric ? null : '' };
      return { error: 'Preencha este campo.' };
    }
    let value: MobileEditValue;
    if (parseValue) value = parseValue(raw);
    else if (isNumeric) value = parseDecimalInput(raw, locale);
    else value = raw;

    if (value === null || (typeof value === 'number' && !Number.isFinite(value))) {
      return { error: 'Digite um número válido.' };
    }
    if (typeof value === 'number') {
      if (kind === 'integer' && !Number.isInteger(value)) {
        return { error: 'Digite um número inteiro.' };
      }
      if (min !== undefined && (minExclusive ? value <= min : value < min)) {
        return {
          error: minExclusive
            ? `O valor deve ser maior que ${formatLimit(min, locale)}.`
            : `O valor mínimo é ${formatLimit(min, locale)}.`,
        };
      }
      if (max !== undefined && value > max) {
        return { error: `O valor máximo é ${formatLimit(max, locale)}.` };
      }
    }
    const custom = validate?.(value);
    if (custom) return { error: custom };
    return { value };
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const result = resolve();
    if ('error' in result) {
      setFieldError(result.error);
      return;
    }
    setFieldError(null);
    setSaveError(null);
    setSaving(true);
    let failure: string | null;
    try {
      const r = await onSubmit(result.value);
      failure = r === false ? SAVE_ERROR_MESSAGE : isFailure(r) ? r.error : null;
    } catch {
      failure = SAVE_ERROR_MESSAGE;
    }
    setSaving(false);
    if (failure) {
      setSaveError(failure);
      return;
    }
    onClose();
    if (showSavedToast) setToast(savedMessage ? savedMessage(result.value) : 'Salvo');
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const onFieldChange = (next: string) => {
    setText(next);
    if (fieldError) setFieldError(null);
  };

  const describedBy = fieldError ? errorId : hint ? hintId : undefined;
  const fieldClass = twMerge(MOBILE_FIELD_CLASS, fieldError && MOBILE_FIELD_ERROR_CLASS);

  const renderField = () => {
    if (isNumeric) {
      return (
        <MobileNumberField
          id={fieldId}
          label={label}
          kind={kind as 'percent' | 'currency' | 'decimal' | 'integer'}
          value={text}
          onChange={onFieldChange}
          prefix={effectivePrefix}
          suffix={effectiveSuffix}
          error={fieldError}
          hint={hint}
          enterKeyHint="done"
          autoFocus
          disabled={saving}
        />
      );
    }
    let control: ReactNode;
    if (kind === 'textarea') {
      control = (
        <textarea
          id={fieldId}
          value={text}
          onChange={(e) => onFieldChange(e.target.value)}
          rows={4}
          autoFocus
          disabled={saving}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          className={twMerge(fieldClass, 'h-auto min-h-[104px] py-3')}
        />
      );
    } else if (kind === 'select') {
      control = (
        <select
          id={fieldId}
          value={text}
          onChange={(e) => onFieldChange(e.target.value)}
          disabled={saving}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          className={fieldClass}
        >
          {!options?.some((o) => o.value === text) && <option value="">Selecione…</option>}
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    } else {
      control = (
        <input
          id={fieldId}
          type={kind === 'date' ? 'date' : 'text'}
          value={text}
          onChange={(e) => onFieldChange(e.target.value)}
          enterKeyHint="done"
          autoFocus={kind === 'text'}
          disabled={saving}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          className={fieldClass}
        />
      );
    }
    return (
      <div>
        <label htmlFor={fieldId} className={MOBILE_FIELD_LABEL_CLASS}>
          {label}
        </label>
        {control}
        {fieldError && (
          <p id={errorId} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
            {fieldError}
          </p>
        )}
        {hint && !fieldError && (
          <p id={hintId} className={MOBILE_FIELD_HINT_CLASS}>
            {hint}
          </p>
        )}
      </div>
    );
  };

  const footer = (
    <div className="flex flex-col gap-2">
      {saveError && (
        <p role="alert" className={twMerge(MOBILE_FIELD_ERROR_TEXT_CLASS, 'mt-0')}>
          {saveError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={saving}
          className="h-12 flex-1 rounded-xl border border-gray-300 text-base font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form={formId}
          disabled={saving}
          aria-busy={saving || undefined}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-mf-patrimonio text-base font-semibold text-white disabled:opacity-80"
        >
          {saving && (
            <svg
              className="h-4 w-4 motion-safe:animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="3"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          )}
          {saving ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={handleClose} title={title} footer={footer}>
        <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 pb-3">
          {subject != null && (
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{subject}</p>
          )}
          {renderField()}
        </form>
      </BottomSheet>
      <MobileSaveToast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

export default MobileEditSheet;
