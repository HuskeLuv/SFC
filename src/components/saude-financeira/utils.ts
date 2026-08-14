/**
 * Helpers de UI da Saúde Financeira — formatação e metadados de status.
 * Sem dependências de React (padrão de components/dividas/utils.ts).
 */

import type { StatusSaudeCodigo, TendenciaDirecao } from '@/hooks/useSaudeFinanceira';
import { formatCurrency } from '@/utils/formatters';

export const MONTH_NAMES_PT = [
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

const TENDENCIA_GLYPH: Record<TendenciaDirecao, string> = { up: '↑', down: '↓', flat: '→' };

/**
 * Texto + cor do rodapé de um MetricCard a partir da tendência vs último mês.
 * A direção é factual; `bomQuandoSobe` decide a cor (gasto subindo = ruim).
 * Sem tendência (primeiro mês) cai no texto de fonte.
 */
export function tendenciaChange(
  direcao: TendenciaDirecao | null,
  bomQuandoSobe: boolean,
  fallback: string,
): { change: string; changeDirection: 'up' | 'down' | 'neutral' } {
  if (direcao == null) return { change: fallback, changeDirection: 'neutral' };
  if (direcao === 'flat')
    return { change: '→ estável vs mês anterior', changeDirection: 'neutral' };
  const bom = direcao === 'up' ? bomQuandoSobe : !bomQuandoSobe;
  return {
    change: `${TENDENCIA_GLYPH[direcao]} vs mês anterior`,
    changeDirection: bom ? 'up' : 'down',
  };
}

/** Seta inline (hero): glyph + classe de cor pela "bondade" da variação. */
export function tendenciaSeta(
  direcao: TendenciaDirecao | null,
  bomQuandoSobe: boolean,
): { glyph: string; className: string } | null {
  if (direcao == null) return null;
  if (direcao === 'flat') return { glyph: '→', className: 'text-gray-400 dark:text-gray-500' };
  const bom = direcao === 'up' ? bomQuandoSobe : !bomQuandoSobe;
  return {
    glyph: TENDENCIA_GLYPH[direcao],
    className: bom ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
  };
}

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
