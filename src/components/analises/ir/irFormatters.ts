export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ];
  const mIdx = parseInt(m, 10) - 1;
  return `${meses[mIdx] ?? m}/${y}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export const CATEGORIA_LABEL: Record<'acao_br' | 'fii' | 'etf_br', string> = {
  acao_br: 'Ações BR',
  fii: 'FII',
  etf_br: 'ETF BR',
};

export const FUNDO_TIPO_LABEL: Record<'longo-prazo' | 'curto-prazo' | 'acoes', string> = {
  'longo-prazo': 'Longo prazo (15%)',
  'curto-prazo': 'Curto prazo (20%)',
  acoes: 'Ações (sem come-cotas)',
};
