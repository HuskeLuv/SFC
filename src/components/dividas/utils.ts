/**
 * Helpers de UI compartilhados entre as views de Dívidas.
 * Sem dependências de React — só formatação/labels.
 */

import type { DividaTipo, DividaSistema, DividaIndexador, DividaStatus } from '@/hooks/useDividas';
import type { Category } from '@/services/planejamento/planejamentoSonhos';
import { formatCurrency } from '@/utils/formatters';

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

/** Fração → percentual pt-BR ("0.0125" → "1,25%"). */
export function formatTaxaPercent(fraction: number | null | undefined, decimals = 2): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(decimals).replace('.', ',')}%`;
}

/** "YYYY-MM" → "Mai/26". */
export function formatYearMonth(yearMonth: string | null | undefined): string {
  if (!yearMonth) return '—';
  const [y, m] = yearMonth.split('-');
  const idx = Number(m) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return yearMonth;
  return `${MONTH_NAMES_PT[idx]}/${y.slice(-2)}`;
}

/** Mês atual no formato YYYY-MM, horário local. */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const TIPO_LABELS: Record<DividaTipo, string> = {
  financiamento_imobiliario: 'Financiamento imobiliário',
  financiamento_veiculo: 'Financiamento de veículo',
  emprestimo_pessoal: 'Empréstimo pessoal',
  consignado: 'Consignado',
  cartao_credito: 'Cartão de crédito',
  cheque_especial: 'Cheque especial',
  outro: 'Outro',
};

export const TIPOS_FINANCIAMENTO: DividaTipo[] = [
  'financiamento_imobiliario',
  'financiamento_veiculo',
  'emprestimo_pessoal',
  'consignado',
  'outro',
];

export const TIPOS_ROTATIVA: DividaTipo[] = [
  'cartao_credito',
  'cheque_especial',
  'emprestimo_pessoal',
  'outro',
];

export const SISTEMA_LABELS: Record<DividaSistema, string> = {
  SAC: 'SAC (parcela decrescente)',
  PRICE: 'Price (parcela fixa)',
};

export const INDEXADOR_LABELS: Record<DividaIndexador, string> = {
  PREFIXADO: 'Prefixado',
  TR: 'TR',
  IPCA: 'IPCA',
  IGPM: 'IGP-M',
  CDI: 'CDI',
};

export const STATUS_LABELS: Record<DividaStatus, string> = {
  ativa: 'Iniciada',
  em_espera: 'Em espera',
  pausada: 'Pausada',
  quitada: 'Concluída',
};

/** Badge por status (tabela/detalhe) — mesma paleta dos sonhos. */
export const STATUS_BADGE: Record<DividaStatus, string> = {
  ativa: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  em_espera: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pausada: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  quitada: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
};

export const CATEGORIA_LABELS: Record<Category, string> = {
  c: 'Curto prazo',
  m: 'Médio prazo',
  l: 'Longo prazo',
};
