import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  portfolioProvento: {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const mockGetDividends = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/services/pricing/dividendService', () => ({
  getDividends: mockGetDividends,
  isJcpType: (tipo: string | null | undefined) => !!tipo && /JCP|JUROS SOBRE CAPITAL/i.test(tipo),
  getJcpIrrfRate: (paymentDate: Date) =>
    paymentDate.getTime() >= Date.UTC(2026, 0, 1) ? 0.175 : 0.15,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { ensurePortfolioProventosFromMarket } from '../ensurePortfolioProventosFromMarket';

const baseParams = {
  portfolioId: 'p1',
  userId: 'u1',
  ticker: 'BBAS3',
  transactions: [{ date: new Date('2025-01-15'), quantity: 500, type: 'compra' }],
  portfolioQuantity: 500,
  portfolioLastUpdate: null,
};

const jcpDividend = {
  date: new Date('2026-03-05T00:00:00.000Z'),
  dataCom: new Date('2026-02-23T00:00:00.000Z'),
  tipo: 'JCP',
  valorUnitario: 0.216304,
};

describe('mode initial (default)', () => {
  it('pula tudo se o portfolio já tem qualquer provento', async () => {
    mockPrisma.portfolioProvento.count.mockResolvedValue(5);

    await ensurePortfolioProventosFromMarket(baseParams);

    expect(mockGetDividends).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioProvento.create).not.toHaveBeenCalled();
  });

  it('cria proventos quando portfolio está vazio', async () => {
    mockPrisma.portfolioProvento.count.mockResolvedValue(0);
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue(null);
    mockGetDividends.mockResolvedValue([jcpDividend]);

    await ensurePortfolioProventosFromMarket(baseParams);

    expect(mockPrisma.portfolioProvento.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.portfolioProvento.create.mock.calls[0][0].data;
    expect(data.tipo).toBe('JCP');
    expect(data.dataCom.toISOString().slice(0, 10)).toBe('2026-02-23');
    expect(data.dataPagamento.toISOString().slice(0, 10)).toBe('2026-03-05');
    // 500 × 0.216304 = 108.152 — IRRF 17,5% (LC 224/2025) = 18.93
    expect(data.impostoRenda).toBeCloseTo(18.93, 2);
  });
});

describe('mode sync', () => {
  it('pula o guard externo mesmo com proventos existentes', async () => {
    // count NÃO deveria ser chamado em modo sync
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue(null);
    mockGetDividends.mockResolvedValue([jcpDividend]);

    await ensurePortfolioProventosFromMarket({ ...baseParams, mode: 'sync' });

    expect(mockPrisma.portfolioProvento.count).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioProvento.create).toHaveBeenCalledTimes(1);
  });

  it('preserva edição manual (source=manual): nunca atualiza nem recria', async () => {
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue({
      id: 'manual-1',
      source: 'manual',
      dismissed: false,
      valorTotal: 999, // valor editado pelo usuário, divergente da BRAPI
      dataCom: new Date('2026-02-23T00:00:00.000Z'),
      impostoRenda: 100,
    });
    mockGetDividends.mockResolvedValue([jcpDividend]);

    await ensurePortfolioProventosFromMarket({ ...baseParams, mode: 'sync' });

    expect(mockPrisma.portfolioProvento.create).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioProvento.update).not.toHaveBeenCalled();
  });

  it('respeita dismissed (source=brapi): não atualiza nem recria', async () => {
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue({
      id: 'dismissed-1',
      source: 'brapi',
      dismissed: true,
      valorTotal: 100,
      dataCom: new Date('2026-02-23T00:00:00.000Z'),
      impostoRenda: null,
    });
    mockGetDividends.mockResolvedValue([jcpDividend]);

    await ensurePortfolioProventosFromMarket({ ...baseParams, mode: 'sync' });

    expect(mockPrisma.portfolioProvento.create).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioProvento.update).not.toHaveBeenCalled();
  });

  it('refresca row source=brapi quando BRAPI corrige valor (caso dedup retroativo)', async () => {
    // 500 cotas × 0.216304 = 108.152 (valor BRAPI atual)
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue({
      id: 'brapi-old-1',
      source: 'brapi',
      dismissed: false,
      valorTotal: 45.22, // valor antigo (pré-dedup)
      dataCom: new Date('2026-02-23T00:00:00.000Z'),
      impostoRenda: 6.78, // 45.22 × 15% antigo
    });
    mockGetDividends.mockResolvedValue([jcpDividend]);

    await ensurePortfolioProventosFromMarket({ ...baseParams, mode: 'sync' });

    expect(mockPrisma.portfolioProvento.create).not.toHaveBeenCalled();
    expect(mockPrisma.portfolioProvento.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.portfolioProvento.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe('brapi-old-1');
    expect(updateCall.data.valorTotal).toBeCloseTo(108.152, 3);
    expect(updateCall.data.impostoRenda).toBeCloseTo(18.93, 2); // 17,5% LC 224/2025
  });

  it('cria novos proventos com source=brapi quando não existe', async () => {
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue(null);
    mockGetDividends.mockResolvedValue([jcpDividend]);

    await ensurePortfolioProventosFromMarket({ ...baseParams, mode: 'sync' });

    expect(mockPrisma.portfolioProvento.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.portfolioProvento.create.mock.calls[0][0].data.source).toBe('brapi');
  });
});

describe('normalizeDateStart UTC-safe', () => {
  it('gera dataPagamento T00:00Z determinístico (independente do TZ)', async () => {
    mockPrisma.portfolioProvento.count.mockResolvedValue(0);
    mockPrisma.portfolioProvento.findFirst.mockResolvedValue(null);
    // BRAPI retorna T03:00Z (servidor que salvou no AHD tava em BRT)
    mockGetDividends.mockResolvedValue([
      {
        date: new Date('2026-03-05T03:00:00.000Z'),
        dataCom: new Date('2026-02-23T03:00:00.000Z'),
        tipo: 'JCP',
        valorUnitario: 0.21,
      },
    ]);

    await ensurePortfolioProventosFromMarket(baseParams);

    const data = mockPrisma.portfolioProvento.create.mock.calls[0][0].data;
    // Independente do TZ local do test runner, deve salvar T00:00Z
    expect(data.dataPagamento.toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(data.dataCom.toISOString()).toBe('2026-02-23T00:00:00.000Z');
  });
});
