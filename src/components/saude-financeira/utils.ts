/**
 * Helpers de UI da Saúde Financeira — formatação e metadados de status.
 * Sem dependências de React (padrão de components/dividas/utils.ts).
 */

import type { StatusSaudeCodigo } from '@/hooks/useSaudeFinanceira';
import { formatCurrency } from '@/utils/formatters';

export function formatBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `R$ ${formatCurrency(value)}`;
}

export function formatBRLCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2).replace('.', ',')} M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(0).replace('.', ',')} K`;
  return `R$ ${formatCurrency(value)}`;
}

/** Fração → percentual pt-BR ("0.3077" → "30,8%"). */
export function formatPercent(fraction: number | null | undefined, decimals = 1): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(decimals).replace('.', ',')}%`;
}

/** Meses com 1 casa ("11.87" → "11,9 meses"). */
export function formatMeses(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1).replace('.', ',')} meses`;
}

export interface StatusMeta {
  label: string;
  descricao: string;
  /** Classes do badge grande do hero. */
  badgeClass: string;
  /** Classes da borda/fundo do card do hero. */
  cardClass: string;
}

export const STATUS_META: Record<StatusSaudeCodigo, StatusMeta> = {
  ED: {
    label: 'Endividamento',
    descricao: 'As dívidas estão comprometendo sua saúde financeira. Priorize quitá-las.',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    cardClass: 'border-red-200 dark:border-red-900/50',
  },
  FR: {
    label: 'Frágil',
    descricao: 'Sem dívidas críticas, mas o colchão de segurança ainda é insuficiente.',
    badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    cardClass: 'border-yellow-200 dark:border-yellow-900/50',
  },
  EQ: {
    label: 'Equilibrado',
    descricao: 'Finanças saudáveis: reserva formada e endividamento sob controle.',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    cardClass: 'border-green-200 dark:border-green-900/50',
  },
};
