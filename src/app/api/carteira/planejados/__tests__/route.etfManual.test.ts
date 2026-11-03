import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * ETF americano planejado (ticket 86e3fq1yh, fatia FA): no 'etf', manual SÓ com o sentinela
 * ETF-MANUAL; Asset etf/USD na seção 'estados_unidos'; guarda anti-B3; chave como interruptor.
 */
const mockPrisma = vi.hoisted(() => ({
  userChangeLog: { create: vi.fn() },
  asset: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  watchlist: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { POST } from '../route';

const auth = {
  payload: { id: 'user-1', email: 'test@test.com', role: 'user' },
  targetUserId: 'user-1',
  actingClient: null,
};

const post = (body: object) =>
  new NextRequest('http://localhost/api/carteira/planejados', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const chaveOriginal = process.env.CARTEIRA_EUA_DOLAR_HABILITADO;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthWithActing.mockResolvedValue(auth);
  mockPrisma.asset.findUnique.mockResolvedValue(null);
  mockPrisma.asset.findFirst.mockResolvedValue(null);
  mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'asset-novo', ...data }));
  mockPrisma.portfolio.findFirst.mockResolvedValue(null);
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
  mockPrisma.watchlist.create.mockImplementation(async ({ data }) => ({ id: 'plan-1', ...data }));
  process.env.CARTEIRA_EUA_DOLAR_HABILITADO = 'true';
});

afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
  else process.env.CARTEIRA_EUA_DOLAR_HABILITADO = chaveOriginal;
});

describe('POST /api/carteira/planejados — ETF americano (ETF-MANUAL)', () => {
  it('VOO com ETF-MANUAL cria Asset etf/USD/manual na seção estados_unidos', async () => {
    const res = await POST(
      // A seção do corpo é ignorada: ETF americano fica sempre na seção EUA.
      post({ tipoAtivo: 'etf', assetId: 'ETF-MANUAL', nome: 'voo', secao: 'brasil', objetivo: 7 }),
    );
    expect(res.status).toBe(201);
    const criado = mockPrisma.asset.create.mock.calls[0][0].data;
    expect(criado).toMatchObject({ name: 'VOO', type: 'etf', currency: 'USD', source: 'manual' });
    expect(criado.symbol).toMatch(/^VOO-\d{13}-[a-z0-9]+$/);
    expect(mockPrisma.watchlist.create.mock.calls[0][0].data).toMatchObject({
      assetId: 'asset-novo',
      secao: 'estados_unidos',
      objetivo: 7,
    });
  });

  it('ETF sem assetId dá 400 "Escolha um ativo do catálogo para planejar"', async () => {
    const res = await POST(post({ tipoAtivo: 'etf', nome: 'VOO' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Escolha um ativo do catálogo para planejar');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('ETF com sentinela de outro tipo (STOCK-MANUAL) não vira manual', async () => {
    const res = await POST(post({ tipoAtivo: 'etf', assetId: 'STOCK-MANUAL', nome: 'VOO' }));
    expect(res.status).toBe(404);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it.each(['IVVB11', 'ivvb11.sa'])('%s com ETF-MANUAL dá 400 (ETF da B3)', async (nome) => {
    mockPrisma.asset.findFirst.mockResolvedValueOnce({ id: 'asset-ivvb11' });
    const res = await POST(post({ tipoAtivo: 'etf', assetId: 'ETF-MANUAL', nome }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Este ETF é negociado na B3: escolha-o na busca');
    const where = mockPrisma.asset.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ type: { in: ['etf', 'etf-cvm'] }, currency: 'BRL' });
    expect(where.OR[0].symbol.equals).toBe('IVVB11');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('ETF-MANUAL sem ticker dá 400', async () => {
    const res = await POST(post({ tipoAtivo: 'etf', assetId: 'ETF-MANUAL' }));
    expect(res.status).toBe(400);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('400 com a chave CARTEIRA_EUA_DOLAR_HABILITADO desligada', async () => {
    delete process.env.CARTEIRA_EUA_DOLAR_HABILITADO;
    const res = await POST(post({ tipoAtivo: 'etf', assetId: 'ETF-MANUAL', nome: 'VOO' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ETF americano indisponível');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('409 quando o mesmo ETF americano já está planejado (prefixo, só etf em USD)', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValueOnce({
      id: 'plan-0',
      assetId: 'asset-voo',
      asset: { id: 'asset-voo', symbol: 'VOO-1-x' },
    });
    const res = await POST(post({ tipoAtivo: 'etf', assetId: 'ETF-MANUAL', nome: 'VOO' }));
    expect(res.status).toBe(409);
    expect(mockPrisma.watchlist.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      asset: { type: 'etf', source: 'manual', symbol: { startsWith: 'VOO-' }, currency: 'USD' },
    });
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('ETF manual por assetId real (de outro usuário) dá 403', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: 'asset-voo-outro',
      symbol: 'VOO-1730000000000-ab3cd11',
      name: 'VOO',
      type: 'etf',
      currency: 'USD',
      source: 'manual',
    });
    const res = await POST(post({ tipoAtivo: 'etf', assetId: 'asset-voo-outro' }));
    expect(res.status).toBe(403);
    expect(mockPrisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('IVVB11 do catálogo continua igual: seção escolhida (EUA) e sem guarda anti-B3', async () => {
    mockPrisma.asset.findUnique.mockResolvedValueOnce({
      id: 'asset-ivvb11',
      symbol: 'IVVB11',
      name: 'iShares S&P 500',
      type: 'etf',
      currency: 'BRL',
      source: 'brapi',
    });
    const res = await POST(
      post({ tipoAtivo: 'etf', assetId: 'asset-ivvb11', secao: 'estados_unidos' }),
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.asset.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        assetId: 'asset-ivvb11',
        objetivo: 0,
        secao: 'estados_unidos',
        notes: null,
      },
    });
  });
});
