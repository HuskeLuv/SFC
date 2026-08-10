'use client';
import React, { useEffect, useState } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { RedeemWizardErrors, RedeemWizardFormData } from '@/types/redeemWizard';
import { parseDecimalValue, DECIMAL_INPUT_PROPS } from '@/components/carteira/wizard/step4Utils';

interface Step4RedeemInfoProps {
  formData: RedeemWizardFormData;
  errors: RedeemWizardErrors;
  onFormDataChange: (data: Partial<RedeemWizardFormData>) => void;
  onErrorsChange: (errors: Partial<RedeemWizardErrors>) => void;
}

export default function Step4RedeemInfo({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4RedeemInfoProps) {
  // Estrito (=== 1): "Por valor" só existe para posições value-based (qty 1).
  // Posição fracionária (0,5 BTC) oferecia o método que o backend hoje rejeita
  // (e que antes DELETAVA a posição inteira — auditoria 2026-08-06, achado #2).
  const metodoOptions =
    formData.availableQuantity === 1
      ? [
          { value: 'quantidade', label: 'Por quantidade' },
          { value: 'valor', label: 'Por valor' },
        ]
      : [{ value: 'quantidade', label: 'Por quantidade' }];

  // Buffer de string dos campos numéricos (mesmo padrão do Step4AssetInfo do
  // aporte): input controlado por número + parseFloat descartava o separador
  // decimal no re-render — digitar "0,5" registrava 5, colar "1.500,50"
  // registrava 1,50 (auditoria 2026-08-06, achado #4).
  const [decimalInputValues, setDecimalInputValues] = useState<Record<string, string>>({});

  // Rodada 3 (achado frontend #4/#16): o wizard desabilita o Avançar via
  // isValid mas nunca preenchia errors.* — os hints por campo eram código
  // morto e o botão desabilitava sem explicação. As mensagens nascem aqui e
  // espelham as mesmas regras do validateStep4 do wizard (e do backend).
  useEffect(() => {
    const stepErrors: Partial<RedeemWizardErrors> = {
      dataResgate: formData.dataResgate ? undefined : 'Informe a data do resgate.',
      quantidade: undefined,
      cotacaoUnitaria: undefined,
      valorResgate: undefined,
    };
    if (formData.metodoResgate === 'quantidade') {
      if (formData.quantidade <= 0) {
        stepErrors.quantidade = 'Informe uma quantidade maior que zero.';
      } else if (formData.quantidade > formData.availableQuantity) {
        stepErrors.quantidade = `Quantidade maior que a disponível (${formData.availableQuantity.toLocaleString('pt-BR')}).`;
      }
      if (formData.cotacaoUnitaria <= 0) {
        stepErrors.cotacaoUnitaria = 'Informe uma cotação maior que zero.';
      }
    } else if (formData.valorResgate <= 0) {
      stepErrors.valorResgate = 'Informe um valor maior que zero.';
    }
    onErrorsChange(stepErrors);
  }, [
    formData.dataResgate,
    formData.metodoResgate,
    formData.quantidade,
    formData.cotacaoUnitaria,
    formData.valorResgate,
    formData.availableQuantity,
    onErrorsChange,
  ]);

  const handleInputChange = (field: keyof RedeemWizardFormData, value: string | number) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof RedeemWizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
  };

  const getDecimalInputValue = (field: 'quantidade' | 'cotacaoUnitaria' | 'valorResgate') => {
    const localValue = decimalInputValues[field];
    if (localValue !== undefined) {
      return localValue;
    }
    const numericValue = formData[field];
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue) || numericValue === 0) {
      return '';
    }
    return String(numericValue).replace('.', ',');
  };

  const handleDecimalInputChange =
    (field: 'quantidade' | 'cotacaoUnitaria' | 'valorResgate') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      setDecimalInputValues((prev) => ({ ...prev, [field]: rawValue }));

      if (!rawValue.trim()) {
        handleInputChange(field, 0);
        return;
      }
      const parsedValue = parseDecimalValue(rawValue);
      if (parsedValue === null) {
        return;
      }
      handleInputChange(field, parsedValue);
    };

  const handleMetodoChange = (value: string) => {
    setDecimalInputValues({});
    onFormDataChange({
      metodoResgate: value as RedeemWizardFormData['metodoResgate'],
      quantidade: 0,
      cotacaoUnitaria: 0,
      valorResgate: 0,
    });
    if (errors.metodoResgate) {
      onErrorsChange({ metodoResgate: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <DatePicker
          id="dataResgate"
          label="Data do Resgate *"
          placeholder="Selecione a data"
          defaultDate={formData.dataResgate}
          staticPosition={false}
          appendToBody
          maxDate="today"
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange('dataResgate', selectedDates[0].toISOString().split('T')[0]);
            }
          }}
        />
        {errors.dataResgate && <p className="mt-1 text-sm text-red-500">{errors.dataResgate}</p>}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <p>Quantidade disponível: {formData.availableQuantity ?? 0}</p>
        <p>
          {/* rótulo honesto: é o CUSTO (totalInvested), não o valor de mercado —
              resgate com rendimento pode (e deve poder) exceder este número */}
          Valor investido:{' '}
          {(formData.availableTotal ?? 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: formData.moeda || 'BRL',
          })}
        </p>
      </div>

      <div>
        <Label htmlFor="metodoResgate">Método de Resgate *</Label>
        <Select
          options={metodoOptions}
          placeholder="Selecione o método"
          defaultValue={formData.metodoResgate}
          onChange={handleMetodoChange}
          className={errors.metodoResgate ? 'border-red-500' : ''}
        />
        {errors.metodoResgate && (
          <p className="mt-1 text-sm text-red-500">{errors.metodoResgate}</p>
        )}
      </div>

      {formData.metodoResgate === 'quantidade' ? (
        <>
          <div>
            <Label htmlFor="quantidade">Quantidade a resgatar *</Label>
            <Input
              id="quantidade"
              {...DECIMAL_INPUT_PROPS}
              placeholder="Ex: 10 ou 0,5"
              value={getDecimalInputValue('quantidade')}
              onChange={handleDecimalInputChange('quantidade')}
              error={!!errors.quantidade}
              hint={errors.quantidade}
            />
          </div>
          <div>
            <Label htmlFor="cotacaoUnitaria">
              Cotação unitária ({formData.moeda === 'USD' ? 'US$' : 'R$'}) *
            </Label>
            <Input
              id="cotacaoUnitaria"
              {...DECIMAL_INPUT_PROPS}
              placeholder="Ex: 32,50"
              value={getDecimalInputValue('cotacaoUnitaria')}
              onChange={handleDecimalInputChange('cotacaoUnitaria')}
              error={!!errors.cotacaoUnitaria}
              hint={errors.cotacaoUnitaria}
            />
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="valorResgate">
            Valor do resgate ({formData.moeda === 'USD' ? 'US$' : 'R$'}) *
          </Label>
          <Input
            id="valorResgate"
            {...DECIMAL_INPUT_PROPS}
            placeholder="Ex: 1.000,00"
            value={getDecimalInputValue('valorResgate')}
            onChange={handleDecimalInputChange('valorResgate')}
            error={!!errors.valorResgate}
            hint={errors.valorResgate}
          />
        </div>
      )}
    </div>
  );
}
