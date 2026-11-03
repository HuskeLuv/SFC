'use client';
import React, { useEffect } from 'react';
import { MOEDA_ATIVO_EUA, MOEDA_ATIVO_EUA_LABEL } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { formatUSD } from '@/utils/format';
import { ETF_MANUAL_ASSET_ID } from '@/lib/ativoEmDolar';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import ReinvestimentoToggle from './shared/ReinvestimentoToggle';
import { Step4FieldsProps } from './step4Types';
import { SecaoAtualNaCarteira } from '@/components/carteira/mover/SecaoAtualNaCarteira';

/** Caixa de valor fixo (região/moeda do ETF americano), no mesmo visual do Stock EUA. */
function CampoFixo({ id, valor, ajuda }: { id: string; valor: string; ajuda: string }) {
  return (
    <>
      <div
        id={id}
        data-campo-fixo=""
        className="flex h-11 items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
      >
        <span>{valor}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">fixo</span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{ajuda}</p>
    </>
  );
}

/**
 * Passo 4 do ETF (nov/2026), em dois modos escolhidos pelo assetId:
 *  - ETF-MANUAL (ETF americano): região fixa EUA, moeda fixa US$, câmbio do dia, preço em US$ e
 *    corretagem em R$ fora do total em US$ — igual ao Stock EUA.
 *  - ETF do catálogo (B3): em R$, com a região livre. A região só decide a seção da aba, nunca a
 *    moeda: o IVVB11 na seção EUA continua em reais.
 */
export default function Step4EtfFields(props: Step4FieldsProps) {
  return props.formData.assetId === ETF_MANUAL_ASSET_ID ? (
    <EtfManualUsdFields {...props} />
  ) : (
    <EtfCatalogoFields {...props} />
  );
}

function EtfManualUsdFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  integerInputProps,
}: Step4FieldsProps) {
  // ETF americano é sempre em dólar e sempre na seção EUA.
  useEffect(() => {
    if (formData.moeda !== MOEDA_ATIVO_EUA) handleInputChange('moeda', MOEDA_ATIVO_EUA);
  }, [formData.moeda, handleInputChange]);
  useEffect(() => {
    if (formData.regiaoEtf !== 'estados_unidos') handleInputChange('regiaoEtf', 'estados_unidos');
  }, [formData.regiaoEtf, handleInputChange]);

  const totalUsd = (formData.quantidade || 0) * (formData.cotacaoUnitaria || 0);

  return (
    <>
      <div>
        <Label htmlFor="regiaoEtf">Região *</Label>
        <CampoFixo id="regiaoEtf" valor="EUA" ajuda="ETF americano sempre aparece na seção EUA." />
      </div>
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data de Compra *"
        placeholder="Selecione a data"
        value={formData.dataCompra}
        onChange={(iso) => handleInputChange('dataCompra', iso)}
        error={errors.dataCompra}
      />
      <div>
        <Label htmlFor="moeda">Moeda</Label>
        <CampoFixo
          id="moeda"
          valor={MOEDA_ATIVO_EUA_LABEL}
          ajuda="ETF americano é sempre registrado em dólar."
        />
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
        <Label htmlFor="cotacaoUnitaria">Preço por Cota (US$) *</Label>
        <Input
          id="cotacaoUnitaria"
          {...decimalInputProps}
          placeholder="Ex: 480.00"
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
          Calculado automaticamente: Quantidade × Preço por Cota (US$)
        </p>
      </div>
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}

function EtfCatalogoFields({
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
        <Label htmlFor="regiaoEtf">Região *</Label>
        <Select
          id="regiaoEtf"
          options={[
            { value: 'brasil', label: 'Brasil' },
            { value: 'estados_unidos', label: 'EUA' },
          ]}
          placeholder="Selecione a região do ETF"
          value={formData.regiaoEtf ?? ''}
          onChange={(value) => handleInputChange('regiaoEtf', value)}
          className={errors.regiaoEtf ? 'border-red-500' : ''}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Define em qual seção da aba ETF o ativo será exibido.
        </p>
        <SecaoAtualNaCarteira
          formData={formData}
          categoria="etfs"
          campo="regiaoEtf"
          handleInputChange={handleInputChange}
        />
        {errors.regiaoEtf && <p className="mt-1 text-sm text-red-500">{errors.regiaoEtf}</p>}
      </div>
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data de Compra *"
        placeholder="Selecione a data"
        value={formData.dataCompra}
        onChange={(iso) => handleInputChange('dataCompra', iso)}
        error={errors.dataCompra}
      />
      <div>
        <Label htmlFor="quantidade">Quantidade *</Label>
        <Input
          id="quantidade"
          {...integerInputProps}
          placeholder="Ex: 100"
          value={getDecimalInputValue('quantidade')}
          onChange={handleDecimalInputChange('quantidade')}
          error={!!errors.quantidade}
          hint={errors.quantidade}
          min="0"
          step="1"
        />
      </div>
      <div>
        <Label htmlFor="cotacaoUnitaria">Cotação Unitária (R$) *</Label>
        <Input
          id="cotacaoUnitaria"
          {...decimalInputProps}
          placeholder="Ex: 25.50"
          value={getDecimalInputValue('cotacaoUnitaria')}
          onChange={handleDecimalInputChange('cotacaoUnitaria')}
          error={!!errors.cotacaoUnitaria}
          hint={errors.cotacaoUnitaria}
          min="0"
          step="0.01"
        />
        {/* ETF da B3 na seção EUA (IVVB11): a região não muda a moeda. O ETF americano entra
            pelo modo manual do passo 3, em US$. */}
        {formData.regiaoEtf === 'estados_unidos' && !errors.cotacaoUnitaria && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            ETF da B3 (ex.: IVVB11) é negociado em reais, mesmo na seção EUA.
          </p>
        )}
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
      <ReinvestimentoToggle
        checked={!!formData.isReinvestimento}
        onChange={(value) => handleInputChange('isReinvestimento', value)}
      />
    </>
  );
}
