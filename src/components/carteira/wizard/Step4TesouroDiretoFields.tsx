'use client';
import React from 'react';
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

export default function Step4TesouroDiretoFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
}: Step4FieldsProps) {
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
