'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { WizardErrors, WizardFormData } from '@/types/wizard';

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
  const handleInputChange = (field: keyof WizardFormData, value: string | number) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof WizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
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
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          placeholder="Ex: 1000.00"
          value={formData.valorAporte}
          onChange={(e) => handleInputChange('valorAporte', parseFloat(e.target.value) || 0)}
          error={!!errors.valorAporte}
          hint={errors.valorAporte}
          min="0"
          step="0.01"
        />
      </div>
    </div>
  );
}
