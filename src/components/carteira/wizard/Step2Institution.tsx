"use client";
import React, { useState, useEffect } from "react";
import { WizardFormData, WizardErrors, Institution, AutocompleteOption } from "@/types/wizard";
import AutocompleteInput from "@/components/form/AutocompleteInput";

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
  const [institutionOptions, setInstitutionOptions] = useState<AutocompleteOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Carregar instituições iniciais
  useEffect(() => {
    fetchInstitutions('');
  }, []);

  // Buscar instituições
  const fetchInstitutions = async (search: string) => {
    // Permitir busca vazia para carregar todas as instituições
    if (search.length > 0 && search.length < 2) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/institutions?search=${encodeURIComponent(search)}&limit=20`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const data = await response.json();
        const options: AutocompleteOption[] = data.institutions.map((inst: Institution) => ({
          value: inst.id,
          label: inst.nome,
          subtitle: inst.codigo,
        }));
        setInstitutionOptions(options);
      }
    } catch (error) {
      console.error('Erro ao buscar instituições:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstitutionChange = (value: string) => {
    onFormDataChange({ 
      instituicao: value,
      instituicaoId: value ? formData.instituicaoId : ""
    });
    
    // Limpar erro quando usuário começar a digitar
    if (errors.instituicao) {
      onErrorsChange({ instituicao: undefined });
    }
  };

  const handleInstitutionSelect = (option: AutocompleteOption) => {
    onFormDataChange({
      instituicao: option.label,
      instituicaoId: option.value,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <AutocompleteInput
          id="instituicao"
          label="Instituição Financeira *"
          placeholder="Digite o nome da instituição (ex: Itaú, Bradesco, XP Investimentos)"
          value={formData.instituicao}
          onChange={handleInstitutionChange}
          onSelect={handleInstitutionSelect}
          options={institutionOptions}
          loading={loading}
          error={!!errors.instituicao}
          hint={errors.instituicao}
        />
      </div>

      {/* Instruções */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          💡 Dica
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Digite pelo menos 2 caracteres para buscar instituições. Você pode procurar por:
        </p>
        <ul className="text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
          <li>• Nome da instituição (ex: &quot;Itaú&quot;, &quot;Bradesco&quot;)</li>
          <li>• Tipo de instituição (ex: &quot;banco&quot;, &quot;corretora&quot;)</li>
          <li>• Nome da corretora (ex: &quot;XP&quot;, &quot;Rico&quot;, &quot;Clear&quot;)</li>
        </ul>
      </div>

      {/* Instituição selecionada */}
      {formData.instituicaoId && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
            Instituição Selecionada
          </h4>
          <p className="text-sm text-green-700 dark:text-green-300">
            {formData.instituicao}
          </p>
        </div>
      )}
    </div>
  );
}
