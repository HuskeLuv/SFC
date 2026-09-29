'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { logger } from '@/lib/logger';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import MobileNumberField, {
  MOBILE_FIELD_CLASS,
  MOBILE_FIELD_ERROR_CLASS,
  MOBILE_FIELD_ERROR_TEXT_CLASS,
  MOBILE_FIELD_LABEL_CLASS,
} from '@/components/ui/sheet/MobileNumberField';
import { useResponsiveConfirm } from '@/components/ui/sheet/useResponsiveConfirm';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';
import { categoryFromMonths, pmt, type Status } from '@/services/planejamento/planejamentoSonhos';
import {
  useCreateObjetivo,
  useDeleteObjetivo,
  useUpdateObjetivo,
  usePlanejamentoDefaults,
  type ObjetivoUpsertPayload,
  type PlanejamentoObjetivoDTO,
  type PlanejamentoPriority,
} from '@/hooks/usePlanejamentoSonhos';
import {
  CATEGORY_LONG_LABELS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  currentYearMonth,
  formatBRL,
} from './utils';

interface SonhosObjetivoInlineFormProps {
  /** null = modo criação; objeto = modo edição. */
  objetivo: PlanejamentoObjetivoDTO | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
  /**
   * 'inline' (padrão, o de hoje): cartão no meio da página. 'sheet' (celular, PWA fase 3): o form
   * abre num sheet alto — quem usa só monta o componente enquanto ele está aberto (Cancelar/fechar
   * = onCancel). Mesmos campos, mesma validação, mesmo payload.
   */
  presentation?: 'inline' | 'sheet';
}

type FormState = {
  name: string;
  target: string;
  months: string;
  startDate: string; // YYYY-MM
  available: string;
  ratePercent: string;
  priority: PlanejamentoPriority;
  status: Status;
};

/**
 * Número do campo. Inline: `Number(s)` (input type=number, como sempre). Sheet: texto com vírgula
 * ('25.000,50') via parseDecimalInput — o mesmo número vai no payload.
 */
function toNumber(value: string, isSheet: boolean): number {
  if (!isSheet) return Number(value) || 0;
  return parseDecimalInput(value) ?? 0;
}

/** Texto inicial dos campos numéricos no sheet: vírgula decimal ('1.234,56'). */
function sheetFormState(f: FormState): FormState {
  const money = (v: string) => (v === '' ? '' : formatDecimalInput(Number(v)));
  return {
    ...f,
    target: money(f.target),
    available: money(f.available),
    ratePercent: money(f.ratePercent),
  };
}

function initialFormState(objetivo: PlanejamentoObjetivoDTO | null): FormState {
  if (!objetivo) {
    return {
      name: '',
      target: '',
      months: '',
      startDate: currentYearMonth(),
      available: '',
      ratePercent: '',
      priority: 'Moderado',
      status: 'Iniciado',
    };
  }
  return {
    name: objetivo.name,
    target: String(objetivo.target),
    months: String(objetivo.months),
    startDate: objetivo.startDate ?? currentYearMonth(),
    available: String(objetivo.available),
    ratePercent: (objetivo.rate * 100).toFixed(2),
    priority: objetivo.priority,
    status: objetivo.status,
  };
}

/**
 * Card inline pra criar/editar objetivo. 8 campos visíveis (nome, meta, prazo,
 * início, saldo, rate, prioridade, status); demais ficam derivados:
 *  - category: auto via categoryFromMonths(prazo)
 *  - notes: preservado em edição; vazio em criação
 *  - endDate: derivado (não persistido)
 *
 * Auto-defaults em modo criação: rate vem do CDI mensal e available do
 * patrimônio agregado do user (via /api/planejamento-sonhos/defaults).
 * User pode editar.
 */
