'use client';
import React, { useState } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';
import { WizardErrors, WizardFormData } from '@/types/wizard';
import { parseDecimalValue, DECIMAL_INPUT_PROPS } from './step4Utils';

interface Step4AporteInfoProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step4AporteInfo({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4AporteInfoProps) {
  // Buffer de string do valor (mesmo padrão do Step4RedeemInfo/Step4AssetInfo):
  // input controlado por número + parseFloat descartava o separador decimal no
  // re-render — era impossível digitar centavos ("1013,29" virava 101329).
  const [valorAporteInput, setValorAporteInput] = useState<string | undefined>(undefined);

  const handleInputChange = (field: keyof WizardFormData, value: string | number) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof WizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
  };

  const valorAporteDisplay =
    valorAporteInput !== undefined
      ? valorAporteInput
      : formData.valorAporte > 0
        ? String(formData.valorAporte).replace('.', ',')
        : '';

  const handleValorAporteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setValorAporteInput(rawValue);
    if (!rawValue.trim()) {
      handleInputChange('valorAporte', 0);
      return;
    }
    const parsedValue = parseDecimalValue(rawValue);
    if (parsedValue === null) {
      return;
    }
    handleInputChange('valorAporte', parsedValue);
  };

  return (
    <div className="space-y-6">
      <BusinessDayDatePicker
        id="dataAporte"
        label="Data do Aporte *"
        placeholder="Selecione a data"
        value={formData.dataAporte}
        staticPosition={false}
        appendToBody
        onChange={(iso) => handleInputChange('dataAporte', iso)}
        error={errors.dataAporte}
      />

      <div>
        <Label htmlFor="valorAporte">Valor do Aporte (R$) *</Label>
        <Input
          id="valorAporte"
          {...DECIMAL_INPUT_PROPS}
          placeholder="Ex: 1.000,50"
          value={valorAporteDisplay}
          onChange={handleValorAporteChange}
          error={!!errors.valorAporte}
          hint={errors.valorAporte}
        />
      </div>
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => onFormDataChange({ isReinvestimento: value })}
      />
    </div>
  );
}
