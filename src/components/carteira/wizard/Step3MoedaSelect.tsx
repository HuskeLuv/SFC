'use client';
import React, { useEffect, useState } from 'react';
import { WizardFormData, WizardErrors } from '@/types/wizard';
import Label from '@/components/form/Label';
import Select from '@/components/form/Select';

interface MoedaOption {
  value: string;
  label: string;
  symbol: string;
}

interface Step3MoedaSelectProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step3MoedaSelect({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step3MoedaSelectProps) {
  const [moedaOptions, setMoedaOptions] = useState<MoedaOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMoedas = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/carteira/moedas', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setMoedaOptions(data.moedas || []);
        }
      } catch (err) {
        console.error('Erro ao buscar moedas:', err);
        onErrorsChange({ ativo: 'Não foi possível carregar as moedas.' });
      } finally {
        setLoading(false);
      }
    };
    fetchMoedas();
  }, [onErrorsChange]);

  const handleMoedaChange = (value: string) => {
    const selected = moedaOptions.find((m) => m.value === value);
    onFormDataChange({
      assetId: value,
      ativo: selected?.label ?? '',
    });
    onErrorsChange({ ativo: undefined });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando moedas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:bg-brand-400/20 dark:text-brand-200">
            <span className="text-sm font-semibold">💱</span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Moedas disponíveis para cotação
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selecione a moeda que deseja adicionar. As cotações são atualizadas via Brapi.
            </p>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="moeda-select">Moeda *</Label>
        <Select
          options={moedaOptions}
          placeholder="Selecione a moeda"
          value={formData.assetId}
          onChange={handleMoedaChange}
          className={errors.ativo ? 'border-red-500' : ''}
        />
        {errors.ativo && <p className="mt-1 text-sm text-red-500">{errors.ativo}</p>}
      </div>

      {formData.assetId && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Moeda selecionada
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">{formData.ativo}</p>
        </div>
      )}
    </div>
  );
}
