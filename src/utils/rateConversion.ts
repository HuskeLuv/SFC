/**
 * Conversões entre taxas efetivas anuais e mensais (juros compostos).
 * Taxas em decimal: 0.12 = 12%.
 */

/** Taxa efetiva anual → mensal equivalente: (1+aa)^(1/12) − 1 */
export function aaToAm(taxaAa: number): number {
  return Math.pow(1 + taxaAa, 1 / 12) - 1;
}

/** Taxa efetiva mensal → anual equivalente: (1+am)^12 − 1 */
export function amToAa(taxaAm: number): number {
  return Math.pow(1 + taxaAm, 12) - 1;
}
