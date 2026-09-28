import { CASHFLOW_COLOR_LEGEND, type CashflowColorValue } from '@/utils/cashflowColorLegend';

/**
 * Situação (cor) da célula do fluxo de caixa. `CashflowValue.color` guarda o hex CSS da legenda
 * (é o que o desktop e o seletor gravam), mas células antigas podem ter o token ('red'/'green').
 * Usado pelo ponto de situação da visão do mês e pelo seletor do sheet (PWA fase 2).
 */

const TOKENS = new Set<string>(CASHFLOW_COLOR_LEGEND.map((c) => c.value));

/** '#abc' → '#aabbcc'; demais formatos voltam como vieram (minúsculos). */
function expandHex(color: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(color);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
}

/** Hex (qualquer caixa, 3 ou 6 dígitos) ou token → valor da legenda; fora da legenda → null. */
export function normalizeCellColor(color: string | null | undefined): CashflowColorValue | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  if (!c) return null;
  if (TOKENS.has(c)) return c as CashflowColorValue;
  const hex = expandHex(c);
  const entry = CASHFLOW_COLOR_LEGEND.find((e) => e.cssColor.toLowerCase() === hex);
  return entry ? entry.value : null;
}

/** Rótulo da legenda ("Pago", "Recebido"…) da cor da célula; fora da legenda → null. */
export function cellColorLabel(color: string | null | undefined): string | null {
  const value = normalizeCellColor(color);
  if (!value) return null;
  return CASHFLOW_COLOR_LEGEND.find((e) => e.value === value)?.label ?? null;
}
