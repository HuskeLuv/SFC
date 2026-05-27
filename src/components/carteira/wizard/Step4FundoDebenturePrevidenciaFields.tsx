'use client';
import React, { useEffect } from 'react';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import BusinessDayDatePicker from './shared/BusinessDayDatePicker';
import { Step4FieldsProps } from './step4Types';
import {
  fundoSubtipoFromAssetType,
  FUNDO_SUBTIPO_LABEL,
  type FundoSubtipo,
} from '@/lib/fundoTypes';

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
  const isCvmFund =
    formData.tipoAtivo === 'fundo' && formData.assetId && formData.assetId !== 'FUNDO-MANUAL';

  // Quando o ativo selecionado é um fundo classificado pela CVM (FIDC/FIP/etc),
  // resolvemos o subtipo automaticamente — o destino na aba "Fundos" deixa de
  // ser ambíguo e o dropdown vira info read-only.
  const autoSubtipo: FundoSubtipo | null = isCvmFund
    ? fundoSubtipoFromAssetType(formData.assetType)
    : null;

  // For CVM-backed funds, default to 'cotas' method to encourage quota-based entry
  useEffect(() => {
    if (!isCvmFund) return;

    if (formData.cotacaoUnitaria === 0) {
      onFormDataChange({ metodo: 'cotas' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.assetId]);

  // Auto-preencher fundoDestino e tipoFundo quando o Asset.type é classificado.
  useEffect(() => {
    if (!autoSubtipo) return;
    if (formData.fundoDestino === autoSubtipo && formData.tipoFundo === autoSubtipo) return;
    onFormDataChange({
      fundoDestino: autoSubtipo,
      tipoFundo: autoSubtipo,
      fundoRendaFixaTipo: undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubtipo]);

  const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
  const totalCalculado = formData.quantidade * formData.cotacaoUnitaria;
  const TIPO_DEBENTURE_OPTIONS = [
    { value: 'prefixada', label: 'Pré-fixada' },
    { value: 'pos-fixada', label: 'Pós-fixada' },
    { value: 'hibrida', label: 'Híbrida' },
  ];

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

      {formData.tipoAtivo === 'fundo' && autoSubtipo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Classificação CVM: <strong>{FUNDO_SUBTIPO_LABEL[autoSubtipo]}</strong>. Este fundo será
            exibido na seção {FUNDO_SUBTIPO_LABEL[autoSubtipo]} da aba Fundos e a cota será
            atualizada automaticamente.
          </p>
        </div>
      )}
      {formData.tipoAtivo === 'fundo' && !autoSubtipo && (
        <div>
          <Label htmlFor="fundoDestino">Onde este fundo deve aparecer *</Label>
          <Select
            id="fundoDestino"
            options={[
              { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
              { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
              { value: 'renda-fixa', label: 'Renda Fixa' },
              { value: 'fim', label: 'FIM (Fundo Multimercado)' },
              { value: 'fia', label: 'FIA (Fundo de Ações)' },
              { value: 'fip', label: 'FIP (Fundo de Participações)' },
              { value: 'fip-infra', label: 'FIP Infraestrutura (Lei 12.431)' },
              { value: 'fidc', label: 'FIDC (Direitos Creditórios)' },
              { value: 'fiagro', label: 'Fiagro' },
            ]}
            placeholder="Selecione onde exibir"
            value={formData.fundoDestino ?? ''}
            onChange={(value) => {
              handleInputChange('fundoDestino', value);
              const subtipos: string[] = ['fim', 'fia', 'fip', 'fip-infra', 'fidc', 'fiagro'];
              if (subtipos.includes(value)) {
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
            Para fundos manuais o destino é informado. Fundos vinculados à CVM têm o destino
            classificado automaticamente.
          </p>
          {errors.fundoDestino && (
            <p className="mt-1 text-sm text-red-500">{errors.fundoDestino}</p>
          )}
        </div>
      )}

      {isCvmFund && !autoSubtipo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Fundo vinculado ao cadastro CVM. O valor da cota será atualizado automaticamente via
            dados abertos da CVM.
          </p>
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
