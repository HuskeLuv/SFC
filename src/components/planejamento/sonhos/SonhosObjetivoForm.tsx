'use client';

import { useEffect, useMemo, useState } from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import TextArea from '@/components/form/input/TextArea';
import { logger } from '@/lib/logger';
import { addMonths, categoryFromMonths, pmt } from '@/services/planejamento/planejamentoSonhos';
import {
  useCreateObjetivo,
  useDeleteObjetivo,
  useUpdateObjetivo,
  type ObjetivoUpsertPayload,
  type PlanejamentoObjetivoDTO,
  type PlanejamentoCategory,
  type PlanejamentoPriority,
  type PlanejamentoStatus,
} from '@/hooks/usePlanejamentoSonhos';
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS, formatBRL } from './utils';

interface SonhosObjetivoFormProps {
  objetivo: PlanejamentoObjetivoDTO | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}

type FormState = {
  name: string;
  target: string;
  months: string;
  startDate: string;
  available: string;
  ratePercent: string; // rentabilidade ao mês em %
  priority: PlanejamentoPriority;
  category: PlanejamentoCategory;
  status: PlanejamentoStatus;
  notes: string;
};

function initialFormState(objetivo: PlanejamentoObjetivoDTO | null): FormState {
  if (!objetivo) {
    return {
      name: '',
      target: '',
      months: '',
      startDate: '',
      available: '0',
      ratePercent: '1',
      priority: 'Moderado',
      category: 'm',
      status: 'Em espera',
      notes: '',
    };
  }
  return {
    name: objetivo.name,
    target: String(objetivo.target),
    months: String(objetivo.months),
    startDate: objetivo.startDate ?? '',
    available: String(objetivo.available),
    ratePercent: (objetivo.rate * 100).toFixed(2),
    priority: objetivo.priority,
    category: objetivo.category,
    status: objetivo.status,
    notes: objetivo.notes ?? '',
  };
}

/**
 * Formulário CRUD de objetivo. 10 passos do HTML do Pedro mapeados em campos
 * TailAdmin (`Input`, `Select`, `TextArea`).
 *
 * Cálculos derivados:
 *  - Data de conclusão = startDate + months (read-only)
 *  - Aporte mensal sugerido = pmt(target, available, months, rate) (read-only)
 *  - Categoria é auto-sugerida ao mudar `months`, mas o user pode override.
 */
