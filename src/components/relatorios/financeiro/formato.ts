/**
 * Formatadores do Relatório financeiro: porte 1:1 do protótipo do Pedro (relatorio-pedro.html).
 * Sinal negativo com o "−" tipográfico (U+2212), como no protótipo.
 *
 * Puro (sem React): o FormatoProvider (olho de esconder valores) embrulha fR/fR0.
 */

/** Menos tipográfico. */
export const MENOS = '−';

const R2 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ com 2 casas: fR(−1234.5) = '−R$ 1.234,50'. */
export const fR = (v: number): string => (v < 0 ? MENOS : '') + 'R$ ' + R2(Math.abs(v));

/** R$ sem casas: fR0(−1234) = '−R$ 1.234'. */
export const fR0 = (v: number): string =>
  (v < 0 ? MENOS : '') + 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR');

/** Percentual com `d` casas: fP(63.5) = '63,5%'. */
export const fP = (v: number, d = 1): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';

/** Eixo em R$ compacto: 1,2 mi · 35 mil · 950. */
export const fAx = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (a >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
};

/** Eixo em %: até 1 casa. */
export const fAxP = (v: number): string =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

export const MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

export const MESES_EXTENSO = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** 'YYYY-MM' → 'Mmm/aa' (rotuloMes('2026-11') = 'Nov/26'). */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES_ABREV[m - 1]}/${String(a).slice(2)}`;
}

/** Soma de uma lista. */
export const soma = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);
