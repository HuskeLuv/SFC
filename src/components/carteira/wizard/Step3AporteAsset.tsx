"use client";
import React, { useEffect, useState } from "react";
import AutocompleteInput from "@/components/form/AutocompleteInput";
import { AutocompleteOption } from "@/types/wizard";
import { WizardErrors, WizardFormData } from "@/types/wizard";

interface Step3AporteAssetProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

interface AporteAssetOption {
  portfolioId: string;
  label: string;
  subtitle?: string;
  quantity: number;
  totalInvested: number;
}

export default function Step3AporteAsset({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step3AporteAssetProps) {
  const [assetOptions, setAssetOptions] = useState<AporteAssetOption[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAssets = async (search: string) => {
    if (!formData.tipoAtivo || !formData.instituicaoId) {
      setAssetOptions([]);
      onErrorsChange({ ativo: "Selecione o tipo e a instituição antes de buscar." });
      return;
    }

    if (search.length > 0 && search.length < 2) {
      return;
    }

    setLoading(true);
    try {
      const url = `/api/carteira/resgate/ativos?tipo=${encodeURIComponent(formData.tipoAtivo)}&instituicaoId=${encodeURIComponent(formData.instituicaoId)}&search=${encodeURIComponent(search)}&limit=20`;
      const response = await fetch(url, { credentials: "include" });

      if (response.ok) {
        const data = await response.json();
        const options: AporteAssetOption[] = (data.assets || []).map((asset: any) => ({
          portfolioId: asset.portfolioId,
          label: asset.label,
          subtitle: asset.subtitle,
          quantity: asset.quantity,
          totalInvested: asset.totalInvested,
        }));
        setAssetOptions(options);
        if (options.length === 0 && search.length >= 2) {
          onErrorsChange({ ativo: "Nenhum investimento encontrado para aporte." });
        } else if (options.length === 0) {
          onErrorsChange({ ativo: undefined });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        onErrorsChange({ ativo: errorData.message || "Não foi possível carregar os investimentos." });
      }
    } catch (error) {
      console.error("Erro ao buscar investimentos:", error);
      onErrorsChange({ ativo: "Não foi possível carregar os investimentos." });
    } finally {
      setLoading(false);
    }
  };

  const handleAssetChange = (value: string) => {
    onFormDataChange({
      ativo: value,
      portfolioId: "",
      availableQuantity: 0,
      availableTotal: 0,
    });

    if (!formData.tipoAtivo || !formData.instituicaoId) {
      onErrorsChange({ ativo: "Selecione o tipo e a instituição antes de buscar." });
      setAssetOptions([]);
      return;
    }

    if (value.length >= 2) {
      fetchAssets(value);
    } else if (value.length === 0) {
      fetchAssets("");
    } else {
      setAssetOptions([]);
    }

    if (errors.ativo) {
      onErrorsChange({ ativo: undefined });
    }
  };

  const handleAssetSelect = (option: AutocompleteOption) => {
    const selected = assetOptions.find((asset) => asset.portfolioId === option.value);
    if (!selected) return;

    onFormDataChange({
      ativo: option.label,
      portfolioId: selected.portfolioId,
      availableQuantity: selected.quantity,
      availableTotal: selected.totalInvested,
    });
    onErrorsChange({ ativo: undefined });
  };

  useEffect(() => {
    setAssetOptions([]);
    if (formData.tipoAtivo && formData.instituicaoId) {
      onErrorsChange({ ativo: undefined });
      fetchAssets("");
    }
  }, [formData.tipoAtivo, formData.instituicaoId]);

  return (
    <div className="space-y-6">
      <AutocompleteInput
        id="ativo"
        label="Investimento *"
        placeholder="Digite pelo menos 2 caracteres para buscar"
        value={formData.ativo}
        onChange={handleAssetChange}
        onSelect={handleAssetSelect}
        options={assetOptions.map((asset) => ({
          value: asset.portfolioId,
          label: `${asset.label} (${asset.quantity} und | ${asset.totalInvested.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
          subtitle: asset.subtitle,
        }))}
        loading={loading}
        error={!!errors.ativo}
        hint={errors.ativo}
      />
      {!formData.instituicaoId && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-100">
          Selecione a instituição para listar os investimentos disponíveis.
        </div>
      )}
    </div>
  );
}
