'use client';
import React from 'react';
import { RedeemWizardErrors, RedeemWizardFormData } from '@/types/redeemWizard';
import InstitutionPicker from '../wizard/shared/InstitutionPicker';

interface Step2RedeemInstitutionProps {
  formData: RedeemWizardFormData;
  errors: RedeemWizardErrors;
  onFormDataChange: (data: Partial<RedeemWizardFormData>) => void;
  onErrorsChange: (errors: Partial<RedeemWizardErrors>) => void;
}

export default function Step2RedeemInstitution({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step2RedeemInstitutionProps) {
  const endpoint = formData.tipoAtivo
    ? `/api/carteira/resgate/instituicoes?tipo=${encodeURIComponent(formData.tipoAtivo)}`
    : null;

  return (
    <InstitutionPicker
      endpoint={endpoint}
      responseShape="instituicoes"
      selectedId={formData.instituicaoId}
      selectedName={formData.instituicao}
      onChange={({ id, nome }) => onFormDataChange({ instituicao: nome, instituicaoId: id })}
      error={errors.instituicao}
      onErrorClear={() => onErrorsChange({ instituicao: undefined })}
      emptyEndpointMessage="Selecione o tipo de investimento antes de escolher a instituição."
    />
  );
}
