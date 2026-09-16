import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  // Histórico de alterações (recordChange importa prisma como default export).
  userChangeLog: { create: vi.fn() },
  asset: { findUnique: vi.fn(), create: vi.fn() },
  portfolio: { findFirst: vi.fn() },
  watchlist: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';

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

const reqId = (method: string, body?: object) =>
  new NextRequest('http://localhost/api/carteira/planejados/plan-1', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const ctx = { params: Promise.resolve({ id: 'plan-1' }) };

describe('POST /api/carteira/planejados (ativo planejado, sem posição)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue(auth);
    mockPrisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      type: 'stock',
      symbol: 'VALE3',
    });
    mockPrisma.portfolio.findFirst.mockResolvedValue(null);
    mockPrisma.watchlist.findFirst.mockResolvedValue(null);
    mockPrisma.watchlist.create.mockImplementation(async ({ data }) => ({ id: 'plan-1', ...data }));
  });

  it('cria o planejado com objetivo e seção na aba Ações', async () => {
    const res = await POST(
      post({ assetId: 'asset-1', tipoAtivo: 'acao', secao: 'growth', objetivo: 5 }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.planejado).toMatchObject({ assetId: 'asset-1', objetivo: 5, secao: 'growth' });
    expect(mockPrisma.watchlist.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', assetId: 'asset-1', objetivo: 5, secao: 'growth', notes: null },
    });
  });

  it('seção ausente cai na primeira da aba; moedas/cripto não têm seção', async () => {
    const r1 = await POST(post({ assetId: 'asset-1', tipoAtivo: 'acao' }));
    expect(r1.status).toBe(201);
    expect(mockPrisma.watchlist.create.mock.calls[0][0].data).toMatchObject({
      secao: 'value',
      objetivo: 0,
    });

    mockPrisma.asset.findUnique.mockResolvedValue({
      id: 'asset-btc',
      type: 'crypto',
      symbol: 'BTC',
    });
    const r2 = await POST(post({ assetId: 'asset-btc', tipoAtivo: 'criptoativo', secao: 'x' }));
    expect(r2.status).toBe(201);
    expect(mockPrisma.watchlist.create.mock.calls[1][0].data).toMatchObject({ secao: null });
  });

  it('rejeita tipo que ainda não pode ser planejado (stock manual)', async () => {
    const res = await POST(post({ assetId: 'asset-1', tipoAtivo: 'stock' }));
    expect(res.status).toBe(400);
    expect(mockPrisma.watchlist.create).not.toHaveBeenCalled();
  });

  it('rejeita ativo de outra aba e seção inválida', async () => {
    const r1 = await POST(post({ assetId: 'asset-1', tipoAtivo: 'fii' }));
    expect(r1.status).toBe(400);
    const r2 = await POST(post({ assetId: 'asset-1', tipoAtivo: 'acao', secao: 'tijolo' }));
    expect(r2.status).toBe(400);
  });

  it('409 quando o ativo já é posição ou já está planejado', async () => {
    mockPrisma.portfolio.findFirst.mockResolvedValueOnce({ id: 'port-1' });
    const r1 = await POST(post({ assetId: 'asset-1', tipoAtivo: 'acao' }));
    expect(r1.status).toBe(409);

    mockPrisma.watchlist.findFirst.mockResolvedValueOnce({ id: 'plan-1' });
    const r2 = await POST(post({ assetId: 'asset-1', tipoAtivo: 'acao' }));
    expect(r2.status).toBe(409);
  });

  it('400 em objetivo fora de 0..100 e 404 em ativo inexistente', async () => {
    const r1 = await POST(post({ assetId: 'asset-1', tipoAtivo: 'acao', objetivo: 150 }));
    expect(r1.status).toBe(400);
    mockPrisma.asset.findUnique.mockResolvedValueOnce(null);
    const r2 = await POST(post({ assetId: 'nope', tipoAtivo: 'acao' }));
    expect(r2.status).toBe(404);
  });
});

