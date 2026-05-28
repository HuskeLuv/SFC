/**
 * F3 — Planejamento Sonhos: helpers puros pra cálculo de objetivos financeiros.
 *
 * Modelo matemático:
 *  - Cada objetivo tem valor-meta `target`, valor inicial `available`,
 *    prazo `months` e rentabilidade mensal `rate` (decimal, ex.: 0.01 = 1%/mês).
 *  - `pmt(g)` retorna o aporte mensal necessário pra atingir `target` no prazo,
 *    via fórmula clássica de anuidade (PV/FV).
 *  - `planned(g, t)` projeta o saldo no mês t assumindo aportes regulares
 *    (formula de FV de anuidade postecipada com PV inicial).
 *  - `progress(g)` calcula percentual concluído a partir do último entry
 *    registrado (ou `available` se nenhum entry existir).
 *
 * Substitui o `aposentadoriaSimulator` antigo. Sem I/O.
 */

export type Priority = 'Alta' | 'Moderado' | 'Baixa';
export type Category = 'c' | 'm' | 'l'; // curto/médio/longo
export type Status = 'Em espera' | 'Iniciado' | 'Pausado' | 'Atrasado' | 'Concluído';

export interface PlanejamentoEntry {
  month: string; // YYYY-MM
  aporte: number;
  balance: number;
}

export interface PlanejamentoObjetivoInput {
  target: number;
  months: number;
  available: number;
  rate: number; // ao mês, decimal (0.01 = 1%)
  entries?: PlanejamentoEntry[];
}

/**
 * Categoria sugerida com base no prazo em meses.
 *   <= 12  → curto
 *   <= 60  → médio
 *   > 60   → longo
 */
export function categoryFromMonths(months: number): Category {
  if (months <= 12) return 'c';
  if (months <= 60) return 'm';
  return 'l';
}

/**
 * PMT: aporte mensal necessário pra sair de `available` e chegar em `target`
 * em `months` meses com taxa `rate` ao mês.
 *
 * Fórmula: c = FV * r / ((1+r)^n - 1), onde FV = T - P*(1+r)^n
 * Quando rate ≈ 0 cai pra (target - available) / months (sem juros).
 * Retorna 0 quando o saldo inicial já cobre a meta.
 */
export function pmt(g: PlanejamentoObjetivoInput): number {
  const { target, available, months, rate } = g;
  if (months <= 0) return 0;
  if (Math.abs(rate) < 1e-10) {
    return Math.max(0, (target - available) / months);
  }
  const fv = target - available * Math.pow(1 + rate, months);
  return Math.max(0, (fv * rate) / (Math.pow(1 + rate, months) - 1));
}

/**
 * Saldo planejado no mês t (t=0 → available; t=months → ~target).
 * Assume aportes regulares = pmt(g) e capitalização mensal composta.
 */
export function planned(g: PlanejamentoObjetivoInput, t: number): number {
  if (t <= 0) return g.available;
  const r = g.rate;
  const c = pmt(g);
  if (Math.abs(r) < 1e-10) {
    return g.available + c * t;
  }
  return g.available * Math.pow(1 + r, t) + (c * (Math.pow(1 + r, t) - 1)) / r;
}

export interface ProgressResult {
  pct: number; // 0-100, capped em 100
  balance: number;
  count: number; // número de entries registradas
}

/**
 * Progresso atual: usa o balance do último entry (cronológico) como saldo real.
 * Quando não há entries, usa `available` como baseline.
 */
export function progress(g: PlanejamentoObjetivoInput): ProgressResult {
  const entries = g.entries ?? [];
  // entries presumidos cronologicamente ordenados pelo caller (API garante);
  // mas pra robustez, pega o de maior `month`.
  let balance = g.available;
  if (entries.length > 0) {
    const last = [...entries].sort((a, b) => a.month.localeCompare(b.month)).at(-1);
    if (last) balance = last.balance;
  }
  const pct = g.target > 0 ? Math.min(100, (balance / g.target) * 100) : 0;
  return { pct, balance, count: entries.length };
}

/**
 * Status automático: ao registrar entry, "Em espera" → "Iniciado", e quando
 * balance ≥ target → "Concluído". Caller decide se aplica.
 */
export function autoStatusOnEntry(currentStatus: Status, balance: number, target: number): Status {
  if (balance >= target) return 'Concluído';
  if (currentStatus === 'Em espera') return 'Iniciado';
  return currentStatus;
}

/**
 * Adiciona N meses a um YYYY-MM. Útil pra calcular data de conclusão.
 */
export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  let year = y;
  let month = m + n;
  while (month > 12) {
    month -= 12;
    year++;
  }
  while (month < 1) {
    month += 12;
    year--;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}
