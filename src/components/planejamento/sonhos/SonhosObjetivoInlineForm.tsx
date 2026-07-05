'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { logger } from '@/lib/logger';
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
}: SonhosObjetivoInlineFormProps) {
  const isEdit = !!objetivo;
  const [form, setForm] = useState<FormState>(() => initialFormState(objetivo));
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
    setForm((f) => ({
      ...f,
      available: f.available || (defaultsQuery.data!.available || 0).toFixed(2),
      ratePercent: f.ratePercent || (defaultsQuery.data!.rate * 100).toFixed(2),
    }));
    setDefaultsApplied(true);
  }, [defaultsQuery.data, isEdit, defaultsApplied]);

  const monthsNum = Number(form.months) || 0;
  const targetNum = Number(form.target) || 0;
  const availableNum = Number(form.available) || 0;
  const rateDecimal = (Number(form.ratePercent) || 0) / 100;

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
    if (!window.confirm('Excluir este objetivo e todo o histórico?')) return;
    try {
      await deleteMutation.mutateAsync(objetivo.id);
      onDeleted?.();
    } catch (err) {
      logger.error('Erro ao excluir objetivo:', err);
      setSubmitError(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

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
    </form>
  );
}
