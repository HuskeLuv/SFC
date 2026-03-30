'use client';
import React from 'react';
import { RENDA_FIXA_INDEXADORES_POS } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4RendaFixaFields({
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
          id="dataInicio"
          label="Data do Início *"
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
        <Label htmlFor="valorAplicado">Valor Aplicado (R$) *</Label>
        <Input
          id="valorAplicado"
          {...decimalInputProps}
          placeholder="Ex: 10000.00"
          value={getDecimalInputValue('valorAplicado')}
          onChange={handleDecimalInputChange('valorAplicado')}
          error={!!errors.valorAplicado}
          hint={errors.valorAplicado}
          min="0"
          step="0.01"
        />
      </div>
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
      {formData.tipoAtivo === 'renda-fixa-hibrida' && (
        <div>
          <Label htmlFor="taxaFixaAnual">Taxa Fixa Anual (%) *</Label>
          <Input
            id="taxaFixaAnual"
            {...decimalInputProps}
            placeholder="Ex: 6 (parte prefixada)"
            value={getDecimalInputValue('taxaFixaAnual')}
            onChange={handleDecimalInputChange('taxaFixaAnual')}
            error={!!errors.taxaFixaAnual}
            hint={errors.taxaFixaAnual}
            min="0"
            step="0.01"
          />
        </div>
      )}
      <div>
        <Label htmlFor="taxaJurosAnual">
          {formData.tipoAtivo === 'renda-fixa-posfixada'
            ? 'Taxa sobre o Indexador (%) *'
            : formData.tipoAtivo === 'renda-fixa-hibrida'
              ? 'Taxa sobre o Indexador (%) *'
              : 'Taxa de Juros Anual (%) *'}
        </Label>
        <Input
          id="taxaJurosAnual"
          {...decimalInputProps}
          placeholder={
            formData.tipoAtivo === 'renda-fixa-posfixada'
              ? 'Ex: 100 (100% CDI) ou 1.5 (CDI + 1.5%)'
              : formData.tipoAtivo === 'renda-fixa-hibrida'
                ? 'Ex: 100 (100% CDI) ou 5 (IPCA + 5%)'
                : 'Ex: 12.5'
          }
          value={getDecimalInputValue('taxaJurosAnual')}
          onChange={handleDecimalInputChange('taxaJurosAnual')}
          error={!!errors.taxaJurosAnual}
          hint={errors.taxaJurosAnual}
          min="0"
          step="0.01"
        />
      </div>
      {(formData.tipoAtivo === 'renda-fixa-posfixada' ||
        formData.tipoAtivo === 'renda-fixa-hibrida') && (
        <>
          <div>
            <Label htmlFor="rendaFixaIndexer">Indexador *</Label>
            <Select
              options={RENDA_FIXA_INDEXADORES_POS}
              placeholder="Selecione o indexador"
              defaultValue={formData.rendaFixaIndexer}
              onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
              className={errors.rendaFixaIndexer ? 'border-red-500' : ''}
            />
            {errors.rendaFixaIndexer && (
              <p className="mt-1 text-sm text-red-500">{errors.rendaFixaIndexer}</p>
            )}
          </div>
          <div>
            <Label htmlFor="rendaFixaIndexerPercent">% do Indexador</Label>
            <Input
              id="rendaFixaIndexerPercent"
              {...decimalInputProps}
              placeholder="Ex: 100 (100% do CDI)"
              value={getDecimalInputValue('rendaFixaIndexerPercent')}
              onChange={handleDecimalInputChange('rendaFixaIndexerPercent')}
              min="0"
              step="0.01"
            />
          </div>
        </>
      )}
      <div>
        <Label htmlFor="descricao">Descrição / Apelido *</Label>
        <Input
          id="descricao"
          type="text"
          placeholder="Ex: CDB Banco do Brasil 2026"
          value={formData.descricao}
          onChange={(e) => handleInputChange('descricao', e.target.value)}
          error={!!errors.descricao}
          hint={errors.descricao}
        />
      </div>

      <div className="hidden">
        <Label htmlFor="rendaFixaIndexer">Indexador</Label>
        <Select
          options={[
            { value: 'PRE', label: 'Pré' },
            { value: 'CDI', label: 'CDI' },
            { value: 'IPCA', label: 'IPCA' },
          ]}
          placeholder="Selecione o indexador"
          defaultValue={formData.tipoAtivo === 'renda-fixa' ? 'PRE' : formData.rendaFixaIndexer}
          onChange={(value) => handleInputChange('rendaFixaIndexer', value)}
        />
        <Label htmlFor="rendaFixaLiquidity">Liquidez</Label>
        <Select
          options={[
            { value: 'DAILY', label: 'Diária' },
            { value: 'MATURITY', label: 'No vencimento' },
          ]}
          placeholder="Selecione a liquidez"
          defaultValue={formData.rendaFixaLiquidity}
          onChange={(value) => handleInputChange('rendaFixaLiquidity', value)}
        />
        <div className="flex items-center gap-2">
          <input
            id="rendaFixaTaxExempt"
            type="checkbox"
            checked={!!formData.rendaFixaTaxExempt}
            onChange={(e) => handleInputChange('rendaFixaTaxExempt', e.target.checked)}
          />
          <Label htmlFor="rendaFixaTaxExempt">Isento de IR</Label>
        </div>
      </div>
    </>
  );
}
