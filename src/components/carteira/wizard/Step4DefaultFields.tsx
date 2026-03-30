'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4DefaultFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  integerInputProps,
}: Step4FieldsProps) {
  return (
    <>
      <div>
        <DatePicker
          id="dataCompra"
          label="Data de Compra *"
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
        <Label htmlFor="quantidade">Quantidade *</Label>
        <Input
          id="quantidade"
          {...integerInputProps}
          placeholder="Ex: 100"
          value={getDecimalInputValue('quantidade')}
          onChange={handleDecimalInputChange('quantidade')}
          error={!!errors.quantidade}
          hint={errors.quantidade}
          min="0"
          step="1"
        />
      </div>
      <div>
        <Label htmlFor="cotacaoUnitaria">Cotação Unitária (R$) *</Label>
        <Input
          id="cotacaoUnitaria"
          {...decimalInputProps}
          placeholder="Ex: 25.50"
          value={getDecimalInputValue('cotacaoUnitaria')}
          onChange={handleDecimalInputChange('cotacaoUnitaria')}
          error={!!errors.cotacaoUnitaria}
          hint={errors.cotacaoUnitaria}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="taxaCorretagem">Taxa de Corretagem (R$)</Label>
        <Input
          id="taxaCorretagem"
          {...decimalInputProps}
          placeholder="Ex: 2.50"
          value={getDecimalInputValue('taxaCorretagem')}
          onChange={handleDecimalInputChange('taxaCorretagem')}
          min="0"
          step="0.01"
        />
      </div>
    </>
  );
}
