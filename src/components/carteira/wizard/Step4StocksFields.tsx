'use client';
import React from 'react';
import { MOEDAS_FIXAS } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4StocksFields({
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
        <Label htmlFor="estrategia">Estratégia *</Label>
        <Select
          id="estrategia"
          options={[
            { value: 'value', label: 'Value' },
            { value: 'growth', label: 'Growth' },
            { value: 'risk', label: 'Risk' },
          ]}
          placeholder="Selecione (define em qual seção da aba Stocks será exibido)"
          value={formData.estrategia ?? ''}
          onChange={(value) => handleInputChange('estrategia', value)}
          className={errors.estrategia ? 'border-red-500' : ''}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          O stock será exibido na seção correspondente: Value, Growth ou Risk.
        </p>
        {errors.estrategia && <p className="mt-1 text-sm text-red-500">{errors.estrategia}</p>}
      </div>
      <div>
        <Label htmlFor="moeda">Moeda *</Label>
        <Select
          options={MOEDAS_FIXAS}
          placeholder="Selecione a moeda"
          defaultValue={formData.moeda}
          onChange={(value) => handleInputChange('moeda', value)}
          className={errors.moeda ? 'border-red-500' : ''}
        />
        {errors.moeda && <p className="mt-1 text-sm text-red-500">{errors.moeda}</p>}
      </div>
      <div>
        <Label htmlFor="cotacaoMoeda">Cotação do dólar no dia da compra (R$) *</Label>
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
      </div>
      <div>
        <Label htmlFor="quantidade">Quantidade *</Label>
        <Input
          id="quantidade"
          {...integerInputProps}
          placeholder="Ex: 10"
          value={getDecimalInputValue('quantidade')}
          onChange={handleDecimalInputChange('quantidade')}
          error={!!errors.quantidade}
          hint={errors.quantidade}
          min="0"
          step="1"
        />
      </div>
      <div>
        <Label htmlFor="cotacaoUnitaria">Preço por Ação (moeda selecionada) *</Label>
        <Input
          id="cotacaoUnitaria"
          {...decimalInputProps}
          placeholder="Ex: 120.50"
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
