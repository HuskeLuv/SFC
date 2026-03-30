'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

interface Step4ContaCorrentePoupancaFieldsProps extends Step4FieldsProps {
  variant: 'conta-corrente' | 'poupanca';
}

export default function Step4ContaCorrentePoupancaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  variant,
}: Step4ContaCorrentePoupancaFieldsProps) {
  const label = variant === 'conta-corrente' ? 'Banco' : 'Banco';
  const idPrefix = variant === 'conta-corrente' ? 'instituicao-conta' : 'instituicao-poupanca';

  return (
    <>
      <div>
        <Label htmlFor={idPrefix}>{label} *</Label>
        <Input
          id={idPrefix}
          type="text"
          placeholder="Selecionado no passo anterior"
          value={formData.instituicao}
          disabled
          className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
        />
      </div>
      <div>
        <DatePicker
          id="dataInicio"
          label="Data *"
          placeholder="Selecione a data"
          defaultDate={formData.dataInicio}
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange('dataInicio', selectedDates[0].toISOString().split('T')[0]);
            }
          }}
        />
        {errors.dataInicio && <p className="mt-1 text-sm text-red-500">{errors.dataInicio}</p>}
      </div>
      <div>
        <Label htmlFor="valorAplicado">Valor (R$) *</Label>
        <Input
          id="valorAplicado"
          {...decimalInputProps}
          placeholder={variant === 'poupanca' ? 'Ex: 5000.00' : 'Ex: 10000.00'}
          value={getDecimalInputValue('valorAplicado')}
          onChange={handleDecimalInputChange('valorAplicado')}
          error={!!errors.valorAplicado}
          hint={errors.valorAplicado}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="contaCorrenteDestino">Onde este valor deve aparecer *</Label>
        <Select
          id="contaCorrenteDestino"
          options={[
            { value: 'reserva-emergencia', label: 'Reserva de Emergencia' },
            { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
          ]}
          placeholder="Selecione onde exibir"
          value={formData.contaCorrenteDestino ?? ''}
          onChange={(value) => handleInputChange('contaCorrenteDestino', value)}
          className={errors.contaCorrenteDestino ? 'border-red-500' : ''}
        />
        {errors.contaCorrenteDestino && (
          <p className="mt-1 text-sm text-red-500">{errors.contaCorrenteDestino}</p>
        )}
      </div>
    </>
  );
}
