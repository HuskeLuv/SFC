'use client';
import React from 'react';
import Label from '@/components/form/Label';
import { useObjetivos } from '@/hooks/usePlanejamentoSonhos';
import { WizardFormData } from '@/types/wizard';

interface PlanejamentoVinculoFieldProps {
  formData: WizardFormData;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
}

/**
 * Checkbox "faz parte de um planejamento" + dropdown (Aposentadoria | sonhos).
 * O vínculo é persistido no Portfolio do ativo e herdado por todos os aportes:
 * - sonho → o aporte vira o realizado automático da linha-espelho no fluxo de
 *   caixa (sai do Aporte/Resgate, evitando dupla contagem);
 * - aposentadoria → alimenta o acompanhamento mensal e o aporte automático do
 *   simulador.
 */
export default function PlanejamentoVinculoField({
  formData,
  onFormDataChange,
}: PlanejamentoVinculoFieldProps) {
  const { objetivos } = useObjetivos();
  const sonhosDisponiveis = (objetivos ?? []).filter((o) => o.status !== 'Concluído');

  const checked = !!formData.vinculoTipo;
  const selectValue =
    formData.vinculoTipo === 'aposentadoria'
      ? 'aposentadoria'
      : formData.vinculoTipo === 'sonho' && formData.vinculoObjetivoId
        ? `sonho:${formData.vinculoObjetivoId}`
        : '';

  const handleToggle = (value: boolean) => {
    if (value) {
      // Liga com aposentadoria pré-selecionada (opção sempre disponível).
      onFormDataChange({ vinculoTipo: 'aposentadoria', vinculoObjetivoId: null });
    } else {
      onFormDataChange({ vinculoTipo: null, vinculoObjetivoId: null });
    }
  };

  const handleSelect = (value: string) => {
    if (value === 'aposentadoria') {
      onFormDataChange({ vinculoTipo: 'aposentadoria', vinculoObjetivoId: null });
    } else if (value.startsWith('sonho:')) {
      onFormDataChange({ vinculoTipo: 'sonho', vinculoObjetivoId: value.slice('sonho:'.length) });
    } else {
      onFormDataChange({ vinculoTipo: null, vinculoObjetivoId: null });
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/40 dark:bg-blue-900/20">
      <div className="flex items-start gap-2">
        <input
          id="vinculoPlanejamento"
          type="checkbox"
          checked={checked}
          onChange={(e) => handleToggle(e.target.checked)}
          className="mt-1"
        />
        <div className="flex-1">
          <Label htmlFor="vinculoPlanejamento" className="text-blue-900 dark:text-blue-100">
            Este ativo faz parte de um planejamento?
          </Label>
          <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-200/80">
            Os aportes deste ativo passam a alimentar automaticamente o plano escolhido. Para
            sonhos, o valor vira o realizado da linha no Fluxo de Caixa (e sai do bloco
            Aporte/Resgate).
          </p>
          {checked && (
            <select
              value={selectValue}
              onChange={(e) => handleSelect(e.target.value)}
              aria-label="Planejamento vinculado"
              className="mt-2 w-full rounded-md border border-blue-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-brand-400 focus:outline-none dark:border-blue-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="aposentadoria">Aposentadoria</option>
              {sonhosDisponiveis.map((sonho) => (
                <option key={sonho.id} value={`sonho:${sonho.id}`}>
                  Sonho: {sonho.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
