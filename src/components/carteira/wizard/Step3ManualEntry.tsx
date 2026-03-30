'use client';
import React from 'react';
import { WizardFormData, WizardErrors } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';

interface Step3ManualEntryProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export function Step3ReservaEmergencia({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step3ManualEntryProps) {
  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.trim();
    onFormDataChange({
      ativo: e.target.value,
      assetId: valor ? 'RESERVA-EMERG' : '',
    });
    if (errors.ativo) onErrorsChange({ ativo: undefined });
  };
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Reserva de Emergência
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Digite o nome do ativo que está sendo adicionado. Esse nome será exibido na tabela da aba
          Reserva de Emergência.
        </p>
      </div>
      <div>
        <Label htmlFor="ativo-reserva-emergencia">Nome do ativo *</Label>
        <Input
          id="ativo-reserva-emergencia"
          type="text"
          placeholder="Ex: CDB XP 105% CDI, Tesouro Selic 2029"
          value={formData.ativo}
          onChange={handleNomeChange}
          error={!!errors.ativo}
          hint={errors.ativo}
          aria-label="Nome do ativo para reserva de emergência"
        />
      </div>
    </div>
  );
}

export function Step3ReservaOportunidade({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step3ManualEntryProps) {
  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.trim();
    onFormDataChange({
      ativo: e.target.value,
      assetId: valor ? 'RESERVA-OPORT' : '',
    });
    if (errors.ativo) onErrorsChange({ ativo: undefined });
  };
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Reserva de Oportunidade
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Digite o nome do ativo que está sendo adicionado. Esse nome será exibido na tabela da aba
          Reserva de Oportunidade.
        </p>
      </div>
      <div>
        <Label htmlFor="ativo-reserva-oportunidade">Nome do ativo *</Label>
        <Input
          id="ativo-reserva-oportunidade"
          type="text"
          placeholder="Ex: CDB XP 105% CDI, Tesouro Selic 2029"
          value={formData.ativo}
          onChange={handleNomeChange}
          error={!!errors.ativo}
          hint={errors.ativo}
          aria-label="Nome do ativo para reserva de oportunidade"
        />
      </div>
    </div>
  );
}

export function Step3Personalizado({ formData }: Pick<Step3ManualEntryProps, 'formData'>) {
  const nome = 'Personalizado';
  const descricao =
    'O ativo personalizado será criado com o nome que você informar. Continue para o próximo passo para preencher os dados do investimento.';

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{nome}</h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">{descricao}</p>
      </div>
      {formData.assetId && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Ativo Configurado
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
        </div>
      )}
    </div>
  );
}

interface Step3SimpleManualProps extends Step3ManualEntryProps {
  title: string;
  instructions: string[];
  inputLabel: string;
  inputPlaceholder: string;
  assetIdPrefix: string;
  confirmLabel: string;
  toUpperCase?: boolean;
}

export function Step3SimpleManual({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
  title,
  instructions,
  inputLabel,
  inputPlaceholder,
  assetIdPrefix,
  confirmLabel,
  toUpperCase,
}: Step3SimpleManualProps) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{title}</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-disc list-inside">
          {instructions.map((instruction, index) => (
            <li key={index}>{instruction}</li>
          ))}
        </ul>
      </div>
      <div>
        <Label htmlFor={`${assetIdPrefix.toLowerCase()}-nome`}>{inputLabel}</Label>
        <Input
          id={`${assetIdPrefix.toLowerCase()}-nome`}
          type="text"
          placeholder={inputPlaceholder}
          value={formData.ativo}
          onChange={(e) => {
            const value = e.target.value;
            const trimmed = toUpperCase ? value.trim().toUpperCase() : value.trim();
            onFormDataChange({
              ativo: value,
              assetId: trimmed ? `${assetIdPrefix}-MANUAL` : '',
            });
            if (errors.ativo) onErrorsChange({ ativo: undefined });
          }}
          error={!!errors.ativo}
        />
        {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
      </div>
      {formData.ativo && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            {confirmLabel}
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
        </div>
      )}
    </div>
  );
}
