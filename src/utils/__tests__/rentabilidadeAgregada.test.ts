import { describe, expect, it } from 'vitest';
import { rentabilidadeAgregada } from '../rentabilidadeAgregada';

describe('rentabilidadeAgregada (auditoria 25/08 — B2/T1)', () => {
  it('pondera pelo capital, não média simples: Ações 522,51%, não 499,48%', () => {
    const ativos = [
      { valorTotal: 29050, valorAtualizado: 81840 }, // CSMG3 181,72%
      { valorTotal: 33590, valorAtualizado: 308100 }, // PRIO3 817,24%
    ];
    const r = rentabilidadeAgregada(
      ativos,
      (a) => a.valorTotal,
      (a) => a.valorAtualizado,
    );
    expect(r).toBeCloseTo(522.51, 2);
  });

  it('RF híbrida: 161,10% (Σatual/Σinicial − 1)', () => {
    const r = rentabilidadeAgregada(
      [
        { ini: 50000, atual: 116545.4 },
        { ini: 35000, atual: 105391.02 },
      ],
      (a) => a.ini,
      (a) => a.atual,
    );
    expect(r).toBeCloseTo(161.1, 2);
  });

  it('ignora linhas sem base (aplicado ≤ 0) e devolve 0 sem capital', () => {
    expect(
      rentabilidadeAgregada(
        [],
        () => 0,
        () => 0,
      ),
    ).toBe(0);
    expect(
      rentabilidadeAgregada(
        [
          { a: 0, v: 100 },
          { a: 100, v: 110 },
        ],
        (x) => x.a,
        (x) => x.v,
      ),
    ).toBeCloseTo(10, 6);
  });
});
