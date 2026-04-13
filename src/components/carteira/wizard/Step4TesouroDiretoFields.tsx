'use client';
import React, { useEffect, useState } from 'react';
import { RENDA_FIXA_INDEXADORES_POS } from '@/types/wizard';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

const TESOURO_DESTINO_OPTIONS = [
  { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
  { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
  { value: 'renda-fixa-prefixada', label: 'Renda Fixa (Pré-fixada)' },
  { value: 'renda-fixa-posfixada', label: 'Renda Fixa (Pós-fixada)' },
  { value: 'renda-fixa-hibrida', label: 'Renda Fixa (Híbrida)' },
];

interface TesouroPriceData {
  baseDate: string;
  buyRate: number | null;
  sellRate: number | null;
  buyPU: number | null;
  sellPU: number | null;
}

interface TesouroAssetData {
  name: string;
  bondType?: string;
  maturityDate?: string;
}

export default function Step4TesouroDiretoFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
  onFormDataChange,
}: Step4FieldsProps) {
  const [tesouroDetails, setTesouroDetails] = useState<{
    asset: TesouroAssetData;
    price: TesouroPriceData | null;
  } | null>(null);

  const isDbBacked = formData.assetId && formData.assetId !== 'TESOURO-MANUAL';

  // Fetch Tesouro details when a DB-backed asset is selected
  useEffect(() => {
    if (!isDbBacked) {
      setTesouroDetails(null);
      return;
    }

    const fetchDetails = async () => {
      try {
        const res = await fetch(
          `/api/tesouro-direto/details?assetId=${encodeURIComponent(formData.assetId)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
          setTesouroDetails(data);

          // Auto-fill maturity date and description
          if (data.asset?.maturityDate) {
            const maturity = data.asset.maturityDate.split('T')[0];
            onFormDataChange({
              dataVencimento: maturity,
              vencimento: maturity,
              descricao: data.asset.name || formData.descricao,
            });
          }

          // Auto-fill unit price with sellPU
          if (data.price?.sellPU) {
            onFormDataChange({ cotacaoUnitaria: data.price.sellPU });
          }

          // Auto-fill annual rate with sellRate (for prefixado)
          if (data.price?.sellRate) {
            onFormDataChange({ taxaJurosAnual: data.price.sellRate });
          }
        }
      } catch {
        // Silently fail — fields can still be filled manually
      }
    };

    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.assetId]);

  const tesouroDestino = formData.tesouroDestino;
  const tesouroEmReserva =
    tesouroDestino === 'reserva-emergencia' || tesouroDestino === 'reserva-oportunidade';
  const tesouroEmRendaFixa =
    tesouroDestino === 'renda-fixa-prefixada' ||
    tesouroDestino === 'renda-fixa-posfixada' ||
    tesouroDestino === 'renda-fixa-hibrida';
  const metodoCotasTesouro = formData.metodo === 'cotas' || formData.metodo === 'percentual';

  return (
    <>
      <div>
        <Label htmlFor="tesouroDestino">Onde este título deve aparecer *</Label>
        <Select
          id="tesouroDestino"
          options={TESOURO_DESTINO_OPTIONS}
          placeholder="Selecione onde exibir"
          value={formData.tesouroDestino ?? ''}
          onChange={(value) => handleInputChange('tesouroDestino', value)}
          className={errors.tesouroDestino ? 'border-red-500' : ''}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          O título será exibido na aba correspondente: Reserva de Emergência, Reserva de
          Oportunidade ou Renda Fixa.
        </p>
        {errors.tesouroDestino && (
          <p className="mt-1 text-sm text-red-500">{errors.tesouroDestino}</p>
        )}
      </div>

      {isDbBacked && tesouroDetails?.price && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Dados do Tesouro Transparente
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm text-blue-700 dark:text-blue-300">
            {tesouroDetails.price.sellPU && (
              <div>
                <span className="font-medium">PU Venda:</span>{' '}
                {`R$ ${tesouroDetails.price.sellPU.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`}
              </div>
            )}
            {tesouroDetails.price.sellRate !== null && (
              <div>
                <span className="font-medium">Taxa Venda:</span>{' '}
                {`${tesouroDetails.price.sellRate.toFixed(4)}% a.a.`}
              </div>
            )}
            {tesouroDetails.asset?.maturityDate && (
              <div>
                <span className="font-medium">Vencimento:</span>{' '}
                {new Date(tesouroDetails.asset.maturityDate).toLocaleDateString('pt-BR')}
              </div>
            )}
            <div>
              <span className="font-medium">Data base:</span>{' '}
              {new Date(tesouroDetails.price.baseDate).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>
      )}

      {tesouroEmReserva && (
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
            <Label htmlFor="valorInvestido">Valor (R$) *</Label>
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
          <div>
            <Label htmlFor="cotizacaoResgate">Cot. Resgate *</Label>
            <Input
              id="cotizacaoResgate"
              type="text"
              placeholder="Ex: D+0, D+1, D+30"
              value={formData.cotizacaoResgate}
              onChange={(e) => handleInputChange('cotizacaoResgate', e.target.value)}
              error={!!errors.cotizacaoResgate}
              hint={errors.cotizacaoResgate}
            />
          </div>
          <div>
            <Label htmlFor="liquidacaoResgate">Liq. Resgate *</Label>
            <Input
              id="liquidacaoResgate"
              type="text"
              placeholder="Ex: Imediata, D+1, D+2"
              value={formData.liquidacaoResgate}
              onChange={(e) => handleInputChange('liquidacaoResgate', e.target.value)}
              error={!!errors.liquidacaoResgate}
              hint={errors.liquidacaoResgate}
            />
          </div>
          <div>
            <DatePicker
              id="vencimento"
              label="Vencimento *"
              placeholder="Selecione a data"
              defaultDate={formData.vencimento}
              onChange={(selectedDates) => {
                if (selectedDates && selectedDates.length > 0) {
                  handleInputChange('vencimento', selectedDates[0].toISOString().split('T')[0]);
                }
              }}
            />
            {errors.vencimento && <p className="mt-1 text-sm text-red-500">{errors.vencimento}</p>}
          </div>
          <div>
            <Label htmlFor="benchmark">Benchmark *</Label>
            <Input
              id="benchmark"
              type="text"
              placeholder="Ex: CDI, IPCA, Selic"
              value={formData.benchmark}
              onChange={(e) => handleInputChange('benchmark', e.target.value)}
              error={!!errors.benchmark}
              hint={errors.benchmark}
            />
          </div>
        </>
      )}

      {tesouroEmRendaFixa && (
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
          {(tesouroDestino === 'renda-fixa-posfixada' ||
            tesouroDestino === 'renda-fixa-hibrida') && (
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
      )}
    </>
  );
}
