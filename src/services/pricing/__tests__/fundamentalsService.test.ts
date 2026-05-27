import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assetFundamentals: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/fetchWithTimeout', () => ({
  fetchWithTimeout: mockFetch,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BRAPI_API_KEY', 'test-key');
});

import { getFundamentals, syncFundamentalsForSymbols, __internal } from '../fundamentalsService';

const brapiResultWithFullStats = {
  symbol: 'PETR4',
  priceEarnings: 5.09,
  defaultKeyStatistics: {
    trailingPE: 5.83,
    beta: 0.4019,
    dividendYield: 0.07, // BRAPI sempre em decimal
  },
};

const okResponse = (results: unknown[]) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ results }),
  }) as Response;

describe('extractFundamentalsFromBrapiResult (F1.9)', () => {
  it('prefers defaultKeyStatistics.trailingPE para P/L (mais atualizado)', () => {
    const out = __internal.extractFundamentalsFromBrapiResult(brapiResultWithFullStats);
    expect(out.pl).toBe(5.83);
  });

  it('cai pra result.priceEarnings quando trailingPE ausente', () => {
    const out = __internal.extractFundamentalsFromBrapiResult({
      priceEarnings: 12.3,
      defaultKeyStatistics: { beta: 1.0, dividendYield: 0.05 },
    });
    expect(out.pl).toBe(12.3);
  });

  it('extrai beta de defaultKeyStatistics', () => {
    const out = __internal.extractFundamentalsFromBrapiResult(brapiResultWithFullStats);
    expect(out.beta).toBeCloseTo(0.4019);
  });

  it('converte dividendYield de decimal para percentual (0.07 → 7)', () => {
    const out = __internal.extractFundamentalsFromBrapiResult(brapiResultWithFullStats);
    expect(out.dividendYield).toBeCloseTo(7, 2);
  });

  it('aceita defaultKeyStatistics.yield quando dividendYield ausente (FIIs)', () => {
    const out = __internal.extractFundamentalsFromBrapiResult({
      priceEarnings: null,
      defaultKeyStatistics: { yield: 0.12 },
    });
    expect(out.dividendYield).toBeCloseTo(12, 2);
  });

  it('rejeita P/L zerado ou negativo (sentinel de "sem dado")', () => {
    expect(
      __internal.extractFundamentalsFromBrapiResult({
        defaultKeyStatistics: { trailingPE: 0, beta: 1.0, dividendYield: 0.05 },
      }).pl,
    ).toBeNull();
    expect(
      __internal.extractFundamentalsFromBrapiResult({
        defaultKeyStatistics: { trailingPE: -3, beta: 1.0, dividendYield: 0.05 },
      }).pl,
    ).toBeNull();
  });

  it('preserva beta negativo (alguns ativos têm correlação inversa com IBOV)', () => {
    const out = __internal.extractFundamentalsFromBrapiResult({
      defaultKeyStatistics: { beta: -0.3, trailingPE: 8, dividendYield: 0.05 },
    });
    expect(out.beta).toBe(-0.3);
  });

  it('devolve nulls quando defaultKeyStatistics ausente', () => {
    expect(__internal.extractFundamentalsFromBrapiResult({})).toEqual({
      pl: null,
      beta: null,
      dividendYield: null,
    });
  });
});

