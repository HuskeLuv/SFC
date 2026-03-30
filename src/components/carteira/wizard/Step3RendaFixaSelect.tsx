'use client';
import React from 'react';
import {
  WizardFormData,
  WizardErrors,
  RENDA_FIXA_TIPOS,
  RENDA_FIXA_TIPOS_HIBRIDOS,
} from '@/types/wizard';

interface Step3RendaFixaSelectProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step3RendaFixaSelect({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step3RendaFixaSelectProps) {
  const rendaFixaTipos =
    formData.tipoAtivo === 'renda-fixa-hibrida' ? RENDA_FIXA_TIPOS_HIBRIDOS : RENDA_FIXA_TIPOS;
  const selectedRendaFixaType = rendaFixaTipos.find(
    (tipo) => tipo.value === formData.rendaFixaTipo,
  );
  const varianteVazia = !formData.rendaFixaVariante;
  const RENDA_FIXA_VARIANTES = [
    { value: 'pre' as const, label: 'Pré-fixada', desc: 'Taxa definida no momento da aplicação' },
    { value: 'pos' as const, label: 'Pós-fixada', desc: 'Rentabilidade atrelada a CDI ou IPCA' },
    { value: 'hib' as const, label: 'Híbrida', desc: 'Parte fixa + parte indexada' },
  ];

  const handleVarianteSelect = (variante: 'pre' | 'pos' | 'hib') => {
    onFormDataChange({
      rendaFixaVariante: variante,
      tipoAtivo:
        variante === 'pre'
          ? 'renda-fixa'
          : variante === 'pos'
            ? 'renda-fixa-posfixada'
            : 'renda-fixa-hibrida',
      rendaFixaTipo: '',
    });
    onErrorsChange({ rendaFixaTipo: undefined });
  };

  const handleRendaFixaSelect = (tipoValue: string) => {
    const tipos =
      formData.tipoAtivo === 'renda-fixa-hibrida' ? RENDA_FIXA_TIPOS_HIBRIDOS : RENDA_FIXA_TIPOS;
    const tipoSelecionado = tipos.find((tipo) => tipo.value === tipoValue);
    const label = tipoSelecionado?.label || 'Renda Fixa';
    const ativoLabel =
      formData.tipoAtivo === 'renda-fixa-posfixada'
        ? label.replace(/ Pré$/, '')
        : formData.tipoAtivo === 'renda-fixa-hibrida'
          ? label.replace(/ Híbrid[oa]$/, '')
          : label;
    onFormDataChange({
      rendaFixaTipo: tipoValue,
      ativo: ativoLabel,
      assetId: '',
    });
    if (errors.rendaFixaTipo) {
      onErrorsChange({ rendaFixaTipo: undefined });
    }
  };

  if (varianteVazia) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
              <span className="text-sm font-semibold">RF</span>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Renda Fixa</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Selecione o tipo de rentabilidade do título.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Tipo de rentabilidade *
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {RENDA_FIXA_VARIANTES.map((v) => {
              const baseClasses =
                'flex flex-col items-start rounded-lg border px-4 py-3 text-left text-sm transition-colors';
              const selectedClasses =
                'border-brand-500 bg-brand-500/10 text-brand-700 dark:border-brand-400 dark:bg-brand-400/10 dark:text-brand-200';
              const defaultClasses =
                'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-400 dark:hover:bg-gray-800';
              const cardClasses = `${baseClasses} ${formData.rendaFixaVariante === v.value ? selectedClasses : defaultClasses}`;
              return (
                <button
                  key={v.value}
                  type="button"
                  className={cardClasses}
                  onClick={() => handleVarianteSelect(v.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleVarianteSelect(v.value);
                    }
                  }}
                  aria-pressed={formData.rendaFixaVariante === v.value}
                  aria-label={`Selecionar ${v.label}`}
                >
                  <span className="font-medium">{v.label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{v.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
            <span className="text-sm font-semibold">RF</span>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {formData.tipoAtivo === 'renda-fixa'
                ? 'Renda Fixa Pré-Fixada'
                : formData.tipoAtivo === 'renda-fixa-hibrida'
                  ? 'Renda Fixa Híbrida'
                  : 'Renda Fixa Pós-Fixada'}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Escolha o tipo de título para continuar o cadastro.
            </p>
            <button
              type="button"
              className="mt-2 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline"
              onClick={() =>
                onFormDataChange({
                  rendaFixaVariante: '',
                  tipoAtivo: 'renda-fixa',
                  rendaFixaTipo: '',
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onFormDataChange({
                    rendaFixaVariante: '',
                    tipoAtivo: 'renda-fixa',
                    rendaFixaTipo: '',
                  });
                }
              }}
              aria-label="Alterar tipo de rentabilidade"
            >
              Alterar tipo de rentabilidade
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipos disponíveis *</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rendaFixaTipos.map((tipo) => {
            const isSelected = formData.rendaFixaTipo === tipo.value;
            const displayLabel =
              formData.tipoAtivo === 'renda-fixa-posfixada'
                ? tipo.label.replace(/ Pré$/, '')
                : formData.tipoAtivo === 'renda-fixa-hibrida'
                  ? tipo.label
                  : tipo.label;
            const baseClasses =
              'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors';
            const selectedClasses =
              'border-brand-500 bg-brand-500/10 text-brand-700 dark:border-brand-400 dark:bg-brand-400/10 dark:text-brand-200';
            const defaultClasses =
              'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-400 dark:hover:bg-gray-800';
            const cardClasses = `${baseClasses} ${isSelected ? selectedClasses : defaultClasses}`;

            return (
              <button
                key={tipo.value}
                type="button"
                className={cardClasses}
                onClick={() => handleRendaFixaSelect(tipo.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleRendaFixaSelect(tipo.value);
                  }
                }}
                aria-pressed={isSelected}
                aria-label={`Selecionar ${displayLabel}`}
              >
                <span className="font-medium">{displayLabel}</span>
                {isSelected && <span className="text-xs font-semibold">Selecionado</span>}
              </button>
            );
          })}
        </div>
        {errors.rendaFixaTipo && (
          <p className="mt-1 text-sm text-red-500">{errors.rendaFixaTipo}</p>
        )}
      </div>

      {selectedRendaFixaType && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Tipo selecionado
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">
            {formData.tipoAtivo === 'renda-fixa-posfixada'
              ? selectedRendaFixaType.label.replace(/ Pré$/, '')
              : formData.tipoAtivo === 'renda-fixa-hibrida'
                ? selectedRendaFixaType.label
                : selectedRendaFixaType.label}
          </p>
        </div>
      )}
    </div>
  );
}
