import { describe, expect, it } from 'vitest';
import { niceStep, scale, ticks } from '../graficos/escala';

/** Cópia literal das funções do protótipo do Pedro (relatorio-pedro.html), para comparar. */
function niceStepPedro(range: number, n: number) {
  const raw = range / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const k = raw / p;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * p;
}
function scalePedro(minV: number, maxV: number, n = 4) {
  if (maxV === minV) {
    maxV = minV + 1;
  }
  const st = niceStepPedro(maxV - minV, n);
  const lo = Math.floor(minV / st) * st;
  const hi = Math.ceil(maxV / st) * st;
  const t = [];
  for (let v = lo; v <= hi + st / 2; v += st) t.push(+v.toFixed(10));
  return { lo, hi, t };
}

describe('escala (igual ao protótipo)', () => {
  it('niceStep', () => {
    expect(niceStep(100, 4)).toBe(25);
    expect(niceStep(1000, 4)).toBe(250);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(30, 4)).toBe(10);
  });

  it('scale bate com o protótipo em vários intervalos', () => {
    const casos: [number, number][] = [
      [0, 50000],
      [0, 1173751.92],
      [-3.2, 12.7],
      [0, 0],
      [1.061, 1.061],
      [-1200, 4800],
    ];
    for (const [a, b] of casos) expect(scale(a, b)).toEqual(scalePedro(a, b));
    expect(scale(0, 50000)).toEqual({ lo: 0, hi: 60000, t: [0, 20000, 40000, 60000] });
  });

  it('ticks', () => {
    const l = ['a', 'b', 'c'];
    expect(ticks(l)).toEqual([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ]);
    const doze = Array.from({ length: 12 }, (_, i) => `m${i}`);
    expect(ticks(doze, 4)).toEqual([
      [0, 'm0'],
      [4, 'm4'],
      [8, 'm8'],
      [11, 'm11'],
    ]);
    expect(ticks(doze, 7).map(([i]) => i)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});
