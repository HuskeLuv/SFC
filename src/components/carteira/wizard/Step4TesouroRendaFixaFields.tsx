'use client';
import React from 'react';
import { RENDA_FIXA_INDEXADORES_POS } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4TesouroRendaFixaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
}: Step4FieldsProps) {
  const tesouroDestino = formData.tesouroDestino;
  const metodoCotasTesouro = formData.metodo === 'cotas' || formData.metodo === 'percentual';

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
      <div className="mb-4">
        <Label>Escolha o tipo de adição *</Label>
        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="metodo-tesouro"
              value="valor"
              checked={formData.metodo === 'valor'}
              onChange={() => handleInputChange('metodo', 'valor')}
              className="mr-2"
            />
            Por valor investido
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="metodo-tesouro"
              value="cotas"
              checked={metodoCotasTesouro}
              onChange={() => handleInputChange('metodo', 'cotas')}
              className="mr-2"
            />
            Por preço de cota e quantidade
          </label>
        </div>
      </div>
      {formData.metodo === 'valor' || !metodoCotasTesouro ? (
        <div>
          <Label htmlFor="valorInvestido">Valor Investido (R$) *</Label>
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
      ) : (
        <>
          <div>
            <Label htmlFor="quantidade">Quantidade de cotas *</Label>
            <Input
              id="quantidade"
              {...decimalInputProps}
              placeholder="Ex: 100"
              value={getDecimalInputValue('quantidade')}
              onChange={handleDecimalInputChange('quantidade')}
              error={!!errors.quantidade}
              hint={errors.quantidade}
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <Label htmlFor="cotacaoUnitaria">Preço da cota (R$) *</Label>
            <Input
              id="cotacaoUnitaria"
              {...decimalInputProps}
              placeholder="Ex: 100.00"
              value={getDecimalInputValue('cotacaoUnitaria')}
              onChange={handleDecimalInputChange('cotacaoUnitaria')}
              error={!!errors.cotacaoUnitaria}
              hint={errors.cotacaoUnitaria}
              min="0"
              step="0.01"
            />
          </div>
        </>
      )}
      <div>
        <DatePicker
          id="dataVencimento"
          label="Data de Vencimento *"
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
        <Label htmlFor="descricao">Descrição *</Label>
        <Input
          id="descricao"
          type="text"
          placeholder="Ex: Tesouro Selic 2029"
          value={formData.descricao}
          onChange={(e) => handleInputChange('descricao', e.target.value)}
          error={!!errors.descricao}
          hint={errors.descricao}
        />
      </div>
      {tesouroDestino === 'renda-fixa-prefixada' && (
        <div>
          <Label htmlFor="taxaJurosAnual">Taxa de juros anual (%) *</Label>
          <Input
            id="taxaJurosAnual"
            {...decimalInputProps}
            placeholder="Ex: 12.5"
            value={getDecimalInputValue('taxaJurosAnual')}
            onChange={handleDecimalInputChange('taxaJurosAnual')}
            error={!!errors.taxaJurosAnual}
            hint={errors.taxaJurosAnual}
            min="0"
            step="0.01"
          />
        </div>
      )}
      {(tesouroDestino === 'renda-fixa-posfixada' || tesouroDestino === 'renda-fixa-hibrida') && (
        <div>
          <Label htmlFor="rendaFixaIndexer">Indexador *</Label>
          <Select
            id="rendaFixaIndexer"
            options={RENDA_FIXA_INDEXADORES_POS}
            placeholder="Selecione (CDI ou IPCA)"
            value={formData.rendaFixaIndexer ?? ''}
            onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
            className={errors.rendaFixaIndexer ? 'border-red-500' : ''}
          />
          {errors.rendaFixaIndexer && (
            <p className="mt-1 text-sm text-red-500">{errors.rendaFixaIndexer}</p>
          )}
        </div>
      )}
    </>
  );
}
