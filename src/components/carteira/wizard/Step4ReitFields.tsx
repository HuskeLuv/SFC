'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4ReitFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  parseDecimalValue,
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
        <Label htmlFor="estrategiaReit">Tipo de Investimento *</Label>
        <Select
          id="estrategiaReit"
          options={[
            { value: 'value', label: 'Value' },
            { value: 'growth', label: 'Growth' },
            { value: 'risk', label: 'Risk' },
          ]}
          placeholder="Selecione (define em qual seção da aba REIT será exibido)"
          value={formData.estrategiaReit ?? ''}
          onChange={(value) =>
            handleInputChange('estrategiaReit', value as 'value' | 'growth' | 'risk')
          }
          className={errors.estrategiaReit ? 'border-red-500' : ''}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          O REIT será exibido na seção correspondente: Value, Growth ou Risk.
        </p>
        {errors.estrategiaReit && (
          <p className="mt-1 text-sm text-red-500">{errors.estrategiaReit}</p>
        )}
      </div>
      <div>
        <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
        <Input
          id="quantidade"
          {...integerInputProps}
          placeholder="Ex: 100"
          value={getDecimalInputValue('quantidade')}
          onChange={(e) => {
            handleDecimalInputChange('quantidade')(e);
            const qty = parseDecimalValue(e.target.value) ?? 0;
            const price = formData.cotacaoUnitaria || 0;
            if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
          }}
          error={!!errors.quantidade}
          hint={errors.quantidade}
          min="0"
          step="1"
        />
      </div>
      <div>
        <Label htmlFor="cotacaoUnitaria">Preço da Cota (USD) *</Label>
        <Input
          id="cotacaoUnitaria"
          {...decimalInputProps}
          placeholder="Ex: 45.50"
          value={getDecimalInputValue('cotacaoUnitaria')}
          onChange={(e) => {
            handleDecimalInputChange('cotacaoUnitaria')(e);
            const qty = formData.quantidade || 0;
            const price = parseDecimalValue(e.target.value) ?? 0;
            if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
          }}
          error={!!errors.cotacaoUnitaria}
          hint={errors.cotacaoUnitaria}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="cotacaoMoeda">Cotação do dólar pago no câmbio (R$) *</Label>
        <Input
          id="cotacaoMoeda"
          {...decimalInputProps}
          placeholder="Ex: 5.20"
          value={getDecimalInputValue('cotacaoMoeda')}
          onChange={handleDecimalInputChange('cotacaoMoeda')}
          error={!!errors.cotacaoMoeda}
          hint={errors.cotacaoMoeda}
          min="0"
          step="0.01"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Informe a cotação do dólar que você pagou no câmbio no dia da compra.
        </p>
      </div>
      <div>
        <Label htmlFor="valorInvestido">Total Investido (USD)</Label>
        <Input
          id="valorInvestido"
          type="text"
          placeholder="Calculado automaticamente"
          value={
            formData.quantidade * formData.cotacaoUnitaria > 0
              ? (formData.quantidade * formData.cotacaoUnitaria).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) + ' USD'
              : ''
          }
          disabled
          className="bg-gray-50 dark:bg-gray-800"
        />
        <p className="mt-1 text-xs text-gray-500">
          Calculado automaticamente: Quantidade × Preço por Cota (USD)
        </p>
      </div>
    </>
  );
}
