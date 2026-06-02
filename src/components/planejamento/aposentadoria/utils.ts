/**
 * Helpers de formatação do Simulador de Aposentadoria.
 * Reaproveita os formatadores de Sonhos e adiciona variações específicas
 * (percentual com vírgula, mês curto a partir de número).
 */

import { formatBRL, formatBRLCompact } from '../sonhos/utils';

export { formatBRL, formatBRLCompact };

const MONTH_NAMES_PT = [
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
];

export const MONTH_OPTIONS = MONTH_NAMES_PT.map((label, i) => ({ value: i + 1, label }));

/** Percentual com vírgula decimal: 6,67%. */
export function fPct(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

/** (mês 1-12, ano) → "Jun/25". */
export function fMonth(month: number, year: number): string {
  const idx = month - 1;
  if (idx < 0 || idx > 11) return '—';
  return `${MONTH_NAMES_PT[idx]}/${String(year).slice(-2)}`;
}
