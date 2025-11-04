import { NewRowData } from "@/types/cashflow";

export const validateNewRow = (row: NewRowData): string | null => {
  if (!row.name?.trim()) {
    return "Nome obrigatório.";
  }
  if (row.significado && typeof row.significado !== "string") {
    return "Significado inválido.";
  }
  return null;
}; 