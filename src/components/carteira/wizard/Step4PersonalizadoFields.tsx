'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4PersonalizadoFields({
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
          id="dataInicio"
          label="Data de Inicio *"
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
        <Label htmlFor="nomePersonalizado">Nome do Ativo *</Label>
        <Input
          id="nomePersonalizado"
          type="text"
          placeholder="Ex: Minha Empresa LTDA"
          value={formData.nomePersonalizado}
          onChange={(e) => handleInputChange('nomePersonalizado', e.target.value)}
          error={!!errors.nomePersonalizado}
          hint={errors.nomePersonalizado}
        />
      </div>
      <div>
        <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
        <Input
          id="quantidade"
          {...integerInputProps}
          placeholder="Ex: 1000"
          value={getDecimalInputValue('quantidade')}
          onChange={handleDecimalInputChange('quantidade')}
          error={!!errors.quantidade}
          hint={errors.quantidade}
          min="0"
          step="1"
        />
      </div>
      <div>
        <Label htmlFor="precoUnitario">Preco Unitario (R$) *</Label>
        <Input
          id="precoUnitario"
          {...decimalInputProps}
          placeholder="Ex: 10.50"
          value={getDecimalInputValue('precoUnitario')}
          onChange={handleDecimalInputChange('precoUnitario')}
          error={!!errors.precoUnitario}
          hint={errors.precoUnitario}
          min="0"
          step="0.01"
        />
      </div>
      <div>
        <Label htmlFor="metodo">Metodo de Acompanhamento *</Label>
        <Select
          options={[
            {
              value: 'valor',
              label:
                'Por Valor Financeiro: A cada mes voce informa o valor atualizado do seu investimento',
            },
            {
              value: 'percentual',
              label:
                'Por Variacao Percentual: A cada mes, voce informa quantos % seu investimento rendeu',
            },
          ]}
          placeholder="Selecione o metodo"
          defaultValue={formData.metodo}
          onChange={(value) => handleInputChange('metodo', value)}
          className={errors.metodo ? 'border-red-500' : ''}
        />
        {errors.metodo && <p className="mt-1 text-sm text-red-500">{errors.metodo}</p>}
      </div>
    </>
  );
}
