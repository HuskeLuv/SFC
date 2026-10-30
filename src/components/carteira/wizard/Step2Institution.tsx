'use client';
import React from 'react';
import { WizardFormData, WizardErrors, ehTipoAtivoRendaFixa } from '@/types/wizard';
import { rotuloCnpj } from '@/lib/instituicoes/cnpj';
import InstitutionPicker from './shared/InstitutionPicker';

interface Step2InstitutionProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step2Institution({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step2InstitutionProps) {
  return (
    <InstitutionPicker
      endpoint="/api/institutions"
      responseShape="institutions"
      selectedId={formData.instituicaoId}
      selectedName={formData.instituicao}
      label={
        ehTipoAtivoRendaFixa(formData.tipoAtivo)
          ? 'Corretora ou banco onde você investe *'
          : undefined
      }
      // O tipo do Bacen (corretora N2 avisa no emissor) e o CNPJ seguem para o banco emissor
      // pré-preenchido da renda fixa (ClickUp 86e2xqh69).
      onChange={({ id, nome, cnpj, cnpjCalculado, tipoBacen }) =>
        onFormDataChange({
          instituicao: nome,
          instituicaoId: id,
          instituicaoTipoBacen: tipoBacen ?? null,
          instituicaoCnpjRotulo: rotuloCnpj({ cnpj, cnpjCalculado }) ?? '',
        })
      }
      error={errors.instituicao}
      onErrorClear={() => onErrorsChange({ instituicao: undefined })}
      placeholder="Digite o nome da instituição (ex: Itaú, Bradesco, XP Investimentos)"
      showHint
      showSelectedSummary
    />
  );
}