export default function SonhosObjetivoInlineForm({
  objetivo,
  onCancel,
  onSaved,
  onDeleted,
  presentation = 'inline',
}: SonhosObjetivoInlineFormProps) {
  const isEdit = !!objetivo;
  const isSheet = presentation === 'sheet';
  const formId = useId();
  const { confirm, confirmSheet } = useResponsiveConfirm();
  const [form, setForm] = useState<FormState>(() => {
    const initial = initialFormState(objetivo);
    return isSheet ? sheetFormState(initial) : initial;
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});

  const createMutation = useCreateObjetivo();
  const updateMutation = useUpdateObjetivo();
  const deleteMutation = useDeleteObjetivo();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const defaultsQuery = usePlanejamentoDefaults();

  // Aplica defaults só uma vez quando o user ainda não tocou nos campos
  // (modo create). Em edit, defaults são ignorados.
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (isEdit || defaultsApplied) return;
    if (!defaultsQuery.data) return;
    const available = (defaultsQuery.data!.available || 0).toFixed(2);
    const ratePercent = (defaultsQuery.data!.rate * 100).toFixed(2);
    setForm((f) => ({
      ...f,
      available: f.available || (isSheet ? formatDecimalInput(Number(available)) : available),
      ratePercent:
        f.ratePercent || (isSheet ? formatDecimalInput(Number(ratePercent)) : ratePercent),
    }));
    setDefaultsApplied(true);
  }, [defaultsQuery.data, isEdit, defaultsApplied, isSheet]);

  const monthsNum = toNumber(form.months, isSheet);
  const targetNum = toNumber(form.target, isSheet);
  const availableNum = toNumber(form.available, isSheet);
  const rateDecimal = toNumber(form.ratePercent, isSheet) / 100;

  const aporteMensal = useMemo(() => {
    if (targetNum <= 0 || monthsNum <= 0) return 0;
    return pmt({
      target: targetNum,
      available: availableNum,
      months: monthsNum,
      rate: rateDecimal,
    });
  }, [targetNum, availableNum, monthsNum, rateDecimal]);

  const categoria = monthsNum > 0 ? categoryFromMonths(monthsNum) : null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = 'Informe o nome.';
    if (targetNum <= 0) errors.target = 'Meta > 0.';
    if (monthsNum <= 0) errors.months = 'Prazo > 0.';
    if (monthsNum > 480) errors.months = 'Máx 480.';
    if (form.startDate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(form.startDate)) {
      errors.startDate = 'Use AAAA-MM.';
    }
    if (availableNum < 0) errors.available = 'Negativo não.';
    if (rateDecimal < 0) errors.ratePercent = 'Negativo não.';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const payload: ObjetivoUpsertPayload = {
      name: form.name.trim(),
      target: targetNum,
      months: monthsNum,
      startDate: form.startDate || currentYearMonth(),
      available: availableNum,
      rate: rateDecimal,
      priority: form.priority,
      category: categoryFromMonths(monthsNum),
      status: form.status,
      notes: objetivo?.notes ?? null,
    };

    try {
      if (isEdit && objetivo) {
        const updated = await updateMutation.mutateAsync({
          id: objetivo.id,
          payload,
        });
        onSaved(updated.id);
      } else {
        const created = await createMutation.mutateAsync(payload);
        onSaved(created.id);
      }
    } catch (err) {
      logger.error('Erro ao salvar objetivo:', err);
      setSubmitError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  };

  const handleDelete = async () => {
    if (!objetivo) return;
    const ok = await confirm({
      desktopMessage: 'Excluir este objetivo e todo o histórico?',
      title: 'Excluir este objetivo?',
      message: 'Todo o histórico dele será apagado.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(objetivo.id);
      onDeleted?.();
    } catch (err) {
      logger.error('Erro ao excluir objetivo:', err);
      setSubmitError(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  if (isSheet) {
    return (
      <>
        <BottomSheet
          isOpen
          onClose={onCancel}
          title={isEdit ? 'Editar objetivo' : 'Novo objetivo'}
          className="h-[calc(100dvh-env(safe-area-inset-top)-12px)]"
          footer={
            <div className="flex flex-col gap-2">
              <p
                data-sonho-aporte-necessario=""
                className="flex items-center justify-between gap-2 px-1 text-sm text-gray-600 dark:text-gray-300"
              >
                <span>Aporte necessário</span>
                <strong className="tabular-nums text-gray-900 dark:text-white/90">
                  {targetNum > 0 && monthsNum > 0 ? `${formatBRL(aporteMensal)}/mês` : '—'}
                </strong>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="h-12 flex-1 rounded-xl border border-gray-300 text-base font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form={formId}
                  disabled={submitting}
                  aria-busy={submitting || undefined}
                  className="h-12 flex-1 rounded-xl bg-mf-patrimonio text-base font-semibold text-white disabled:opacity-70"
                >
                  {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar objetivo'}
                </button>
              </div>
            </div>
          }
        >
          <form
            id={formId}
            onSubmit={handleSubmit}
            noValidate
            data-sonho-form-sheet=""
            className="flex flex-col gap-3 pb-4"
          >
            {submitError ? (
              <p
                role="alert"
                className="rounded-xl border border-[#D92D20]/30 bg-[#D92D20]/5 px-3 py-2 text-sm text-[#D92D20] dark:border-[#F97066]/30 dark:bg-[#F97066]/10 dark:text-[#F97066]"
              >
                {submitError}
              </p>
            ) : null}
            {!isEdit && defaultsQuery.isLoading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">carregando defaults…</p>
            ) : null}

            <SheetTextField
              id={`${formId}-name`}
              label="Nome"
              value={form.name}
              onChange={(v) => update('name', v)}
              placeholder="Ex: Reserva, Viagem, Casa…"
              error={validationErrors.name}
            />
            <MobileNumberField
              id={`${formId}-target`}
              label="Meta"
              kind="currency"
              prefix="R$"
              value={form.target}
              onChange={(v) => update('target', v)}
              error={validationErrors.target}
            />
            <div className="grid grid-cols-2 gap-3">
              <MobileNumberField
                id={`${formId}-months`}
                label="Prazo"
                kind="integer"
                suffix="meses"
                value={form.months}
                onChange={(v) => update('months', v)}
                error={validationErrors.months}
                hint={categoria ? CATEGORY_LONG_LABELS[categoria] : undefined}
              />
              <SheetTextField
                id={`${formId}-start`}
                label="Início"
                type="month"
                value={form.startDate}
                onChange={(v) => update('startDate', v)}
                error={validationErrors.startDate}
              />
            </div>
            <MobileNumberField
              id={`${formId}-avail`}
              label="Saldo atual"
              kind="currency"
              prefix="R$"
              value={form.available}
              onChange={(v) => update('available', v)}
              error={validationErrors.available}
            />
            <MobileNumberField
              id={`${formId}-rate`}
              label="Rentab. ao mês"
              kind="percent"
              suffix="%"
              value={form.ratePercent}
              onChange={(v) => update('ratePercent', v)}
              error={validationErrors.ratePercent}
            />
            <SegmentedRadio
              id={`${formId}-priority`}
              label="Prioridade"
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onChange={(v) => update('priority', v as PlanejamentoPriority)}
            />
            <SegmentedRadio
              id={`${formId}-status`}
              label="Status"
              options={STATUS_OPTIONS}
              value={form.status}
              onChange={(v) => update('status', v as Status)}
              wrap
            />

            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="mt-3 h-12 w-full rounded-xl border border-[#D92D20]/40 text-base font-semibold text-[#D92D20] disabled:opacity-60 dark:border-[#F97066]/40 dark:text-[#F97066]"
              >
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir objetivo'}
              </button>
            ) : null}
          </form>
        </BottomSheet>
        {confirmSheet}
      </>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/30 p-4 dark:border-brand-700 dark:bg-brand-900/10"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
          {isEdit ? `Editar — ${objetivo!.name}` : 'Novo objetivo'}
        </h3>
        {!isEdit && defaultsQuery.isLoading ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">carregando defaults…</span>
        ) : null}
      </div>

      {submitError ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {submitError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 md:col-span-4">
          <Label htmlFor="inline-name">Nome</Label>
          <Input
            id="inline-name"
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Ex: Reserva, Viagem, Casa…"
            error={!!validationErrors.name}
            hint={validationErrors.name}
          />
        </div>

        <div>
          <Label htmlFor="inline-target">Meta (R$)</Label>
          <Input
            id="inline-target"
            type="number"
            value={form.target}
            onChange={(e) => update('target', e.target.value)}
            min="0"
            step="100"
            placeholder="25000"
            error={!!validationErrors.target}
            hint={validationErrors.target}
          />
        </div>

        <div>
          <Label htmlFor="inline-months">Prazo (meses)</Label>
          <Input
            id="inline-months"
            type="number"
            value={form.months}
            onChange={(e) => update('months', e.target.value)}
            min="1"
            max="480"
            step="1"
            placeholder="12"
            error={!!validationErrors.months}
            hint={validationErrors.months}
          />
        </div>

        <div>
          <Label htmlFor="inline-start">Início</Label>
          <Input
            id="inline-start"
            type="month"
            value={form.startDate}
            onChange={(e) => update('startDate', e.target.value)}
            error={!!validationErrors.startDate}
            hint={validationErrors.startDate}
          />
        </div>

        <div>
          <Label htmlFor="inline-avail">Saldo atual (R$)</Label>
          <Input
            id="inline-avail"
            type="number"
            value={form.available}
            onChange={(e) => update('available', e.target.value)}
            min="0"
            // step="any": o saldo é auto-preenchido com o patrimônio (valor com
            // centavos, ex.: 12345.67). Com step="100" isso vira stepMismatch e
            // o navegador BLOQUEIA o submit do form (onSubmit nunca dispara).
            step="any"
            placeholder="0"
            error={!!validationErrors.available}
            hint={validationErrors.available}
          />
        </div>

        <div>
          <Label htmlFor="inline-rate">Rentab. ao mês (%)</Label>
          <Input
            id="inline-rate"
            type="number"
            value={form.ratePercent}
            onChange={(e) => update('ratePercent', e.target.value)}
            min="0"
            max="10"
            step="0.01"
            placeholder="0.95"
            error={!!validationErrors.ratePercent}
            hint={validationErrors.ratePercent}
          />
        </div>

        <div>
          <Label htmlFor="inline-priority">Prioridade</Label>
          <Select
            options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
            value={form.priority}
            onChange={(v) => update('priority', v as PlanejamentoPriority)}
          />
        </div>

        <div>
          <Label htmlFor="inline-status">Status</Label>
          <Select
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
            value={form.status}
            onChange={(v) => update('status', v as Status)}
          />
        </div>
      </div>

      {/* Derivados + ações */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-200 pt-3 dark:border-brand-800">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
          {targetNum > 0 && monthsNum > 0 ? (
            <span>
              Aporte mensal:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {formatBRL(aporteMensal)}
              </strong>
            </span>
          ) : null}
          {categoria ? (
            <span>
              Categoria: <strong>{CATEGORY_LONG_LABELS[categoria]}</strong>
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onCancel} size="sm" variant="outline" type="button">
            Cancelar
          </Button>
          {isEdit ? (
            <Button
              onClick={handleDelete}
              size="sm"
              variant="outline"
              type="button"
              disabled={deleteMutation.isPending}
              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
            >
              {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
            </Button>
          ) : null}
          <Button size="sm" type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar objetivo'}
          </Button>
        </div>
      </div>
      {confirmSheet}
    </form>
  );
}

// ── Campos do sheet (celular) ─────────────────────────────────────────────

function SheetTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  type?: 'text' | 'month';
}) {
  const errorId = `${id}-erro`;
  return (
    <div>
      <label htmlFor={id} className={MOBILE_FIELD_LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // twMerge (acabamento fase 5): concatenar deixava border-gray-300 e a borda de erro
        // disputando no CSS — o campo Nome ficava sem a borda vermelha.
        className={twMerge(MOBILE_FIELD_CLASS, error && MOBILE_FIELD_ERROR_CLASS)}
      />
      {error ? (
        <p id={errorId} role="alert" className={MOBILE_FIELD_ERROR_TEXT_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Segmentado de escolha única (role=radiogroup) com os MESMOS valores do select do desktop. */
function SegmentedRadio({
  id,
  label,
  options,
  value,
  onChange,
  wrap = false,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  wrap?: boolean;
}) {
  const labelId = `${id}-rotulo`;
  return (
    <div>
      <p id={labelId} className={MOBILE_FIELD_LABEL_CLASS}>
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={
          wrap ? 'flex flex-wrap gap-2' : 'flex rounded-xl bg-gray-100 p-[3px] dark:bg-white/[0.06]'
        }
      >
        {options.map((opt) => {
          const checked = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(opt)}
              className={
                wrap
                  ? `inline-flex min-h-11 items-center rounded-xl border px-3.5 text-sm font-medium ${
                      checked
                        ? 'border-mf-patrimonio bg-mf-patrimonio text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade dark:text-gray-900'
                        : 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200'
                    }`
                  : `inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] px-2 text-sm font-medium ${
                      checked
                        ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-[#3A3F4A] dark:text-white'
                        : 'text-gray-600 dark:text-gray-400'
                    }`
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
