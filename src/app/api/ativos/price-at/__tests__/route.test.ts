import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  assetPriceHistory: { findFirst: vi.fn() },
  assetCorporateAction: { findMany: vi.fn().mockResolvedValue([]) },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET } from '../route';

const req = (qs: string) => new NextRequest(`http://localhost/api/ativos/price-at?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.assetCorporateAction.findMany.mockResolvedValue([]);
});

describe('GET /api/ativos/price-at (#3 / D.3 checklist mai/28)', () => {
  it('retorna fechamento exato quando registro existe na data', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2022-05-11T00:00:00Z'),
      price: 27.5,
      source: 'B3_COTAHIST',
    });

    const res = await GET(req('symbol=PETR4&date=2022-05-11'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      symbol: 'PETR4',
      date: '2022-05-11',
      effectiveDate: '2022-05-11',
      price: 27.5,
      source: 'B3_COTAHIST',
    });
  });

  it('des-ajusta o preço pra cru quando houve split APÓS a data (sem falso alerta)', async () => {
    // Preço armazenado é split-adjusted (~6); na data pré-split o cru era ~60.
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2024-06-15T00:00:00Z'),
      price: 6.0,
      source: 'BRAPI',
    });
    // split 10:1 em 2025-05-12 (depois da data) → fator 10
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      { date: new Date('2025-05-12T00:00:00Z'), factor: 10 },
    ]);

    const res = await GET(req('symbol=HFOF11&date=2024-06-15'));
    const data = await res.json();
    expect(data.price).toBeCloseTo(60, 5); // 6 × 10 = preço cru daquele dia
  });

  it('NÃO altera o preço quando o split é ANTERIOR à data', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2025-08-01T00:00:00Z'),
      price: 6.0,
      source: 'BRAPI',
    });
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      { date: new Date('2025-05-12T00:00:00Z'), factor: 10 },
    ]);

    const res = await GET(req('symbol=HFOF11&date=2025-08-01'));
    const data = await res.json();
    expect(data.price).toBeCloseTo(6, 5); // split antes → já na escala certa
  });

  it('faz fallback pro fechamento mais recente anterior quando data exata não tem', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2022-05-10T00:00:00Z'),
      price: 26.8,
      source: 'B3_COTAHIST',
    });

    const res = await GET(req('symbol=PETR4&date=2022-05-11'));
    const data = await res.json();
    expect(data.effectiveDate).toBe('2022-05-10');
    expect(data.date).toBe('2022-05-11');
  });

  it('404 quando não há histórico na janela de 30 dias', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);

    const res = await GET(req('symbol=PETR4&date=2022-05-11'));
    expect(res.status).toBe(404);
  });

  it('400 quando symbol está ausente', async () => {
    const res = await GET(req('date=2022-05-11'));
    expect(res.status).toBe(400);
  });

  it('400 quando date está em formato inválido', async () => {
    const res = await GET(req('symbol=PETR4&date=11/05/2022'));
    expect(res.status).toBe(400);
  });

  it('normaliza symbol pra uppercase', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2022-05-11T00:00:00Z'),
      price: 27.5,
      source: 'B3_COTAHIST',
    });
    await GET(req('symbol=petr4&date=2022-05-11'));
    expect(mockPrisma.assetPriceHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ symbol: 'PETR4' }) }),
    );
  });
});
