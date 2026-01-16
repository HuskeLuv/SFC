"use client";
import React from "react";
import { WizardFormData } from "@/types/wizard";

interface Step5AporteConfirmationProps {
  formData: WizardFormData;
}

const formatDateDisplay = (value: string) => {
  if (!value) return "-";
  const parts = value.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return value;
};

export default function Step5AporteConfirmation({ formData }: Step5AporteConfirmationProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <p><span className="font-semibold">Tipo:</span> {formData.tipoAtivo || "-"}</p>
        <p><span className="font-semibold">Investimento:</span> {formData.ativo || "-"}</p>
        <p><span className="font-semibold">Data do aporte:</span> {formatDateDisplay(formData.dataAporte)}</p>
        <p><span className="font-semibold">Valor do aporte:</span> {formData.valorAporte.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Revise os dados antes de confirmar o aporte.
      </p>
    </div>
  );
}
