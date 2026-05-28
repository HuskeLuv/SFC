/**
 * Helpers de UI compartilhados entre as views de Planejamento Sonhos.
 * Sem dependências de React — só formatação/labels.
 */

import { formatCurrency } from '@/utils/formatters';
import type {
  PlanejamentoCategory,
  PlanejamentoPriority,
  PlanejamentoStatus,
} from '@/hooks/usePlanejamentoSonhos';

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

/**
 * Formata valor monetário com prefixo "R$" no padrão BR (sempre com 2 casas).
 * Use `formatBRLCompact` quando precisar abreviar milhares/milhões.
 */
export function formatBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `R$ ${formatCurrency(value)}`;
}

/**
 * Versão compacta: R$ 1,2M / R$ 25K / R$ 250,00. Útil em cards de stats.
 */
export function formatBRLCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2).replace('.', ',')} M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(0).replace('.', ',')} K`;
  return `R$ ${formatCurrency(value)}`;
}

/**
 * "YYYY-MM" → "Mai/26". Usado em tabelas de entries e nos eixos do gráfico.
 */
export function formatYearMonth(yearMonth: string | null | undefined): string {
  if (!yearMonth) return '—';
  const [y, m] = yearMonth.split('-');
  const idx = Number(m) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return yearMonth;
  return `${MONTH_NAMES_PT[idx]}/${y.slice(-2)}`;
}

/** Retorna o mês atual no formato YYYY-MM, baseado em horário local. */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const CATEGORY_LABELS: Record<PlanejamentoCategory, string> = {
  c: 'Curto (até 12m)',
  m: 'Médio (12–60m)',
  l: 'Longo (acima 60m)',
};

export const CATEGORY_LONG_LABELS: Record<PlanejamentoCategory, string> = {
  c: 'Curto Prazo',
  m: 'Médio Prazo',
  l: 'Longo Prazo',
};

export const PRIORITY_OPTIONS: PlanejamentoPriority[] = ['Alta', 'Moderado', 'Baixa'];

export const STATUS_OPTIONS: PlanejamentoStatus[] = [
  'Em espera',
  'Iniciado',
  'Pausado',
  'Atrasado',
  'Concluído',
];

export const CATEGORY_OPTIONS: { value: PlanejamentoCategory; label: string }[] = [
  { value: 'c', label: 'Curto Prazo (até 12 meses)' },
  { value: 'm', label: 'Médio Prazo (12 a 60 meses)' },
  { value: 'l', label: 'Longo Prazo (acima de 60 meses)' },
];

/** Cor de destaque por categoria (mesma paleta do TailAdmin pra consistência). */
export function categoryAccent(cat: PlanejamentoCategory): string {
  switch (cat) {
    case 'c':
      return '#0ea5e9'; // sky-500
    case 'm':
      return '#465FFF'; // brand-500
    case 'l':
      return '#1e3a8a'; // blue-900
  }
}
