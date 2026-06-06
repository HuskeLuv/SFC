import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({ targetUserId: 'user-1' }),
}));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/carteira/aporte/tipos');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/carteira/aporte/tipos', () => {
  it('exclui tipos share-based (ação/FII/ETF/REIT/BDR) e mantém value-based', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { asset: { type: 'stock' } }, // acao -> excluído
      { asset: { type: 'fii' } }, // fii -> excluído
      { asset: { type: 'etf' } }, // etf -> excluído
      { asset: { type: 'reit' } }, // reit -> excluído
      { asset: { type: 'bdr' } }, // bdr -> excluído
      { asset: { type: 'bond' } }, // renda-fixa -> incluído
      { asset: { type: 'emergency' } }, // reserva -> incluído
      { asset: { type: 'fund' } }, // fundo -> incluído (até Fase 2)
    ]);

    const res = await GET(req());
    const data = await res.json();
    const values = (data.tipos as { value: string }[]).map((t) => t.value);

    for (const equity of ['acao', 'fii', 'etf', 'reit', 'bdr']) {
      expect(values).not.toContain(equity);
    }
    expect(values).toContain('renda-fixa');
    expect(values).toContain('reserva-emergencia');
    expect(values).toContain('fundo');
  });
});
