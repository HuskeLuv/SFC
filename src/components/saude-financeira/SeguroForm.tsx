'use client';

import { useState } from 'react';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { logger } from '@/lib/logger';
import {
  useCreateSeguro,
  useUpdateSeguro,
  type SeguroDTO,
  type SeguroTipo,
  type SeguroCobertura,
  type SeguroRisco,
} from '@/hooks/useSeguros';
import { SEGURO_COBERTURA_LABELS, SEGURO_RISCO_LABELS, SEGURO_TIPO_LABELS } from './utils';

interface SeguroFormProps {
  seguro: SeguroDTO | null; // null = criar
  onCancel: () => void;
  onSaved: () => void;
}

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Form inline de criar/editar apólice (padrão DividaForm). */
export default function SeguroForm({ seguro, onCancel, onSaved }: SeguroFormProps) {
  const isEdit = seguro !== null;
  const [nome, setNome] = useState(seguro?.nome ?? '');
  const [tipo, setTipo] = useState<SeguroTipo>(seguro?.tipo ?? 'vida');
  const [cobertura, setCobertura] = useState<SeguroCobertura>(seguro?.cobertura ?? 'total');
  const [risco, setRisco] = useState<SeguroRisco>(seguro?.risco ?? 'medio');
  const [custoAnual, setCustoAnual] = useState(seguro?.custoAnual?.toString() ?? '');
  const [capitalSegurado, setCapitalSegurado] = useState(seguro?.capitalSegurado?.toString() ?? '');
  const [notes, setNotes] = useState(seguro?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const createSeguro = useCreateSeguro();
  const updateSeguro = useUpdateSeguro();
  const saving = createSeguro.isPending || updateSeguro.isPending;

  const handleSave = async () => {
    setError(null);
    if (!nome.trim()) {
      setError('Informe o nome do seguro.');
      return;
    }
    const custo = Number(custoAnual.replace(',', '.'));
    if (!Number.isFinite(custo) || custo < 0) {
      setError('Informe o custo anual (0 se não paga nada).');
      return;
    }
    const capital = capitalSegurado.trim() ? Number(capitalSegurado.replace(',', '.')) : null;

    const payload = {
      nome: nome.trim(),
      tipo,
      cobertura,
      risco,
      custoAnual: custo,
      capitalSegurado: capital,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit) {
        await updateSeguro.mutateAsync({ id: seguro.id, payload });
      } else {
        await createSeguro.mutateAsync(payload);
      }
      onSaved();
    } catch (err) {
      logger.error('Erro ao salvar seguro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar seguro.');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white/90">
        {isEdit ? `Editar — ${seguro.nome}` : 'Novo seguro'}
      </h4>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="seguro-nome">Nome</Label>
          <Input
            id="seguro-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Seguro de vida Porto"
          />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select
            options={toOptions(SEGURO_TIPO_LABELS)}
            defaultValue={tipo}
            onChange={(v) => setTipo(v as SeguroTipo)}
          />
        </div>
        <div>
          <Label>Cobertura</Label>
          <Select
            options={toOptions(SEGURO_COBERTURA_LABELS)}
            defaultValue={cobertura}
            onChange={(v) => setCobertura(v as SeguroCobertura)}
          />
        </div>
        <div>
          <Label>Risco de sinistro</Label>
          <Select
            options={toOptions(SEGURO_RISCO_LABELS)}
            defaultValue={risco}
            onChange={(v) => setRisco(v as SeguroRisco)}
          />
        </div>
        <div>
          <Label htmlFor="seguro-custo">Custo anual (R$)</Label>
          <Input
            id="seguro-custo"
            type="number"
            value={custoAnual}
            onChange={(e) => setCustoAnual(e.target.value)}
            placeholder="Ex.: 2400"
          />
        </div>
        <div>
          <Label htmlFor="seguro-capital">Capital segurado (R$, opcional)</Label>
          <Input
            id="seguro-capital"
            type="number"
            value={capitalSegurado}
            onChange={(e) => setCapitalSegurado(e.target.value)}
            placeholder="Ex.: 500000"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="seguro-notes">Observações (opcional)</Label>
          <Input
            id="seguro-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: cobre dependentes parcialmente"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar seguro'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
