'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4OpcoesFields({
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
        <Label htmlFor="opcao-ticker">Ticker do ativo base *</Label>
        <Input
          id="opcao-ticker"
          type="text"
          placeholder="Selecionado no passo anterior"
          value={formData.ativo}
          disabled
          className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
        />
      </div>
      <div>
        <Label htmlFor="opcaoTipo">Put ou Call *</Label>
        <Select
          id="opcaoTipo"
          options={[
            { value: 'put', label: 'Put' },
            { value: 'call', label: 'Call' },
          ]}
          placeholder="Selecione"
          value={formData.opcaoTipo ?? ''}
          onChange={(value) => handleInputChange('opcaoTipo', value)}
          className={errors.opcaoTipo ? 'border-red-500' : ''}
        />
        {errors.opcaoTipo && <p className="mt-1 text-sm text-red-500">{errors.opcaoTipo}</p>}
      </div>
      <div>
        <Label htmlFor="opcaoCompraVenda">Compra / Venda *</Label>
        <Select
          id="opcaoCompraVenda"
          options={[
            { value: 'compra', label: 'Compra' },
            { value: 'venda', label: 'Venda' },
          ]}
          placeholder="Selecione"
          value={formData.opcaoCompraVenda ?? ''}
          onChange={(value) => handleInputChange('opcaoCompraVenda', value)}
          className={errors.opcaoCompraVenda ? 'border-red-500' : ''}
        />
        {errors.opcaoCompraVenda && (
          <p className="mt-1 text-sm text-red-500">{errors.opcaoCompraVenda}</p>
        )}
      </div>
      <div>
        <DatePicker
          id="dataCompra"
          label="Data da Compra *"
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
        <DatePicker
          id="dataVencimento"
          label="Vencimento *"
          placeholder="Selecione a data"
          defaultDate={formData.dataVencimento}
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange('dataVencimento', selectedDates[0].toISOString().split('T')[0]);
            }
          }}
        />
        {errors.dataVencimento && (
          <p className="mt-1 text-sm text-red-500">{errors.dataVencimento}</p>
        )}
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
        <Label htmlFor="cotacaoUnitaria">Preço pago (R$) *</Label>
        <Input
          id="cotacaoUnitaria"
          {...decimalInputProps}
          placeholder="Ex: 2.50"
          value={getDecimalInputValue('cotacaoUnitaria')}
          onChange={handleDecimalInputChange('cotacaoUnitaria')}
          error={!!errors.cotacaoUnitaria}
          hint={errors.cotacaoUnitaria}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="taxaCorretagem">Corretagem + emolumentos (R$)</Label>
        <Input
          id="taxaCorretagem"
          {...decimalInputProps}
          placeholder="Ex: 5.00"
          value={getDecimalInputValue('taxaCorretagem')}
          onChange={handleDecimalInputChange('taxaCorretagem')}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="valorInvestido">Total (R$)</Label>
        <Input
          id="valorInvestido"
          type="text"
          placeholder="Calculado automaticamente"
          value={
            formData.quantidade * formData.cotacaoUnitaria + (formData.taxaCorretagem || 0) > 0
              ? (
                  formData.quantidade * formData.cotacaoUnitaria +
                  (formData.taxaCorretagem || 0)
                ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
              : ''
          }
          disabled
          className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-gray-500">Quantidade × Preço pago + Corretagem</p>
      </div>
    </>
  );
}
