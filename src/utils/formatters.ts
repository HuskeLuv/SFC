import { formatNumber, formatPct } from './format';

/**
 * @deprecated Apesar do nome, NUNCA colocou o símbolo "R$" — é só um número
 * pt-BR com 2 casas ("1.234,56"). Hoje é alias de `formatNumber` de
 * `@/utils/format`. Em código novo, use `formatBRL` (com "R$") ou
 * `formatNumber` direto, conforme a intenção.
 */
export const formatCurrency = (value: number): string => formatNumber(value);

/**
 * @deprecated Alias de `formatPct` de `@/utils/format` (pt-BR, vírgula
 * decimal). Em código novo, importe `formatPct` direto.
 */
export const formatPercent = (value: number): string => formatPct(value);

export const isReceitaGroup = (groupName: string): boolean => {
  return groupName.includes('Entradas') || groupName.includes('Receitas');
};

// Simplified function that uses the explicit type field
export const isReceitaGroupByType = (groupType: string): boolean => {
  return groupType === 'entrada' || groupType === 'Entradas';
};
