/**
 * Janelas de período ancoradas em mês-calendário (estilo Kinvo).
 *
 * O Kinvo não usa janela rolante dia-a-dia (`hoje − N`). Ele conta meses-calendário
 * inteiros ancorados no dia 1º: a referência mensal das séries vem sempre como
 * `YYYY-MM-01` (confirmado nas respostas de `getLastThreeMonthsPortfolioProfitability`
 * e `GetMonthlyConsolidationToChart`). Logo, "últimos N meses" cobre N meses distintos
 * incluindo o mês corrente, começando no dia 1º.
 *
 * Ex.: N=24 em jun/2026 → 01/07/2024 (e não 06/06/2024 como na janela rolante).
 *
 * As datas são construídas em horário LOCAL para casar com o resto do código
 * (`new Date(y, m, d)`), que é seguro no fuso do Brasil (−03:00) e em UTC.
 */

/**
 * Início da janela "últimos N meses": dia 1º do mês corrente recuado (N−1) meses.
 * Conta N meses-calendário distintos, incluindo o mês atual (parcial).
 */
export function inicioUltimosNMeses(n: number, ref: Date = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  d.setMonth(d.getMonth() - (n - 1));
  return d;
}

/** Dia 1º de janeiro do ano corrente ("No ano" / YTD). */
export function inicioDoAno(ref: Date = new Date()): Date {
  return new Date(ref.getFullYear(), 0, 1, 0, 0, 0, 0);
}

/** Dia 1º do mês corrente ("No mês"). */
export function inicioDoMes(ref: Date = new Date()): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
}

/** Formata uma Date como `YYYY-MM-DD` a partir dos componentes locais (TZ-safe). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
