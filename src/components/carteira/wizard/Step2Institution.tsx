'use client';
import React from 'react';
import { WizardFormData, WizardErrors } from '@/types/wizard';
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
      onChange={({ id, nome }) => onFormDataChange({ instituicao: nome, instituicaoId: id })}
      error={errors.instituicao}
      onErrorClear={() => onErrorsChange({ instituicao: undefined })}
      placeholder="Digite o nome da instituição (ex: Itaú, Bradesco, XP Investimentos)"
      showHint
      showSelectedSummary
    />
  );
}