describe('POST /api/carteira/planejados — ativos MANUAIS (fase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue(auth);
    mockPrisma.watchlist.findFirst.mockResolvedValue(null);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'asset-novo', ...data }));
    mockPrisma.watchlist.create.mockImplementation(async ({ data }) => ({ id: 'plan-2', ...data }));
  });

  it('stock: cria o Asset (USD, manual, símbolo TICKER-<ts>-<rnd>) a partir do ticker', async () => {
    const res = await POST(
      post({
        tipoAtivo: 'stock',
        assetId: 'STOCK-MANUAL',
        nome: 'aapl',
        secao: 'growth',
        objetivo: 30,
      }),
    );
    expect(res.status).toBe(201);
    const criado = mockPrisma.asset.create.mock.calls[0][0].data;
    expect(criado).toMatchObject({
      name: 'AAPL',
      type: 'stock',
      currency: 'USD',
      source: 'manual',
    });
    expect(criado.symbol).toMatch(/^AAPL-\d+-[a-z0-9]+$/);
    expect(mockPrisma.watchlist.create.mock.calls[0][0].data).toMatchObject({
      assetId: 'asset-novo',
      secao: 'growth',
      objetivo: 30,
    });
  });

  it('fundo manual: Asset type fund em BRL, seção = subtipo escolhido', async () => {
    const res = await POST(
      post({ tipoAtivo: 'fundo', assetId: 'FUNDO-MANUAL', nome: 'Fundo XP Macro', secao: 'fia' }),
    );
    expect(res.status).toBe(201);
    const criado = mockPrisma.asset.create.mock.calls[0][0].data;
    expect(criado).toMatchObject({ name: 'Fundo XP Macro', type: 'fund', currency: 'BRL' });
    expect(criado.symbol).toMatch(/^FUNDO-FUNDO-XP-MACRO-\d+-/);
    expect(mockPrisma.watchlist.create.mock.calls[0][0].data.secao).toBe('fia');
  });

  it('409 quando já existe planejado manual com o mesmo ticker (prefixo do símbolo)', async () => {
    mockPrisma.watchlist.findFirst.mockResolvedValueOnce({
      id: 'plan-1',
      assetId: 'asset-1',
      asset: { id: 'asset-1', symbol: 'AAPL-1-x' },
    });
    const res = await POST(post({ tipoAtivo: 'stock', assetId: 'STOCK-MANUAL', nome: 'AAPL' }));
    expect(res.status).toBe(409);
    expect(mockPrisma.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          asset: { type: 'stock', source: 'manual', symbol: { startsWith: 'AAPL-' } },
        },
      }),
    );
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('previdência: só catálogo — seguro manual é 400; sem nome em manual é 400', async () => {
    const r1 = await POST(
      post({ tipoAtivo: 'previdencia', assetId: 'SEGURO-MANUAL', nome: 'Seguro' }),
    );
    expect(r1.status).toBe(400);
    const r2 = await POST(post({ tipoAtivo: 'reit', assetId: 'REIT-MANUAL' }));
    expect(r2.status).toBe(400);
  });
});

describe('PATCH/DELETE /api/carteira/planejados/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue(auth);
    mockPrisma.watchlist.findFirst.mockResolvedValue({
      id: 'plan-1',
      userId: 'user-1',
      objetivo: 5,
    });
    mockPrisma.watchlist.update.mockImplementation(async ({ data }) => ({ id: 'plan-1', ...data }));
  });

  it('PATCH altera o objetivo do planejado do próprio usuário', async () => {
    const res = await PATCH(reqId('PATCH', { objetivo: 12.5 }), ctx);
    expect(res.status).toBe(200);
    expect(mockPrisma.watchlist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1', userId: 'user-1' } }),
    );
    expect(mockPrisma.watchlist.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { objetivo: 12.5 },
    });
  });

  it('DELETE remove o planejado; 404 quando não é do usuário', async () => {
    const ok = await DELETE(reqId('DELETE'), ctx);
    expect(ok.status).toBe(200);
    expect(mockPrisma.watchlist.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });

    mockPrisma.watchlist.findFirst.mockResolvedValueOnce(null);
    const nf = await DELETE(reqId('DELETE'), ctx);
    expect(nf.status).toBe(404);
  });
});
