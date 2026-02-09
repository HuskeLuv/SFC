import React, { useEffect, useMemo, useState } from "react";
import Input from "@/components/form/input/InputField";

type CaixaParaInvestirCardProps = {
  title?: string;
  value: number;
  formatCurrency: (value: number | null | undefined) => string;
  onSave?: (value: number) => Promise<boolean>;
  color?: "primary" | "success" | "warning" | "error";
  readOnly?: boolean;
};

const parseCurrencyToNumber = (rawValue: string): number | null => {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }
  const normalizedValue = trimmedValue
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const CaixaParaInvestirCard: React.FC<CaixaParaInvestirCardProps> = ({
  title = "Caixa para Investir",
  value,
  formatCurrency,
  onSave,
  color = "success",
  readOnly = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedValue = useMemo(() => formatCurrency(value ?? 0), [formatCurrency, value]);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(formattedValue);
    }
  }, [formattedValue, isEditing]);

  const handleStartEditing = () => {
    setErrorMessage(null);
    setInputValue(formattedValue);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setErrorMessage(null);
    setInputValue(formattedValue);
    setIsEditing(false);
  };

  const handleSaveValue = async () => {
    const parsedValue = parseCurrencyToNumber(inputValue);
    if (parsedValue === null || parsedValue < 0) {
      setErrorMessage("Informe um valor válido.");
      return;
    }
    setIsSaving(true);
    const success = onSave ? await onSave(parsedValue) : false;
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
      setErrorMessage(null);
      return;
    }
    setErrorMessage("Não foi possível salvar o valor.");
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSaveValue();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEditing();
    }
  };

  const colorClasses = {
    primary: "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100",
    success: "bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100",
    warning: "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
    error: "bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100",
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      {isEditing ? (
        <Input
          id="caixaParaInvestir"
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleInputKeyDown}
          error={!!errorMessage}
          hint={errorMessage ?? undefined}
          aria-label="Editar caixa para investir"
        />
      ) : (
        <p className="text-xl font-semibold">{formattedValue}</p>
      )}
      {!readOnly && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                onClick={handleSaveValue}
                disabled={isSaving}
                aria-label="Salvar caixa para investir"
              >
                {isSaving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                onClick={handleCancelEditing}
                aria-label="Cancelar edição do caixa para investir"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={handleStartEditing}
              aria-label="Editar caixa para investir"
            >
              Editar
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CaixaParaInvestirCard;
