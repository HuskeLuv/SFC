import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockPrisma = vi.hoisted(() => ({
  csatResposta: { groupBy: vi.fn(), findMany: vi.fn() },
}));
const mockRequireAdmin = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAdmin: mockRequireAdmin }));

import { GET } from '../route';
import { resumirCsat } from '@/services/admin/csat';

const req = (qs = '') => new NextRequest(`http://localhost/api/admin/csat${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' });
  mockPrisma.csatResposta.groupBy.mockResolvedValue([
    { nota: 5, _count: { _all: 3 } },
    { nota: 4, _count: { _all: 1 } },
    { nota: 1, _count: { _all: 1 } },
  ]);
  mockPrisma.csatResposta.findMany.mockResolvedValue([
    {
      id: 'r1',
      nota: 5,
      comentario: 'Muito bom',
      origem: 'app',
      createdAt: new Date('2026-11-02T10:00:00.000Z'),
      user: { id: 'u1', name: 'Ana', email: 'ana@x' },
    },
  ]);
});

describe('GET /api/admin/csat', () => {
  it('403 para quem não é admin', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw new ApiError(403, 'Acesso negado');
    });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mockPrisma.csatResposta.findMany).not.toHaveBeenCalled();
  });

  it('401 sem sessão', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Não autorizado'));
    expect((await GET(req())).status).toBe(401);
  });

  it('devolve resumo e lista, sem cache, só respostas com nota', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.resumo).toEqual({
      respostas: 5,
      media: 4,
      distribuicao: { '1': 1, '2': 0, '3': 0, '4': 1, '5': 3 },
      promotores: 3,
      pctPromotores: 60,
    });
    expect(body.itens).toEqual([
      {
        id: 'r1',
        data: '2026-11-02T10:00:00.000Z',
        nota: 5,
        comentario: 'Muito bom',
        origem: 'app',
        cliente: { id: 'u1', nome: 'Ana', email: 'ana@x' },
      },
    ]);
    const where = mockPrisma.csatResposta.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ nota: { not: null } });
    expect(mockPrisma.csatResposta.findMany.mock.calls[0][0].take).toBe(200);
  });

  it('filtra período com "ate" inclusive e limita a lista', async () => {
    await GET(req('?de=2026-10-01&ate=2026-10-31&limite=5000'));
    const args = mockPrisma.csatResposta.findMany.mock.calls[0][0];
    expect(args.where.createdAt).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(args.take).toBe(1000);
  });

  it('400 para data fora do formato', async () => {
    expect((await GET(req('?de=01/10/2026'))).status).toBe(400);
  });
});

describe('resumirCsat', () => {
  it('sem respostas: média e % nulos', () => {
    expect(resumirCsat([])).toMatchObject({ respostas: 0, media: null, pctPromotores: null });
  });

  it('arredonda média em 2 casas e % em 1 casa', () => {
    const r = resumirCsat([
      { nota: 5, quantidade: 1 },
      { nota: 4, quantidade: 1 },
      { nota: 4, quantidade: 1 },
    ]);
    expect(r.media).toBe(4.33);
    expect(r.pctPromotores).toBe(33.3);
  });
});
