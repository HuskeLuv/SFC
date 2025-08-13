import { NewRowData } from "@/types/cashflow";

export const validateNewRow = (row: NewRowData): string | null => {
  if (!row.descricao?.trim()) {
    return "Descrição obrigatória.";
  }
  if (typeof row.significado !== "string") {
    return "Significado inválido.";
  }
  if (typeof row.percentTotal !== "number" || isNaN(row.percentTotal) || row.percentTotal < 0) {
    return "% Receita Total deve ser um número positivo.";
  }
  return null;
}; 