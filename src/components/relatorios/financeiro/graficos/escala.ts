/**
 * Escalas dos gráficos: porte 1:1 de niceStep/scale/ticks do protótipo do Pedro.
 */

/** Passo "redondo" (1, 2, 2,5, 5 ou 10 × 10^k) para ~n divisões de `range`. */
export function niceStep(range: number, n: number): number {
  const raw = range / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const k = raw / p;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p;
}

export interface Escala {
  lo: number;
  hi: number;
  /** Marcas do eixo, de lo a hi. */
  t: number[];
}

/** Escala de minV a maxV com ~n divisões redondas. */
export function scale(minV: number, maxV: number, n = 4): Escala {
  if (maxV === minV) maxV = minV + 1;
  const st = niceStep(maxV - minV, n);
  const lo = Math.floor(minV / st) * st;
  const hi = Math.ceil(maxV / st) * st;
  const t: number[] = [];
  for (let v = lo; v <= hi + st / 2; v += st) t.push(+v.toFixed(10));
  return { lo, hi, t };
}

/** Rótulos do eixo x: até `max` marcas, incluindo a última quando cabe. Pares [índice, rótulo]. */
export function ticks(labels: readonly string[], max = 7): [number, string][] {
  const n = labels.length;
  if (n <= max) return labels.map((l, i) => [i, l]);
  const st = Math.ceil((n - 1) / (max - 1));
  const out: [number, string][] = [];
  for (let i = 0; i < n; i += st) out.push([i, labels[i]]);
  if (out[out.length - 1][0] !== n - 1 && n - 1 - out[out.length - 1][0] > st / 2) {
    out.push([n - 1, labels[n - 1]]);
  }
  return out;
}
