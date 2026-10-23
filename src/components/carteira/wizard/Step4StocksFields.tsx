'use client';
import React, { useEffect } from 'react';
import { MOEDA_ATIVO_EUA, MOEDA_ATIVO_EUA_LABEL } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { formatUSD } from '@/utils/format';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';
import { Step4FieldsProps } from './step4Types';
import { SecaoAtualNaCarteira } from '@/components/carteira/mover/SecaoAtualNaCarteira';

export default function Step4StocksFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  integerInputProps,
}: Step4FieldsProps) {
  // Carteira EUA em US$: stock é sempre em dólar (antes havia USD/EUR/GBP/CAD/AUD).
  useEffect(() => {
    if (formData.moeda !== MOEDA_ATIVO_EUA) handleInputChange('moeda', MOEDA_ATIVO_EUA);
  }, [formData.moeda, handleInputChange]);

  const totalUsd = (formData.quantidade || 0) * (formData.cotacaoUnitaria || 0);

  return (
    <>
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data de Compra *"
        placeholder="Selecione a data"
        value={formData.dataCompra}
        onChange={(iso) => handleInputChange('dataCompra', iso)}
        error={errors.dataCompra}
      />
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
        <SecaoAtualNaCarteira
          formData={formData}
          categoria="stocks"
          campo="estrategia"
          handleInputChange={handleInputChange}
        />
        {errors.estrategia && <p className="mt-1 text-sm text-red-500">{errors.estrategia}</p>}
      </div>
      <div>
        <Label htmlFor="moeda">Moeda</Label>
        <div
          id="moeda"
          data-moeda-fixa=""
          className="flex h-11 items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
        >
          <span>{MOEDA_ATIVO_EUA_LABEL}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">fixo</span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Stocks EUA são sempre registrados em dólar.
        </p>
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
        <Label htmlFor="cotacaoUnitaria">Preço por Ação (US$) *</Label>
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
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Fica em reais e não entra no preço médio em US$.
        </p>
      </div>
      <div>
        <Label htmlFor="totalInvestidoUsd">Total Investido (US$)</Label>
        <Input
          id="totalInvestidoUsd"
          type="text"
          placeholder="Calculado automaticamente"
          value={totalUsd > 0 ? formatUSD(totalUsd) : ''}
          disabled
          className="bg-gray-50 dark:bg-gray-800"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Calculado automaticamente: Quantidade × Preço por Ação (US$)
        </p>
      </div>
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}
