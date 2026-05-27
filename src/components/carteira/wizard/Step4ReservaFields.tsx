'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { Step4FieldsProps } from './step4Types';

/** Benchmarks aceitos pela reserva. Restringimos a CDI/IPCA/PRE pois o pricer
 * de reserva em /api/carteira/operacao só sabe aplicar marcação na curva para
 * esses três (ver isManualReserva no route). Selic é mapeado pra CDI no backend. */
const RESERVA_BENCHMARK_OPTIONS = [
  { value: 'CDI', label: 'CDI' },
  { value: 'IPCA', label: 'IPCA' },
  { value: 'PRE', label: 'PRÉ-fixado' },
];

export default function Step4ReservaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  decimalInputProps,
}: Step4FieldsProps) {
  const benchmarkLabel =
    formData.benchmark === 'IPCA' ? 'IPCA' : formData.benchmark === 'PRE' ? 'PRÉ' : 'CDI';
  const percentualCDI = formData.percentualCDI || 0;

  return (
    <>
      {/* === Seção: Datas e valor === */}
      <BusinessDayDatePicker
        id="dataCompra"
        label="Data *"
        placeholder="Selecione a data"
        value={formData.dataCompra}
        onChange={(iso) => handleInputChange('dataCompra', iso)}
        error={errors.dataCompra}
      />
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

      {/* === Seção: Liquidez === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-3">Liquidez</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
      </div>

      {/* === Seção: Rentabilidade contratada (F1.8) === */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-1">
          Rentabilidade contratada *
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Informe quanto do indexador essa reserva rende.
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <div>
            <Label htmlFor="percentualCDI">% da rentabilidade</Label>
            <Input
              id="percentualCDI"
              {...decimalInputProps}
              placeholder="Ex: 112"
              value={getDecimalInputValue('percentualCDI')}
              onChange={handleDecimalInputChange('percentualCDI')}
              error={!!errors.percentualCDI}
              hint={errors.percentualCDI}
              min="0"
              step="0.01"
            />
          </div>
          <span className="pb-3 text-sm text-gray-700 dark:text-gray-300">do</span>
          <div>
            <Label htmlFor="benchmark">Indexador</Label>
            <Select
              id="benchmark"
              options={RESERVA_BENCHMARK_OPTIONS}
              placeholder="CDI"
              value={formData.benchmark || ''}
              onChange={(value) => handleInputChange('benchmark', value)}
              className={errors.benchmark ? 'border-red-500' : ''}
            />
          </div>
        </div>
        {errors.benchmark && <p className="mt-1 text-sm text-red-500">{errors.benchmark}</p>}
        {percentualCDI > 0 && formData.benchmark && (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Você receberá <strong>{percentualCDI}%</strong> do {benchmarkLabel} ao ano.
            {benchmarkLabel === 'CDI' && (
              <>
                {' '}
                Ex.: {percentualCDI}% do CDI significa que para cada R$ 100 de juros do CDI no
                período, você recebe R$ {percentualCDI.toFixed(2).replace('.', ',')}.
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}
