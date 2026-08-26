import { describe, expect, it, vi } from 'vitest';

const mockResolve = vi.hoisted(() => vi.fn());
vi.mock('../resolveProventos', () => ({ resolveProventoEvents: mockResolve }));

import { aplicarProventosNosAtivos, proventosRecebidosPorSymbol } from '../proventosPorSymbol';

describe('proventosPorSymbol (auditoria 25/08 — B1/T2)', () => {
  it('soma o líquido dos eventos por ticker', async () => {
    mockResolve.mockResolvedValueOnce({
      events: [
        { symbol: 'XPML11', net: 100 },
        { symbol: 'XPML11', net: 50.5 },
        { symbol: 'HGLG11', net: 10 },
      ],
      total: 160.5,
    });
    const m = await proventosRecebidosPorSymbol('u1');
    expect(m.get('XPML11')).toBeCloseTo(150.5, 6);
    expect(m.get('HGLG11')).toBe(10);
    expect(m.get('VISC11')).toBeUndefined();
  });

  it('FII com queda de preço mas proventos fica positivo (caso T2)', () => {
    const ativos = [
      { ticker: 'XPML11', valorTotal: 45135, valorAtualizado: 49000, rentabilidade: 8.56 },
      { ticker: 'HGLG11', valorTotal: 37662, valorAtualizado: 29510, rentabilidade: -21.65 },
      { ticker: 'SEMPROV', valorTotal: 0, valorAtualizado: 0, rentabilidade: 0 },
    ];
    aplicarProventosNosAtivos(
      ativos,
      new Map([
        ['XPML11', 22895],
        ['HGLG11', 16994],
      ]),
    );
    expect(ativos[0].proventos).toBe(22895);
    expect(ativos[0].rentabilidade).toBeCloseTo(((49000 + 22895 - 45135) / 45135) * 100, 6);
    expect(ativos[1].rentabilidade).toBeGreaterThan(0);
    expect(ativos[2].proventos).toBe(0);
    expect(ativos[2].rentabilidade).toBe(0);
  });
});
