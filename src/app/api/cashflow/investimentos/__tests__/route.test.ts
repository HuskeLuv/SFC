import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: vi.fn().mockResolvedValue(undefined),
}));

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/cashflow/investimentos');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/cashflow/investimentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
  });

  it('retorna investimentos agrupados por tipo para o ano', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-123',
        type: 'compra',
        date: new Date('2026-03-15'),
        total: 1000,
        fees: 10,
        asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
      },
      {
        id: 'tx-2',
        userId: 'user-123',
        type: 'compra',
        date: new Date('2026-03-20'),
        total: 500,
        fees: 5,
        stock: null,
        asset: { type: 'crypto' },
      },
    ]);

    const response = await GET(createRequest({ year: '2026' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.investimentos).toBeDefined();
    expect(Array.isArray(data.investimentos)).toBe(true);
    expect(data.totaisPorMes).toBeDefined();
    expect(typeof data.totalGeral).toBe('number');
    expect(data.totalGeral).toBeGreaterThan(0);
  });

  it('filtra por ano via query param', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-123',
        type: 'compra',
        date: new Date('2025-06-01'),
        total: 2000,
        fees: 0,
        asset: { symbol: 'VALE3', name: 'VALE3', type: 'stock' },
      },
    ]);

    const response = await GET(createRequest({ year: '2025' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    // Transaction is in 2025, should appear in totals
    expect(data.totalGeral).toBeGreaterThan(0);
  });

  it('retorna 401 quando nao autenticado', async () => {
    mockRequireAuthWithActing.mockRejectedValueOnce(new Error('Não autorizado'));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Não autorizado');
  });

  it('retorna dados vazios quando nao ha transacoes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalGeral).toBe(0);
    expect(data.quantidadeTipos).toBe(0);
    expect(data.totaisPorMes.every((v: number) => v === 0)).toBe(true);
  });

  describe('F1.10 — reinvestimento de proventos segregado', () => {
    const reinvestimentoNotes = JSON.stringify({
      operation: { action: 'reinvestimento' },
    });
    const compraNotes = JSON.stringify({
      operation: { action: 'compra' },
    });

    it('exclui reinvestimentos da soma de aportes (totaisPorMes/totalGeral)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-aporte',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-03-15'),
          total: 1000,
          fees: 0,
          notes: compraNotes,
          asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
        },
        {
          id: 'tx-reinv',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-03-20'),
          total: 250,
          fees: 0,
          notes: reinvestimentoNotes,
          asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
        },
      ]);

      const response = await GET(createRequest({ year: '2026' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      // Aporte normal entra; reinvestimento não.
      expect(data.totalGeral).toBe(1000);
      // Coluna "Ações" só conta o aporte.
      const acoes = data.investimentos.find((i: { id: string }) => i.id === 'investimento-stock');
      expect(acoes.totalAnual).toBe(1000);
    });

    it('retorna reinvestimentos em estrutura paralela com totalReinvestimentos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-reinv-1',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-03-20'),
          total: 250,
          fees: 0,
          notes: reinvestimentoNotes,
          asset: { symbol: 'PETR4', name: 'PETR4', type: 'stock' },
        },
        {
          id: 'tx-reinv-2',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-04-10'),
          total: 100,
          fees: 0,
          notes: reinvestimentoNotes,
          asset: { symbol: 'HGLG11', name: 'HGLG11', type: 'fii' },
        },
      ]);

      const response = await GET(createRequest({ year: '2026' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reinvestimentos).toBeDefined();
      expect(Array.isArray(data.reinvestimentos)).toBe(true);
      expect(data.reinvestimentos[0].name).toBe('Reinvestimentos de Proventos');
      expect(data.totalReinvestimentos).toBe(350);
      // Março = 250, Abril = 100, demais = 0
      expect(data.totaisReinvestimentosPorMes[2]).toBe(250);
      expect(data.totaisReinvestimentosPorMes[3]).toBe(100);
      expect(data.totaisReinvestimentosPorMes[0]).toBe(0);
      // Aporte normal sigue zero
      expect(data.totalGeral).toBe(0);
    });

    it('considera reinvestimento independente do tipo de ativo subjacente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-reinv-etf',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-05-15'),
          total: 500,
          fees: 0,
          notes: reinvestimentoNotes,
          asset: { symbol: 'BOVA11', name: 'BOVA11', type: 'etf' },
        },
      ]);

      const response = await GET(createRequest({ year: '2026' }));
      const data = await response.json();

      // ETF não recebe esse reinvestimento — bucket dedicado é o único que conta
      const etf = data.investimentos.find((i: { id: string }) => i.id === 'investimento-etf');
      expect(etf.totalAnual).toBe(0);
      expect(data.totalReinvestimentos).toBe(500);
    });

    it('trata notes ausentes/inválidos como compra normal', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.stockTransaction.findMany.mockResolvedValue([
        {
          id: 'tx-sem-notes',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-06-01'),
          total: 800,
          fees: 0,
          notes: null,
          asset: { symbol: 'VALE3', name: 'VALE3', type: 'stock' },
        },
        {
          id: 'tx-notes-broken',
          userId: 'user-123',
          type: 'compra',
          date: new Date('2026-06-15'),
          total: 200,
          fees: 0,
          notes: '{not json',
          asset: { symbol: 'ITUB4', name: 'ITUB4', type: 'stock' },
        },
      ]);

      const response = await GET(createRequest({ year: '2026' }));
      const data = await response.json();

      expect(data.totalGeral).toBe(1000);
      expect(data.totalReinvestimentos).toBe(0);
    });
  });
});
