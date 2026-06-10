import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  marketDataCoverage: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  asset: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.marketDataCoverage.findUnique.mockResolvedValue(null);
  mockPrisma.marketDataCoverage.upsert.mockResolvedValue({});
  mockPrisma.marketDataCoverage.createMany.mockResolvedValue({ count: 0 });
});

import { recordGap, recordCoverage, enqueueUncoveredCatalogSymbols } from '../marketDataGap';

describe('recordGap', () => {
  it('enfileira (GAP_QUEUED) quando o símbolo não tem cobertura', async () => {
    mockPrisma.marketDataCoverage.findUnique.mockResolvedValue(null);

    await recordGap('mxrf11', 'runtime-gap');

    expect(mockPrisma.marketDataCoverage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { symbol: 'MXRF11' }, // normaliza pra maiúsculo
        create: expect.objectContaining({ status: 'GAP_QUEUED', source: 'runtime-gap' }),
      }),
    );
  });

  it('NÃO re-enfileira símbolo já OK', async () => {
    mockPrisma.marketDataCoverage.findUnique.mockResolvedValue({ status: 'OK' });
    await recordGap('PETR4', 'runtime-gap');
    expect(mockPrisma.marketDataCoverage.upsert).not.toHaveBeenCalled();
  });

  it('NÃO re-enfileira símbolo já EMPTY (genuinamente sem provento)', async () => {
    mockPrisma.marketDataCoverage.findUnique.mockResolvedValue({ status: 'EMPTY' });
    await recordGap('XPTO3', 'runtime-gap');
    expect(mockPrisma.marketDataCoverage.upsert).not.toHaveBeenCalled();
  });

  it('re-enfileira símbolo em FETCH_FAIL (retry)', async () => {
    mockPrisma.marketDataCoverage.findUnique.mockResolvedValue({ status: 'FETCH_FAIL' });
    await recordGap('FAIL11', 'runtime-gap');
    expect(mockPrisma.marketDataCoverage.upsert).toHaveBeenCalled();
  });

  it('é best-effort: NUNCA lança mesmo se o banco falhar', async () => {
    mockPrisma.marketDataCoverage.findUnique.mockRejectedValue(new Error('db down'));
    await expect(recordGap('ANY3', 'runtime-gap')).resolves.toBeUndefined();
  });

  it('ignora símbolo vazio', async () => {
    await recordGap('  ', 'runtime-gap');
    expect(mockPrisma.marketDataCoverage.findUnique).not.toHaveBeenCalled();
  });
});

describe('recordCoverage', () => {
  it('grava status + contagens e limpa gapRequestedAt quando OK', async () => {
    await recordCoverage('mxrf11', { status: 'OK', dividendCount: 109, caCount: 1 });

    expect(mockPrisma.marketDataCoverage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { symbol: 'MXRF11' },
        update: expect.objectContaining({
          status: 'OK',
          dividendCount: 109,
          caCount: 1,
          gapRequestedAt: null,
        }),
      }),
    );
  });

  it('preserva gapRequestedAt (undefined) quando FETCH_FAIL', async () => {
    await recordCoverage('FAIL11', {
      status: 'FETCH_FAIL',
      dividendCount: 0,
      caCount: 0,
      error: 'Yahoo timeout',
    });
    const call = mockPrisma.marketDataCoverage.upsert.mock.calls[0][0];
    expect(call.update.status).toBe('FETCH_FAIL');
    expect(call.update.gapRequestedAt).toBeUndefined();
    expect(call.update.lastError).toBe('Yahoo timeout');
  });
});

describe('enqueueUncoveredCatalogSymbols', () => {
  it('enfileira em lote só os símbolos RV sem linha de cobertura', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([
      { symbol: 'MXRF11' },
      { symbol: 'PETR4' },
      { symbol: 'NEW11' },
    ]);
    mockPrisma.marketDataCoverage.findMany.mockResolvedValue([
      { symbol: 'MXRF11' },
      { symbol: 'PETR4' },
    ]);

    const n = await enqueueUncoveredCatalogSymbols();

    expect(n).toBe(1);
    expect(mockPrisma.marketDataCoverage.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            symbol: 'NEW11',
            status: 'GAP_QUEUED',
            source: 'catalog-hook',
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('não faz nada quando o catálogo já está coberto', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([{ symbol: 'MXRF11' }]);
    mockPrisma.marketDataCoverage.findMany.mockResolvedValue([{ symbol: 'MXRF11' }]);

    const n = await enqueueUncoveredCatalogSymbols();

    expect(n).toBe(0);
    expect(mockPrisma.marketDataCoverage.createMany).not.toHaveBeenCalled();
  });
});
