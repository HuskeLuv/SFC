'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4ReservaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
}: Step4FieldsProps) {
  return (
    <>
      <div>
        <DatePicker
          id="dataCompra"
          label="Data *"
          placeholder="Selecione a data"
          defaultDate={formData.dataCompra}
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange('dataCompra', selectedDates[0].toISOString().split('T')[0]);
            }
          }}
        />
        {errors.dataCompra && <p className="mt-1 text-sm text-red-500">{errors.dataCompra}</p>}
      </div>
      <div>
        <Label htmlFor="valorInvestido">Valor (R$) *</Label>
        <Input
          id="valorInvestido"
          {...decimalInputProps}
          placeholder="Ex: 10000.00"
          value={getDecimalInputValue('valorInvestido')}
          onChange={handleDecimalInputChange('valorInvestido')}
          error={!!errors.valorInvestido}
          hint={errors.valorInvestido}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="cotizacaoResgate">Cot. Resgate *</Label>
        <Input
          id="cotizacaoResgate"
          type="text"
          placeholder="Ex: D+0, D+1, D+30"
          value={formData.cotizacaoResgate}
          onChange={(e) => handleInputChange('cotizacaoResgate', e.target.value)}
          error={!!errors.cotizacaoResgate}
          hint={errors.cotizacaoResgate}
        />
      </div>
      <div>
        <Label htmlFor="liquidacaoResgate">Liq. Resgate *</Label>
        <Input
          id="liquidacaoResgate"
          type="text"
          placeholder="Ex: Imediata, D+1, D+2"
          value={formData.liquidacaoResgate}
          onChange={(e) => handleInputChange('liquidacaoResgate', e.target.value)}
          error={!!errors.liquidacaoResgate}
          hint={errors.liquidacaoResgate}
        />
      </div>
      <div>
        <DatePicker
          id="vencimento"
          label="Vencimento *"
          placeholder="Selecione a data"
          defaultDate={formData.vencimento}
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange('vencimento', selectedDates[0].toISOString().split('T')[0]);
            }
          }}
        />
        {errors.vencimento && <p className="mt-1 text-sm text-red-500">{errors.vencimento}</p>}
      </div>
      <div>
        <Label htmlFor="benchmark">Benchmark *</Label>
        <Input
          id="benchmark"
          type="text"
          placeholder="Ex: CDI, IPCA, Selic"
          value={formData.benchmark}
          onChange={(e) => handleInputChange('benchmark', e.target.value)}
          error={!!errors.benchmark}
          hint={errors.benchmark}
        />
      </div>
    </>
  );
}
