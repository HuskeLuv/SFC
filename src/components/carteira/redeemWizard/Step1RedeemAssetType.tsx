"use client";
import React, { useEffect, useState } from "react";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { RedeemAssetTypeOption, RedeemWizardErrors, RedeemWizardFormData } from "@/types/redeemWizard";

interface Step1RedeemAssetTypeProps {
  formData: RedeemWizardFormData;
  errors: RedeemWizardErrors;
  onFormDataChange: (data: Partial<RedeemWizardFormData>) => void;
  onErrorsChange: (errors: Partial<RedeemWizardErrors>) => void;
}

export default function Step1RedeemAssetType({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step1RedeemAssetTypeProps) {
  const [options, setOptions] = useState<RedeemAssetTypeOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTipos = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/carteira/resgate/tipos", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setOptions(data.tipos || []);
        }
      } catch (error) {
        console.error("Erro ao buscar tipos para resgate:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTipos();
  }, []);

  const handleTipoAtivoChange = (value: string) => {
    onFormDataChange({
      tipoAtivo: value,
      ativo: "",
      portfolioId: "",
      assetId: "",
      stockId: "",
      availableQuantity: 0,
      availableTotal: 0,
      moeda: "",
    });

    if (errors.tipoAtivo) {
      onErrorsChange({ tipoAtivo: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="tipoAtivo">Tipo de Investimento *</Label>
        <Select
          options={options}
          placeholder={loading ? "Carregando tipos..." : "Selecione o tipo para resgate"}
          defaultValue={formData.tipoAtivo}
          onChange={handleTipoAtivoChange}
          className={errors.tipoAtivo ? "border-red-500" : ""}
        />
        {errors.tipoAtivo && (
          <p className="mt-1 text-sm text-red-500">{errors.tipoAtivo}</p>
        )}
      </div>
      {!loading && options.length === 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-100">
          Nenhum tipo disponível para resgate. Adicione investimentos antes de resgatar.
        </div>
      )}
    </div>
  );
}
