'use client';
import React from 'react';
import { RENDA_FIXA_INDEXADORES_POS } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { Step4FieldsProps } from './step4Types';

export default function Step4RendaFixaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
}: Step4FieldsProps) {
  const isPre = formData.tipoAtivo === 'renda-fixa';
  const isPos = formData.tipoAtivo === 'renda-fixa-posfixada';
  const isHib = formData.tipoAtivo === 'renda-fixa-hibrida';

  const taxaLabel = isPre
    ? 'Taxa Pré (% ao ano) *'
    : isHib
      ? 'Taxa sobre o Indexador (%) *'
      : 'Taxa sobre o Indexador (%) *';

  const taxaPlaceholder = isPre
    ? 'Ex: 12.5'
    : isPos
      ? 'Ex: 100 (100% CDI) ou 110 (110% CDI)'
      : 'Ex: 100 (100% CDI) ou 5 (IPCA + 5%)';

  const taxaHint = isPre
    ? 'Taxa fixa anual paga até o vencimento.'
    : isPos
      ? 'Percentual do indexador que o título paga (ex.: 100 = 100% do CDI).'
      : 'Spread anual aplicado sobre o indexador escolhido abaixo.';

  return (
    <>
      {/* === Seção: Identificação === */}
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

      {/* === Seção: Datas (início + vencimento juntos) === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-3">
          Prazo do título
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* #4 (checklist mai/28): com dois pickers lado a lado, o calendar
              renderizado inline (staticPosition default) ficava cortado pela
              coluna vizinha. appendToBody={true} faz o flatpickr flutuar
              livre do grid. */}
          <BusinessDayDatePicker
            id="dataInicio"
            label="Data do Início *"
            placeholder="Selecione a data"
            value={formData.dataInicio}
            onChange={(iso) => handleInputChange('dataInicio', iso)}
            error={errors.dataInicio}
            staticPosition={false}
            appendToBody
          />
          <div>
            <DatePicker
              id="dataVencimento"
              label="Data de Vencimento *"
              placeholder="Selecione a data"
              defaultDate={formData.dataVencimento}
              staticPosition={false}
              appendToBody
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
        </div>
      </div>

      {/* === Seção: Valor aplicado === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
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

      {/* === Seção: Rentabilidade (indexador + taxa juntos) === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-3">
          Rentabilidade
        </h4>
        <div className="space-y-4">
          {(isPos || isHib) && (
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
          )}
          {isHib && (
            <div>
              <Label htmlFor="taxaFixaAnual">Taxa Fixa Anual (%) *</Label>
              <Input
                id="taxaFixaAnual"
                {...decimalInputProps}
                placeholder="Ex: 6 (parte prefixada)"
                value={getDecimalInputValue('taxaFixaAnual')}
                onChange={handleDecimalInputChange('taxaFixaAnual')}
                error={!!errors.taxaFixaAnual}
                hint={errors.taxaFixaAnual ?? 'Parte fixa adicional ao indexador.'}
                min="0"
                step="0.01"
              />
            </div>
          )}
          <div>
            <Label htmlFor="taxaJurosAnual">{taxaLabel}</Label>
            <Input
              id="taxaJurosAnual"
              {...decimalInputProps}
              placeholder={taxaPlaceholder}
              value={getDecimalInputValue('taxaJurosAnual')}
              onChange={handleDecimalInputChange('taxaJurosAnual')}
              error={!!errors.taxaJurosAnual}
              hint={errors.taxaJurosAnual ?? taxaHint}
              min="0"
              step="0.01"
            />
          </div>
        </div>
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
