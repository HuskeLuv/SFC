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

  // Ticket 24/08 (PRIO3/CSMG3 vs Gorila): linha do COTAHIST já é CRUA — multiplicar
  // pelos eventos posteriores dobra o ajuste (33,59 virava sugestão de 167,95 e o
  // aporte ficava 5× o real).
  it('NÃO des-ajusta linha de fonte CRUA (COTAHIST) mesmo com split posterior', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2020-06-02T00:00:00Z'),
      price: 33.59,
      source: 'B3_COTAHIST',
    });
    // split 5:1 em 2021-05-06 (depois da data) — não deve multiplicar
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      { date: new Date('2021-05-06T00:00:00Z'), factor: 5 },
    ]);

    const res = await GET(req('symbol=PRIO3&date=2020-06-02'));
    const data = await res.json();
    expect(data.price).toBeCloseTo(33.59, 5); // cru permanece cru
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

  // Ticket 26/08 (BBAS3/GGRC11): tester digita o preço da escala AJUSTADA
  // (copiado de gráfico) — o front precisa dos eventos posteriores à data
  // pra explicar o desvio em vez do genérico "confira a casa decimal".
  it('retorna corporateActionsAfter (eventos posteriores à data) mesmo em linha crua', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2022-07-07T00:00:00Z'),
      price: 33.13,
      source: 'B3_COTAHIST',
    });
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      { type: 'DESDOBRAMENTO', date: new Date('2024-04-16T00:00:00Z'), factor: 2 },
      // anterior à data — não deve aparecer
      { type: 'DESDOBRAMENTO', date: new Date('2007-06-04T00:00:00Z'), factor: 3 },
    ]);

    const res = await GET(req('symbol=BBAS3&date=2022-07-07'));
    const data = await res.json();
    expect(data.price).toBeCloseTo(33.13, 5); // cru permanece cru
    expect(data.corporateActionsAfter).toEqual([
      { type: 'DESDOBRAMENTO', date: '2024-04-16', factor: 2 },
    ]);
  });

  it('corporateActionsAfter vem vazio quando não há evento posterior', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: new Date('2025-08-01T00:00:00Z'),
      price: 6.0,
      source: 'BRAPI',
    });
    mockPrisma.assetCorporateAction.findMany.mockResolvedValue([
      { type: 'DESDOBRAMENTO', date: new Date('2025-05-12T00:00:00Z'), factor: 10 },
    ]);

    const res = await GET(req('symbol=HFOF11&date=2025-08-01'));
    const data = await res.json();
    expect(data.corporateActionsAfter).toEqual([]);
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
