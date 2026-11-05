import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: { irPgblSimulacao: { findUnique: vi.fn(), upsert: vi.fn() } },
  requireAuthWithActing: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));

import { GET, PUT } from '../route';

const req = (url: string, init?: RequestInit) =>
  new NextRequest(
    new URL(url, 'http://localhost'),
    init as ConstructorParameters<typeof NextRequest>[1],
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthWithActing.mockResolvedValue({ payload: { id: 'u1' }, targetUserId: 'u1' });
});

describe('/api/analises/ir-pgbl/simulacao', () => {
  it('GET sem simulação salva devolve campos e planos vazios', async () => {
    mocks.prisma.irPgblSimulacao.findUnique.mockResolvedValue(null);
    const res = await GET(req('/api/analises/ir-pgbl/simulacao?ano=2026'));
    expect(await res.json()).toEqual({ ano: 2026, campos: {}, planos: {}, salvoEm: null });
    expect(mocks.prisma.irPgblSimulacao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_ano: { userId: 'u1', ano: 2026 } } }),
    );
  });

  it('GET com ano inválido → 400', async () => {
    const res = await GET(req('/api/analises/ir-pgbl/simulacao?ano=abc'));
    expect(res.status).toBe(400);
  });

  it('PUT grava por usuário e ano (upsert)', async () => {
    mocks.prisma.irPgblSimulacao.upsert.mockResolvedValue({ updatedAt: new Date('2026-11-05') });
    const corpo = {
      ano: 2026,
      campos: { rendaTributavel: '120.000,00', inss: '9.000,00' },
      planos: { 'asset-1': { tipo: 'pgbl', regime: 'regressivo' } },
    };
    const res = await PUT(
      req('/api/analises/ir-pgbl/simulacao', { method: 'PUT', body: JSON.stringify(corpo) }),
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.irPgblSimulacao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_ano: { userId: 'u1', ano: 2026 } },
        create: { userId: 'u1', ...corpo },
        update: { campos: corpo.campos, planos: corpo.planos },
      }),
    );
  });

  it('PUT recusa campo desconhecido no plano e tipo inválido', async () => {
    const res = await PUT(
      req('/api/analises/ir-pgbl/simulacao', {
        method: 'PUT',
        body: JSON.stringify({ ano: 2026, campos: {}, planos: { a: { tipo: 'outro' } } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.irPgblSimulacao.upsert).not.toHaveBeenCalled();
  });
});
