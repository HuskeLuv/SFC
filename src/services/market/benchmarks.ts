/**
 * Retorno dos benchmarks (CDI, IPCA, Ibovespa) numa janela. Puro.
 *
 * Saiu de /api/analises/rentabilidade-janelas sem mudar a lógica; o Relatório financeiro (seção
 * 4b) usa as mesmas funções e as séries acumuladas abaixo.
 *
 *  - CDI e IPCA vêm de economicIndex como FATOR por registro (fração: 0.000551 = 0,0551% no dia;
 *    o IPCA é mensal, gravado no 1º dia do mês, então a série acumulada anda em degrau).
 *  - Ibovespa é série de PREÇO (getAssetHistory('^BVSP')).
 */

/** Retorno acumulado a partir de fatores diários (CDI/IPCA) entre [fromMs, toMs]. */
export function compoundReturnPct(
  records: Array<{ date: Date; value: unknown }>,
  fromMs: number,
  toMs: number,
): number {
  if (toMs <= fromMs) return 0;
  let acumulado = 1;
  for (const r of records) {
    const ts = r.date.getTime();
    if (ts < fromMs || ts > toMs) continue;
    acumulado *= 1 + Number(r.value);
  }
  return (acumulado - 1) * 100;
}

/**
 * Retorno de uma série de cotações (preço) entre fromMs e toMs.
 * Usa o último preço <= fromMs como ponto de partida (mesmo binary-search-like
 * fallback usado em twrAt). Útil para IBOV onde temos cotação diária, não fator.
 */
export function priceSeriesReturnPct(
  serie: Array<{ date: number; value: number }>,
  fromMs: number,
  toMs: number,
): number {
  if (serie.length < 2) return 0;
  // Find latest price <= fromMs
  let priceFrom: number | null = null;
  let priceTo: number | null = null;
  for (const p of serie) {
    if (p.date <= fromMs && p.value > 0) priceFrom = p.value;
    if (p.date <= toMs && p.value > 0) priceTo = p.value;
  }
  if (priceFrom === null || priceTo === null || priceFrom <= 0) return 0;
  return (priceTo / priceFrom - 1) * 100;
}

/**
 * Série acumulada (em %) de fatores, começando em 0 na base: o ponto `i` compõe os registros com
 * data em (baseMs, datasMs[i]]. `datasMs` em ordem crescente.
 */
export function serieAcumuladaFatoresPct(
  records: Array<{ date: Date; value: unknown }>,
  baseMs: number,
  datasMs: number[],
): number[] {
  const ordenados = records
    .map((r) => ({ ts: r.date.getTime(), v: Number(r.value) }))
    .filter((r) => r.ts > baseMs && Number.isFinite(r.v))
    .sort((a, b) => a.ts - b.ts);
  const out: number[] = [];
  let acumulado = 1;
  let k = 0;
  for (const d of datasMs) {
    while (k < ordenados.length && ordenados[k].ts <= d) {
      acumulado *= 1 + ordenados[k].v;
      k += 1;
    }
    out.push((acumulado - 1) * 100);
  }
  return out;
}

/**
 * Série acumulada (em %) de preços em relação ao último preço <= baseMs. Sem preço na base, usa o
 * primeiro preço da série dentro da janela; sem preço nenhum, null em todos os pontos.
 */
export function serieAcumuladaPrecoPct(
  serie: Array<{ date: number; value: number }>,
  baseMs: number,
  datasMs: number[],
): Array<number | null> {
  const validos = serie.filter((p) => p.value > 0).sort((a, b) => a.date - b.date);
  let base: number | null = null;
  for (const p of validos) {
    if (p.date <= baseMs) base = p.value;
    else break;
  }
  if (base === null) base = validos.find((p) => p.date > baseMs)?.value ?? null;
  if (base === null) return datasMs.map(() => null);
  const out: Array<number | null> = [];
  let k = 0;
  let ultimo: number | null = null;
  for (const d of datasMs) {
    while (k < validos.length && validos[k].date <= d) {
      ultimo = validos[k].value;
      k += 1;
    }
    out.push(ultimo === null ? 0 : (ultimo / base - 1) * 100);
  }
  return out;
}
