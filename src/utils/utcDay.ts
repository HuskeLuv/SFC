/**
 * Helpers de dia-calendário em UTC.
 *
 * Todas as séries temporais do backend usam timestamps de meia-noite UTC
 * (`normalizeDateStart`). Bordas de janela construídas com meia-noite LOCAL
 * (03:00Z em UTC-3) combinadas com filtros `>=` excluem o ponto do dia-borda;
 * acessores locais (`getMonth()` etc.) sobre pontos UTC deslocam o dia 1º pro
 * mês anterior. Estes helpers convertem dias-calendário e agrupam buckets
 * sempre na convenção UTC das séries.
 */

/**
 * Converte o dia-calendário LOCAL de `d` na meia-noite UTC daquele dia.
 * Use para transformar bordas de `periodWindow`/date-pickers (construídas em
 * horário local) em bordas comparáveis aos pontos UTC-midnight das séries.
 */
export function utcMidnight(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Meia-noite UTC do dia-calendário local de hoje. */
export function todayUtcMidnight(): number {
  return utcMidnight(new Date());
}

/**
 * Chave de bucket mensal: meia-noite UTC do dia 1º do mês (UTC) do timestamp.
 * Usa acessores UTC — um ponto de 01/06 00:00Z fica em junho mesmo em UTC-3
 * (acessores locais o jogariam pra maio).
 */
export function monthKeyUtc(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Chave de bucket anual: meia-noite UTC de 1º de janeiro do ano (UTC) do timestamp. */
export function yearKeyUtc(ts: number): number {
  return Date.UTC(new Date(ts).getUTCFullYear(), 0, 1);
}

/**
 * Remove o dia corrente (ponto intraday/parcial) de uma série UTC-midnight,
 * alinhando com a regra das Análises: o gráfico fecha no último dia fechado.
 * `keepIfOnlyToday` preserva a série quando ela só tem pontos de hoje
 * (carteiras novas), pra não zerar o gráfico.
 */
export function dropCurrentDayUtc<T extends { date: number }>(
  series: T[],
  keepIfOnlyToday = false,
): T[] {
  const today = todayUtcMidnight();
  const filtered = series.filter((p) => p.date < today);
  if (filtered.length === 0 && keepIfOnlyToday) return series;
  return filtered;
}
