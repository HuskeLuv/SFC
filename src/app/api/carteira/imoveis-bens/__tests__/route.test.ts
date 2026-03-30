import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '../route';

const createGetRequest = () =>
  new NextRequest('http://localhost/api/carteira/imoveis-bens', {
    method: 'GET',
  });

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/carteira/imoveis-bens', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('GET /api/carteira/imoveis-bens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-1',
      actingClient: null,
    });
  });

  it('retorna dados de imóveis e bens do usuário', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'port-1',
        userId: 'user-1',
        quantity: 1,
        avgPrice: 500000,
        totalInvested: 500000,
        assetId: 'asset-1',
        asset: { id: 'asset-1', name: 'Apartamento SP', type: 'imovel', symbol: 'IMOVEL-1' },
      },
    ]);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ativos).toBeDefined();
    expect(data.ativos.length).toBe(1);
    expect(data.ativos[0].nome).toBe('Apartamento SP');
    expect(data.resumo).toBeDefined();
    expect(data.totalGeral).toBeDefined();
  });

  it('retorna lista vazia quando não há imóveis', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ativos).toEqual([]);
  });

  it('retorna 404 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toContain('Usuário não encontrado');
  });

  it('retorna 401 quando não autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));
    const response = await GET(createGetRequest());
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });
});

describe('POST /api/carteira/imoveis-bens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria imóvel/bem com sucesso', async () => {
    const response = await POST(
      createPostRequest({
        ativoId: 'asset-1',
      }),
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('retorna 400 quando ativoId está ausente', async () => {
    const response = await POST(createPostRequest({}));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });

  it('retorna 400 quando ativoId é vazio', async () => {
    const response = await POST(createPostRequest({ ativoId: '' }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain('Dados inválidos');
  });
});
