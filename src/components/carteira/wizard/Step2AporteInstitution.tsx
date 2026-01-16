"use client";
import React, { useEffect, useState } from "react";
import AutocompleteInput from "@/components/form/AutocompleteInput";
import { AutocompleteOption } from "@/types/wizard";
import { WizardErrors, WizardFormData } from "@/types/wizard";

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
  const [institutionOptions, setInstitutionOptions] = useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (formData.tipoAtivo) {
      fetchInstitutions("");
    } else {
      setInstitutionOptions([]);
    }
  }, [formData.tipoAtivo]);

  const fetchInstitutions = async (search: string) => {
    if (search.length > 0 && search.length < 2) return;

    if (!formData.tipoAtivo) {
      setInstitutionOptions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/carteira/resgate/instituicoes?tipo=${encodeURIComponent(formData.tipoAtivo)}&search=${encodeURIComponent(search)}&limit=20`,
        { credentials: "include" }
      );

      if (response.ok) {
        const data = await response.json();
        const options: AutocompleteOption[] = (data.instituicoes || []).map((inst: { value: string; label: string }) => ({
          value: inst.value,
          label: inst.label,
        }));
        setInstitutionOptions(options);
      }
    } catch (error) {
      console.error("Erro ao buscar instituições:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstitutionChange = (value: string) => {
    onFormDataChange({
      instituicao: value,
      instituicaoId: value ? formData.instituicaoId : "",
    });

    if (errors.instituicao) {
      onErrorsChange({ instituicao: undefined });
    }
  };

  const handleInstitutionSelect = (option: AutocompleteOption) => {
    onFormDataChange({
      instituicao: option.label,
      instituicaoId: option.value,
    });
    onErrorsChange({ instituicao: undefined });
  };

  return (
    <div className="space-y-6">
      <AutocompleteInput
        id="instituicao"
        label="Instituição Financeira *"
        placeholder="Digite o nome da instituição (ex: Itaú, XP)"
        value={formData.instituicao}
        onChange={handleInstitutionChange}
        onSelect={handleInstitutionSelect}
        options={institutionOptions}
        loading={loading}
        error={!!errors.instituicao}
        hint={errors.instituicao}
      />
      {!formData.tipoAtivo && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-100">
          Selecione o tipo de investimento antes de escolher a instituição.
        </div>
      )}
    </div>
  );
}
