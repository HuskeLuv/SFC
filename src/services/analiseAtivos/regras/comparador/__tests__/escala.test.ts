import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { montarEscalaBase100, serieLucroAcao, serieVpCotaFii } from '../escala';

describe('escala base 100 do Comparador', () => {
  it('base no 1º ano > 0 e mesma escala para todos', () => {
    const r = montarEscalaBase100(
      [
        {
          ticker: 'A',
          pontos: [2016, 2017, 2018].map((ano, i) => ({ ano, valor: [10, 20, 57.1][i] })),
        },
        { ticker: 'B', pontos: [2016, 2017, 2018].map((ano, i) => ({ ano, valor: [5, 4, 6][i] })) },
      ],
      2026,
    );
    expect(r.anos).toEqual([2016, 2017, 2018]);
    expect(r.series[0].pontos).toEqual([100, 200, 571]);
    expect(r.series[1].pontos).toEqual([100, 80, 120]);
    expect(r.escala).toEqual({ min: 80, max: 571 });
  });

  it('prejuízo fica abaixo de zero; anos antes da base = null', () => {
    const r = montarEscalaBase100(
      [
        {
          ticker: 'A',
          pontos: [
            { ano: 2019, valor: -3 },
            { ano: 2020, valor: 2 },
            { ano: 2021, valor: -1 },
            { ano: 2022, valor: 4 },
          ],
        },
      ],
      2026,
    );
    expect(r.series[0].pontos).toEqual([null, 100, -50, 200]);
    expect(r.escala.min).toBe(-50);
  });

  it('min nunca acima de 100, max nunca abaixo de 100; ano corrente fora; até 10 anos', () => {
    const pontos = Array.from({ length: 13 }, (_, i) => ({ ano: 2014 + i, valor: 100 + i }));
    const r = montarEscalaBase100([{ ticker: 'A', pontos }], 2026);
    expect(r.anos).toHaveLength(10);
    expect(r.anos.at(-1)).toBe(2025);
    expect(r.escala.min).toBe(100);
  });

  it('menos de 3 pontos ⇒ insuficiente', () => {
    const r = montarEscalaBase100(
      [
        {
          ticker: 'A',
          pontos: [
            { ano: 2024, valor: 1 },
            { ano: 2025, valor: 2 },
          ],
        },
      ],
      2026,
    );
    expect(r.series[0].insuficiente).toBe(true);
  });

  it('ano com escala em conferência sai do lucro, marcado', () => {
    const p = serieLucroAcao(
      [
        { ano: 2023, valor: 1 },
        { ano: 2024, valor: 1000 },
      ],
      new Set([2024]),
    );
    expect(p[1]).toEqual({ ano: 2024, valor: null, emConferencia: true });
  });

  it('HGLG11: VP/cota sem o salto do desdobramento de 2018 (base de cotas de hoje)', () => {
    const pontos = serieVpCotaFii(
      [
        { anoFiscal: 2017, vpCotaFim: 1127.27, flags: [] },
        { anoFiscal: 2018, vpCotaFim: 115.0, flags: [] },
        { anoFiscal: 2019, vpCotaFim: 120.0, flags: [] },
      ],
      [{ refMonth: '2018-03-01', fator: 10 }],
    );
    expect(pontos[0].valor).toBeCloseTo(112.727, 2);
    const r = montarEscalaBase100([{ ticker: 'HGLG11', pontos }], 2026);
    expect(r.series[0].pontos[1]).toBeCloseTo(102, 0);
    expect(r.escala.max).toBeLessThan(110);
  });

  it('ano com salto per-share (decisão 1) = null em conferência', () => {
    const pontos = serieVpCotaFii(
      [
        {
          anoFiscal: 2020,
          vpCotaFim: 9999,
          flags: ['salto_acoes_sem_evento', 'dados_incompletos'],
        },
      ],
      [],
    );
    expect(pontos[0]).toEqual({ ano: 2020, valor: null, emConferencia: true });
  });
});