describe('getFundamentals (F1.9)', () => {
  it('rejeita symbols bloqueados sem chamar BRAPI', async () => {
    const out = await getFundamentals('RENDA-FIXA-123', { useBrapiFallback: true });
    expect(out).toEqual({ pl: null, beta: null, dividendYield: null });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPrisma.assetFundamentals.findUnique).not.toHaveBeenCalled();
  });

  it('devolve DB row quando existe e tem ao menos um campo populado', async () => {
    mockPrisma.assetFundamentals.findUnique.mockResolvedValueOnce({
      symbol: 'PETR4',
      priceEarnings: 5.83,
      beta: 0.4,
      dividendYield: 7,
      updatedAt: new Date(),
    });
    const out = await getFundamentals('PETR4');
    expect(out).toEqual({ pl: 5.83, beta: 0.4, dividendYield: 7 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cai pra BRAPI quando DB tem linha 100% nula (legado pré-fix)', async () => {
    mockPrisma.assetFundamentals.findUnique.mockResolvedValueOnce({
      symbol: 'PETR4',
      priceEarnings: null,
      beta: null,
      dividendYield: null,
      updatedAt: new Date(),
    });
    mockFetch.mockResolvedValueOnce(okResponse([brapiResultWithFullStats]));
    mockPrisma.assetFundamentals.upsert.mockResolvedValueOnce({});

    const out = await getFundamentals('PETR4');
    expect(out.pl).toBeCloseTo(5.83);
    expect(out.beta).toBeCloseTo(0.4019);
    expect(out.dividendYield).toBeCloseTo(7);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockPrisma.assetFundamentals.upsert).toHaveBeenCalledOnce();
  });

  it('usa modules=defaultKeyStatistics e não o endpoint legado fundamental=true', async () => {
    mockPrisma.assetFundamentals.findUnique.mockResolvedValueOnce(null);
    mockFetch.mockResolvedValueOnce(okResponse([brapiResultWithFullStats]));
    mockPrisma.assetFundamentals.upsert.mockResolvedValueOnce({});

    await getFundamentals('PETR4');
    const url = mockFetch.mock.calls[0]?.[0];
    expect(url).toContain('modules=defaultKeyStatistics');
    expect(url).not.toContain('fundamental=true');
  });

  it('respeita useBrapiFallback:false', async () => {
    mockPrisma.assetFundamentals.findUnique.mockResolvedValueOnce(null);
    const out = await getFundamentals('PETR4', { useBrapiFallback: false });
    expect(out).toEqual({ pl: null, beta: null, dividendYield: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('syncFundamentalsForSymbols (F1.9 cron)', () => {
  it('faz batch e persiste o que vem da BRAPI', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse([
        brapiResultWithFullStats,
        {
          symbol: 'ITUB4',
          priceEarnings: 9.55,
          defaultKeyStatistics: { trailingPE: 9.55, beta: 1.12, dividendYield: 0.09 },
        },
      ]),
    );
    mockPrisma.assetFundamentals.upsert.mockResolvedValue({});

    const result = await syncFundamentalsForSymbols(['PETR4', 'ITUB4']);

    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.withData).toBe(2);
    expect(mockPrisma.assetFundamentals.upsert).toHaveBeenCalledTimes(2);
  });

  it('conta como processado mesmo quando BRAPI devolve 404 (symbol inexistente)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const result = await syncFundamentalsForSymbols(['INVALID']);
    expect(result.processed).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('aborta com erro claro quando BRAPI_API_KEY ausente', async () => {
    vi.stubEnv('BRAPI_API_KEY', '');
    const result = await syncFundamentalsForSymbols(['PETR4']);
    expect(result.processed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/BRAPI_API_KEY/);
  });

  it('ignora symbols bloqueados (RENDA-FIXA, RESERVA-EMERG, etc.)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([brapiResultWithFullStats]));
    mockPrisma.assetFundamentals.upsert.mockResolvedValue({});

    const result = await syncFundamentalsForSymbols([
      'PETR4',
      'RENDA-FIXA-abc',
      'RESERVA-EMERG',
      'PERSONALIZADO-xyz',
    ]);

    expect(result.processed).toBe(1); // só PETR4 atravessou o filtro
    expect(mockPrisma.assetFundamentals.upsert).toHaveBeenCalledTimes(1);
  });

  it('é idempotente: 2x as mesmas symbols não duplicam upserts', async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse([brapiResultWithFullStats]))
      .mockResolvedValueOnce(okResponse([brapiResultWithFullStats]));
    mockPrisma.assetFundamentals.upsert.mockResolvedValue({});

    const a = await syncFundamentalsForSymbols(['PETR4']);
    const b = await syncFundamentalsForSymbols(['PETR4']);

    expect(a.updated).toBe(1);
    expect(b.updated).toBe(1);
    expect(mockPrisma.assetFundamentals.upsert).toHaveBeenCalledTimes(2);
  });
});