export default function SonhosObjetivoForm({
  objetivo,
  onCancel,
  onSaved,
  onDeleted,
}: SonhosObjetivoFormProps) {
  const [form, setForm] = useState<FormState>(() => initialFormState(objetivo));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const isEdit = !!objetivo;

  const createMutation = useCreateObjetivo();
  const updateMutation = useUpdateObjetivo();
  const deleteMutation = useDeleteObjetivo();
  const submitting = createMutation.isPending || updateMutation.isPending;

  // Tracking pra auto-sugerir categoria só enquanto user não tiver editado manualmente.
  const [categoryTouched, setCategoryTouched] = useState(isEdit);

  const monthsNum = Number(form.months) || 0;
  const targetNum = Number(form.target) || 0;
  const availableNum = Number(form.available) || 0;
  const rateDecimal = (Number(form.ratePercent) || 0) / 100;

  // Auto-sugere categoria conforme prazo (a menos que o user já tenha mexido).
  useEffect(() => {
    if (categoryTouched) return;
    if (monthsNum <= 0) return;
    const suggested = categoryFromMonths(monthsNum);
    setForm((f) => (f.category === suggested ? f : { ...f, category: suggested }));
  }, [monthsNum, categoryTouched]);

  const endDate = useMemo(() => {
    if (!form.startDate || monthsNum <= 0) return '';
    return addMonths(form.startDate, monthsNum);
  }, [form.startDate, monthsNum]);

  const aporteMensal = useMemo(() => {
    if (targetNum <= 0 || monthsNum <= 0) return 0;
    return pmt({
      target: targetNum,
      available: availableNum,
      months: monthsNum,
      rate: rateDecimal,
    });
  }, [targetNum, availableNum, monthsNum, rateDecimal]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'category') setCategoryTouched(true);
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = 'Informe o nome do objetivo.';
    if (targetNum <= 0) errors.target = 'Valor meta deve ser maior que zero.';
    if (monthsNum <= 0) errors.months = 'Prazo deve ser maior que zero.';
    if (monthsNum > 480) errors.months = 'Prazo máximo: 480 meses.';
    if (availableNum < 0) errors.available = 'Não pode ser negativo.';
    if (rateDecimal < 0) errors.ratePercent = 'Taxa não pode ser negativa.';
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
      startDate: form.startDate || null,
      available: availableNum,
      rate: rateDecimal,
      priority: form.priority,
      category: form.category,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    try {
      if (isEdit && objetivo) {
        const updated = await updateMutation.mutateAsync({ id: objetivo.id, payload });
        onSaved(updated.id);
      } else {
        const created = await createMutation.mutateAsync(payload);
        onSaved(created.id);
      }
    } catch (err) {
      logger.error('Erro ao salvar objetivo:', err);
      setSubmitError(err instanceof Error ? err.message : 'Erro ao salvar objetivo.');
    }
  };

  const handleDelete = async () => {
    if (!objetivo) return;
    if (!window.confirm('Excluir este objetivo e todo o histórico?')) return;
    try {
      await deleteMutation.mutateAsync(objetivo.id);
      onDeleted();
    } catch (err) {
      logger.error('Erro ao excluir objetivo:', err);
      setSubmitError(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  return (
    <ComponentCard title={isEdit ? `Editar — ${objetivo!.name}` : 'Novo Objetivo'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {submitError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="f-name">Passo 1 — Qual o seu objetivo?</Label>
            <Input
              id="f-name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Ex: Reserva de Emergência, Viagem, Casa..."
              error={!!validationErrors.name}
              hint={validationErrors.name}
            />
          </div>

          <div>
            <Label htmlFor="f-target">Passo 2 — Quanto custa? (R$)</Label>
            <Input
              id="f-target"
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
            <Label htmlFor="f-months">Passo 3 — Em quantos meses?</Label>
            <Input
              id="f-months"
              type="number"
              value={form.months}
              onChange={(e) => update('months', e.target.value)}
              min="1"
              max="480"
              step="1"
              placeholder="12, 24, 60, 360..."
              error={!!validationErrors.months}
              hint={validationErrors.months}
            />
          </div>

          <div>
            <Label htmlFor="f-start">Passo 4 — Data de início</Label>
            <Input
              id="f-start"
              type="month"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="f-end">Passo 5 — Data de conclusão (auto)</Label>
            <Input id="f-end" type="month" value={endDate} disabled />
          </div>

          <div>
            <Label htmlFor="f-avail">Passo 6 — Valor disponível hoje (R$)</Label>
            <Input
              id="f-avail"
              type="number"
              value={form.available}
              onChange={(e) => update('available', e.target.value)}
              min="0"
              step="100"
              error={!!validationErrors.available}
              hint={validationErrors.available}
            />
          </div>

          <div>
            <Label htmlFor="f-rate">Passo 7 — Rentabilidade ao mês (%)</Label>
            <Input
              id="f-rate"
              type="number"
              value={form.ratePercent}
              onChange={(e) => update('ratePercent', e.target.value)}
              min="0"
              max="5"
              step="0.1"
              error={!!validationErrors.ratePercent}
              hint={validationErrors.ratePercent}
            />
          </div>

          <div>
            <Label>Passo 8 — Aporte mensal necessário</Label>
            <div className="flex h-11 items-center rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              {targetNum > 0 && monthsNum > 0 ? formatBRL(aporteMensal) : '—'}
            </div>
          </div>

          <div>
            <Label htmlFor="f-priority">Passo 9 — Nível de prioridade</Label>
            <Select
              options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
              value={form.priority}
              onChange={(v) => update('priority', v as PlanejamentoPriority)}
            />
          </div>

          <div>
            <Label htmlFor="f-category">Categoria</Label>
            <Select
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(v) => update('category', v as PlanejamentoCategory)}
            />
          </div>

          <div>
            <Label htmlFor="f-status">Passo 10 — Status</Label>
            <Select
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
              value={form.status}
              onChange={(v) => update('status', v as PlanejamentoStatus)}
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="f-notes">Observações</Label>
            <TextArea
              value={form.notes}
              onChange={(v) => update('notes', v)}
              placeholder="Cortes no orçamento, renda extra, melhor rentabilidade..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
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
            {submitting ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar objetivo'}
          </Button>
        </div>
      </form>
    </ComponentCard>
  );
}
