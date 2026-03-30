'use client';
import React from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { Step4FieldsProps } from './step4Types';

export default function Step4FundoDebenturePrevidenciaFields({
  formData,
  errors,
  handleInputChange,
  handleDecimalInputChange,
  getDecimalInputValue,
  parseDecimalValue,
  decimalInputProps,
  onFormDataChange,
}: Step4FieldsProps) {
  const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
  const totalCalculado = formData.quantidade * formData.cotacaoUnitaria;
  const TIPO_DEBENTURE_OPTIONS = [
    { value: 'prefixada', label: 'Pré-fixada' },
    { value: 'pos-fixada', label: 'Pós-fixada' },
    { value: 'hibrida', label: 'Híbrida' },
  ];

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

      {formData.tipoAtivo === 'debenture' && (
        <div>
          <Label htmlFor="tipoDebenture">Tipo de Debênture *</Label>
          <Select
            id="tipoDebenture"
            options={TIPO_DEBENTURE_OPTIONS}
            placeholder="Selecione o tipo (define em qual seção da aba Renda Fixa será exibida)"
            value={formData.tipoDebenture ?? ''}
            onChange={(value) => handleInputChange('tipoDebenture', value)}
            className={errors.tipoDebenture ? 'border-red-500' : ''}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            A debênture será exibida na seção correspondente: Pré-fixada, Pós-fixada ou Híbrida.
          </p>
          {errors.tipoDebenture && (
            <p className="mt-1 text-sm text-red-500">{errors.tipoDebenture}</p>
          )}
        </div>
      )}

      {formData.tipoAtivo === 'fundo' && (
        <div>
          <Label htmlFor="fundoDestino">Onde este fundo deve aparecer *</Label>
          <Select
            id="fundoDestino"
            options={[
              { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
              { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
              { value: 'renda-fixa', label: 'Renda Fixa' },
              { value: 'fim', label: 'FIM (Fundos de Investimento Multimercado)' },
              { value: 'fia', label: 'FIA (Fundo de Investimento em Ações)' },
            ]}
            placeholder="Selecione onde exibir"
            value={formData.fundoDestino ?? ''}
            onChange={(value) => {
              handleInputChange('fundoDestino', value);
              if (value === 'fim' || value === 'fia') {
                handleInputChange('tipoFundo', value);
              } else {
                onFormDataChange({
                  tipoFundo: undefined,
                  ...(value !== 'renda-fixa' && { fundoRendaFixaTipo: undefined }),
                });
              }
            }}
            className={errors.fundoDestino ? 'border-red-500' : ''}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            O fundo será exibido na aba correspondente: Renda Fixa, Reserva de Emergência, Reserva
            de Oportunidade ou FIM/FIA.
          </p>
          {errors.fundoDestino && (
            <p className="mt-1 text-sm text-red-500">{errors.fundoDestino}</p>
          )}
        </div>
      )}

      {formData.tipoAtivo === 'fundo' && formData.fundoDestino === 'renda-fixa' && (
        <div>
          <Label htmlFor="fundoRendaFixaTipo">Tipo de Renda Fixa *</Label>
          <Select
            id="fundoRendaFixaTipo"
            options={[
              { value: 'prefixada', label: 'Pré-fixada' },
              { value: 'pos-fixada', label: 'Pós-fixada' },
              { value: 'hibrida', label: 'Híbrida' },
            ]}
            placeholder="Selecione o tipo"
            value={formData.fundoRendaFixaTipo ?? ''}
            onChange={(value) => handleInputChange('fundoRendaFixaTipo', value)}
            className={errors.fundoRendaFixaTipo ? 'border-red-500' : ''}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            O fundo será exibido na seção correspondente da aba Renda Fixa.
          </p>
          {errors.fundoRendaFixaTipo && (
            <p className="mt-1 text-sm text-red-500">{errors.fundoRendaFixaTipo}</p>
          )}
        </div>
      )}

      <div className="mb-4">
        <Label>Escolha o tipo de adição *</Label>
        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name={`metodo-${formData.tipoAtivo}`}
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
              name={`metodo-${formData.tipoAtivo}`}
              value="cotas"
              checked={metodoCotas}
              onChange={() => handleInputChange('metodo', 'cotas')}
              className="mr-2"
            />
            Por preço de cota e quantidade
          </label>
        </div>
      </div>

      {formData.metodo === 'valor' || !metodoCotas ? (
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
            <Label htmlFor="cotacaoUnitaria">Preço da Cota (R$) *</Label>
            <Input
              id="cotacaoUnitaria"
              {...decimalInputProps}
              placeholder="Ex: 150.00"
              value={getDecimalInputValue('cotacaoUnitaria')}
              onChange={(e) => {
                handleDecimalInputChange('cotacaoUnitaria')(e);
                const qty = formData.quantidade || 0;
                const price = parseDecimalValue(e.target.value) ?? 0;
                if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
              }}
              error={!!errors.cotacaoUnitaria}
              hint={errors.cotacaoUnitaria}
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <Label htmlFor="quantidade">Quantidade de Cotas *</Label>
            <Input
              id="quantidade"
              {...decimalInputProps}
              placeholder="Ex: 100"
              value={getDecimalInputValue('quantidade')}
              onChange={(e) => {
                handleDecimalInputChange('quantidade')(e);
                const qty = parseDecimalValue(e.target.value) ?? 0;
                const price = formData.cotacaoUnitaria || 0;
                if (qty > 0 && price > 0) handleInputChange('valorInvestido', qty * price);
              }}
              error={!!errors.quantidade}
              hint={errors.quantidade}
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <Label htmlFor="totalInvestido">Total Investido (R$)</Label>
            <Input
              id="totalInvestido"
              type="text"
              placeholder="Calculado automaticamente"
              value={
                totalCalculado > 0
                  ? totalCalculado.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : ''
              }
              disabled
              className="bg-gray-50 dark:bg-gray-800"
            />
            <p className="mt-1 text-xs text-gray-500">
              Calculado automaticamente: Quantidade × Preço por Cota
            </p>
          </div>
        </>
      )}
    </>
  );
}
