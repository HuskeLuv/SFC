'use client';
import React from 'react';
import { WizardErrors, WizardFormData } from '@/types/wizard';
import InstitutionPicker from './shared/InstitutionPicker';

interface Step2AporteInstitutionProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step2AporteInstitution({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step2AporteInstitutionProps) {
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
