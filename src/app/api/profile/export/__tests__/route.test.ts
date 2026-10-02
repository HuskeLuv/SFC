import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const teses = vi.fn();
  // Qualquer model: findMany → [], findUnique/findFirst → null (o user vem à parte).
  const generico = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
  });
  const models: Record<string, ReturnType<typeof generico>> = {};
  const prisma = new Proxy(
    {},
    {
      get: (_t, nome: string) => {
        if (nome === 'analiseTese') return { findMany: teses };
        models[nome] ??= generico();
        return models[nome];
      },
    },
  ) as Record<string, ReturnType<typeof generico>>;
  return { prisma, teses, requireAuthWithActing: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id: 'u1', role: 'user' },
    targetUserId: 'u1',
    actingClient: null,
  });
  mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@x', name: 'U' });
  mocks.teses.mockResolvedValue([
    { symbol: 'WEGE3', corpo: 'minha tese', visibilidade: 'privada' },
  ]);
});

describe('GET /api/profile/export (LGPD)', () => {
  it('inclui as teses da Análise de Ativos do usuário logado', async () => {
    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    expect(res.status).toBe(200);
    const corpo = JSON.parse(await res.text());
    expect(corpo.analiseAtivos.teses).toEqual([
      { symbol: 'WEGE3', corpo: 'minha tese', visibilidade: 'privada' },
    ]);
    expect(mocks.teses.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });
});
