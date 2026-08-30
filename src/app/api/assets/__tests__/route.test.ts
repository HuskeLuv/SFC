import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  asset: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET } from '../route';

const req = (qs: string) => new NextRequest(`http://localhost/api/assets?${qs}`);

/**
 * Auditoria de segurança 29/08/2026 (achado 1.1): a tabela Asset também guarda
 * ativos manuais (nome/valor/data digitados pelo usuário). O autocomplete de
 * catálogo nunca pode listá-los, e `limit` precisa de teto.
 */
describe('GET /api/assets — catálogo sem ativos manuais', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ramo genérico (sem tipo) exclui source=manual', async () => {
    await GET(req('search=apartamento'));
    const where = mockPrisma.asset.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"source":{"not":"manual"}');
  });

  it('tipo=debenture (bond) exclui source=manual', async () => {
    await GET(req('tipo=debenture'));
    const where = mockPrisma.asset.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ source: { not: 'manual' }, type: 'bond' });
  });

  it('limit é limitado a 100 e nunca menor que 1', async () => {
    await GET(req('limit=5000'));
    expect(mockPrisma.asset.findMany.mock.calls[0][0].take).toBe(100);
    await GET(req('limit=abc'));
    expect(mockPrisma.asset.findMany.mock.calls[1][0].take).toBe(20);
  });
});
