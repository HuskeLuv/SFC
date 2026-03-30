'use client';
import React, { useEffect, useState } from 'react';
import { WizardFormData, WizardErrors } from '@/types/wizard';
import Label from '@/components/form/Label';
import { parseDecimalValue, DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from './step4Utils';
import { Step4FieldsProps } from './step4Types';
import Step4ReservaFields from './Step4ReservaFields';
import Step4ContaCorrentePoupancaFields from './Step4ContaCorrentePoupancaFields';
import Step4MoedasCriptosFields from './Step4MoedasCriptosFields';
import Step4PersonalizadoFields from './Step4PersonalizadoFields';
import Step4RendaFixaFields from './Step4RendaFixaFields';
import Step4TesouroDiretoFields from './Step4TesouroDiretoFields';
import Step4FundoDebenturePrevidenciaFields from './Step4FundoDebenturePrevidenciaFields';
import Step4FiiFields from './Step4FiiFields';
import Step4AcoesFields from './Step4AcoesFields';
import Step4ReitFields from './Step4ReitFields';
import Step4OpcoesFields from './Step4OpcoesFields';
import Step4StocksFields from './Step4StocksFields';
import Step4EtfFields from './Step4EtfFields';
import Step4DefaultFields from './Step4DefaultFields';

interface Step4AssetInfoProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step4AssetInfo({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4AssetInfoProps) {
  const [decimalInputValues, setDecimalInputValues] = useState<Record<string, string>>({});

  const handleInputChange = (field: keyof WizardFormData, value: string | number | boolean) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof WizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
  };

  const getDecimalInputValue = (field: keyof WizardFormData) => {
    const localValue = decimalInputValues[field];
    if (localValue !== undefined) {
      return localValue;
    }
    const numericValue = formData[field];
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) {
      return '';
    }
    return String(numericValue).replace('.', ',');
  };

  const handleDecimalInputChange =
    (field: keyof WizardFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      setDecimalInputValues((prev) => ({ ...prev, [field]: rawValue }));

      if (!rawValue.trim()) {
        handleInputChange(field, 0);
        return;
      }

      const parsedValue = parseDecimalValue(rawValue);
      if (parsedValue === null) {
        return;
      }
      handleInputChange(field, parsedValue);
    };

  // Calcular valor total automaticamente para alguns tipos
  useEffect(() => {
    if (formData.tipoAtivo === 'fii' && formData.quantidade > 0 && formData.cotacaoUnitaria > 0) {
      const valorCalculado =
        formData.quantidade * formData.cotacaoUnitaria + (formData.taxaCorretagem || 0);
      if (Math.abs(formData.valorInvestido - valorCalculado) > 0.01) {
        onFormDataChange({ valorInvestido: valorCalculado });
      }
    }
    const metodoCotas = formData.metodo === 'cotas' || formData.metodo === 'percentual';
    if (
      (formData.tipoAtivo === 'debenture' ||
        formData.tipoAtivo === 'fundo' ||
        formData.tipoAtivo === 'previdencia' ||
        formData.tipoAtivo === 'tesouro-direto') &&
      metodoCotas &&
      formData.quantidade > 0 &&
      formData.cotacaoUnitaria > 0
    ) {
      const valorCalculado = formData.quantidade * formData.cotacaoUnitaria;
      if (Math.abs(formData.valorInvestido - valorCalculado) > 0.01) {
        onFormDataChange({ valorInvestido: valorCalculado });
      }
    }
    if (formData.tipoAtivo === 'reit' && formData.quantidade > 0 && formData.cotacaoUnitaria > 0) {
      const valorCalculado = formData.quantidade * formData.cotacaoUnitaria;
      if (Math.abs(formData.valorInvestido - valorCalculado) > 0.01) {
        onFormDataChange({ valorInvestido: valorCalculado });
      }
    }
  }, [
    formData.quantidade,
    formData.cotacaoUnitaria,
    formData.taxaCorretagem,
    formData.tipoAtivo,
    formData.metodo,
    formData.valorInvestido,
    onFormDataChange,
  ]);

  const fieldProps: Step4FieldsProps = {
    formData,
    errors,
    handleInputChange,
    handleDecimalInputChange,
    getDecimalInputValue,
    parseDecimalValue,
    decimalInputProps: DECIMAL_INPUT_PROPS,
    integerInputProps: INTEGER_INPUT_PROPS,
    onFormDataChange,
  };

  const renderFieldsByAssetType = () => {
    switch (formData.tipoAtivo) {
      case 'reserva-emergencia':
      case 'reserva-oportunidade':
        return <Step4ReservaFields {...fieldProps} />;

      case 'conta-corrente':
        return <Step4ContaCorrentePoupancaFields {...fieldProps} variant="conta-corrente" />;

      case 'poupanca':
        return <Step4ContaCorrentePoupancaFields {...fieldProps} variant="poupanca" />;

      case 'criptoativo':
        return <Step4MoedasCriptosFields {...fieldProps} variant="criptoativo" />;

      case 'moeda':
        return <Step4MoedasCriptosFields {...fieldProps} variant="moeda" />;

      case 'personalizado':
        return <Step4PersonalizadoFields {...fieldProps} />;

      case 'renda-fixa':
      case 'renda-fixa-posfixada':
      case 'renda-fixa-hibrida':
        return <Step4RendaFixaFields {...fieldProps} />;

      case 'tesouro-direto':
        return <Step4TesouroDiretoFields {...fieldProps} />;

      case 'debenture':
      case 'fundo':
      case 'previdencia':
        return <Step4FundoDebenturePrevidenciaFields {...fieldProps} />;

      case 'fii':
        return <Step4FiiFields {...fieldProps} />;

      case 'acao':
      case 'acoes-brasil':
        return <Step4AcoesFields {...fieldProps} />;

      case 'reit':
        return <Step4ReitFields {...fieldProps} />;

      case 'opcoes':
        return <Step4OpcoesFields {...fieldProps} />;

      case 'stock':
        return <Step4StocksFields {...fieldProps} />;

      case 'etf':
        return <Step4EtfFields {...fieldProps} />;

      default:
        return <Step4DefaultFields {...fieldProps} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          📝 Informações do Investimento
        </h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Preencha os dados específicos para o tipo de ativo selecionado. Os campos marcados com *
          são obrigatórios.
        </p>
      </div>

      {renderFieldsByAssetType()}

      {/* Observações - sempre disponível */}
      <div>
        <Label htmlFor="observacoes">Observações</Label>
        <textarea
          id="observacoes"
          placeholder="Observações adicionais (opcional)"
          value={formData.observacoes}
          onChange={(e) => handleInputChange('observacoes', e.target.value)}
          className="h-24 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
        />
      </div>
    </div>
  );
}
