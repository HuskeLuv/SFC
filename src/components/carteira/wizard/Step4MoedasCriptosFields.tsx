'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

interface Step4MoedasCriptosFieldsProps extends Step4FieldsProps {
  variant: 'criptoativo' | 'moeda';
}

export default function Step4MoedasCriptosFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  variant,
}: Step4MoedasCriptosFieldsProps) {
  if (variant === 'criptoativo') {
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
            {...decimalInputProps}
            placeholder="Ex: 0.5"
            value={getDecimalInputValue('quantidade')}
            onChange={handleDecimalInputChange('quantidade')}
            error={!!errors.quantidade}
            hint={errors.quantidade}
            min="0"
            step="0.00000001"
          />
        </div>
        <div>
          <Label htmlFor="cotacaoCompra">Cotacao de Compra (R$) *</Label>
          <Input
            id="cotacaoCompra"
            {...decimalInputProps}
            placeholder="Ex: 150000.00"
            value={getDecimalInputValue('cotacaoCompra')}
            onChange={handleDecimalInputChange('cotacaoCompra')}
            error={!!errors.cotacaoCompra}
            hint={errors.cotacaoCompra}
            min="0"
            step="0.01"
          />
        </div>
      </>
    );
  }

  // moeda
  return (
    <>
      <div>
        <Label htmlFor="moeda">Moeda *</Label>
        <Input
          id="moeda"
          type="text"
          placeholder="Selecionada no passo anterior"
          value={formData.ativo}
          disabled
          className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
        />
      </div>
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
        <Label htmlFor="quantidade">Quantidade de unidades *</Label>
        <Input
          id="quantidade"
          {...decimalInputProps}
          placeholder="Ex: 100 ou 100.50"
          value={getDecimalInputValue('quantidade')}
          onChange={handleDecimalInputChange('quantidade')}
          error={!!errors.quantidade}
          hint={errors.quantidade}
          min="0"
          step="0.01"
        />
        {errors.quantidade && <p className="mt-1 text-sm text-red-500">{errors.quantidade}</p>}
      </div>
      <div>
        <Label htmlFor="cotacaoCompra">Preco de aquisicao por unidade (R$) *</Label>
        <Input
          id="cotacaoCompra"
          {...decimalInputProps}
          placeholder="Ex: 5.20"
          value={getDecimalInputValue('cotacaoCompra')}
          onChange={handleDecimalInputChange('cotacaoCompra')}
          error={!!errors.cotacaoCompra}
          hint={errors.cotacaoCompra}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="valorInvestido">Valor do Investimento (R$) *</Label>
        <Input
          id="valorInvestido"
          type="text"
          placeholder="Calculado automaticamente"
          value={
            formData.quantidade > 0 && formData.cotacaoCompra > 0
              ? (formData.quantidade * formData.cotacaoCompra).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                })
              : ''
          }
          disabled
          className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
        />
      </div>
    </>
  );
}
