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
  it('exclui tipos share-based e mantém value-based', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { asset: { type: 'stock' } }, // acao -> excluído
      { asset: { type: 'fii' } }, // fii -> excluído
      { asset: { type: 'etf' } }, // etf -> excluído
      { asset: { type: 'reit' } }, // reit -> excluído
      { asset: { type: 'bdr' } }, // bdr -> excluído
      { asset: { type: 'bond' } }, // renda-fixa -> incluído
      { asset: { type: 'emergency' } }, // reserva -> incluído
      // Fase 2 + auditoria 2026-08-06 (achado #6): fundos/cripto/moedas são
      // share-based — crescem via Comprar, saem do aporte.
      { asset: { type: 'fund' } }, // fundo -> excluído
      { asset: { type: 'fia' } }, // fundo CVM -> excluído
      { asset: { type: 'crypto' } }, // cripto -> excluído
      { asset: { type: 'currency' } }, // moeda -> excluído
    ]);

    const res = await GET(req());
    const data = await res.json();
    const values = (data.tipos as { value: string }[]).map((t) => t.value);

    for (const shareBased of [
      'acao',
      'fii',
      'etf',
      'reit',
      'bdr',
      'fundo',
      'criptoativo',
      'moeda',
    ]) {
      expect(values).not.toContain(shareBased);
    }
    expect(values).toContain('renda-fixa');
    expect(values).toContain('reserva-emergencia');
  });

  it('previdência: fundo CVM (share-based) sai, seguro manual (insurance) continua aportável', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([{ asset: { type: 'previdencia' } }]);
    let data = await (await GET(req())).json();
    expect((data.tipos as { value: string }[]).map((t) => t.value)).not.toContain('previdencia');

    mockPrisma.portfolio.findMany.mockResolvedValue([{ asset: { type: 'insurance' } }]);
    data = await (await GET(req())).json();
    expect((data.tipos as { value: string }[]).map((t) => t.value)).toContain('previdencia');
  });
});
