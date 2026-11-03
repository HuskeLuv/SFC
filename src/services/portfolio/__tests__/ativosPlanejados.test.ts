import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/utils/apiErrorHandler';

const mockPrisma = vi.hoisted(() => ({
  asset: { findFirst: vi.fn(), create: vi.fn() },
  watchlist: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  MSG_ETF_NEGOCIADO_NA_B3,
  TIPOS_OPERACAO_MANUAIS_PLANEJAVEIS,
  abaDoAssetPlanejado,
  assertTickerNaoEhEtfB3,
  criarAssetPlanejadoManual,
  encontrarPlanejadoManual,
  normalizarTickerEtfDigitado,
  prefixoSimboloManual,
} from '../ativosPlanejados';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.asset.findFirst.mockResolvedValue(null);
  mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'asset-novo', ...data }));
  mockPrisma.watchlist.findFirst.mockResolvedValue(null);
});

describe('normalizarTickerEtfDigitado', () => {
  it.each([
    ['IVVB11', 'IVVB11'],
    [' ivvb11.sa ', 'IVVB11'],
    ['Bova11.SA', 'BOVA11'],
    ['voo', 'VOO'],
    ['', ''],
  ])('%j → %j', (entrada, esperado) => {
    expect(normalizarTickerEtfDigitado(entrada)).toBe(esperado);
  });
});

describe('assertTickerNaoEhEtfB3 (guarda anti-B3 compartilhado)', () => {
  it('ticker que bate com ETF em R$ do catálogo lança ApiError 400', async () => {
    mockPrisma.asset.findFirst.mockResolvedValueOnce({ id: 'asset-ivvb11' });
    const erro = await assertTickerNaoEhEtfB3(mockPrisma as never, 'ivvb11.sa').catch((e) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.statusCode).toBe(400);
    expect(erro.message).toBe(MSG_ETF_NEGOCIADO_NA_B3);
    expect(mockPrisma.asset.findFirst).toHaveBeenCalledWith({
      where: {
        type: { in: ['etf', 'etf-cvm'] },
        currency: 'BRL',
        OR: [
          { symbol: { equals: 'IVVB11', mode: 'insensitive' } },
          { symbol: { equals: 'IVVB11.SA', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
  });

  it('ticker fora do catálogo (VOO, ou terminado em 11) passa', async () => {
    await expect(assertTickerNaoEhEtfB3(mockPrisma as never, 'VOO')).resolves.toBeUndefined();
    await expect(assertTickerNaoEhEtfB3(mockPrisma as never, 'ABCD11')).resolves.toBeUndefined();
  });

  it('ticker vazio não consulta o banco', async () => {
    await assertTickerNaoEhEtfB3(mockPrisma as never, '   ');
    expect(mockPrisma.asset.findFirst).not.toHaveBeenCalled();
  });
});

describe('ETF americano nos manuais planejáveis', () => {
  it("'etf' está em TIPOS_OPERACAO_MANUAIS_PLANEJAVEIS", () => {
    expect(TIPOS_OPERACAO_MANUAIS_PLANEJAVEIS).toContain('etf');
  });

  it('prefixoSimboloManual: ticker em maiúsculas sem pontuação; vazio cai em ETF', () => {
    expect(prefixoSimboloManual('etf', 'voo')).toBe('VOO-');
    expect(prefixoSimboloManual('etf', 'BRK.B')).toBe('BRKB-');
    expect(prefixoSimboloManual('etf', '  ')).toBe('ETF-');
    // Os demais tipos não mudam.
    expect(prefixoSimboloManual('stock', '')).toBe('STOCK-');
    expect(prefixoSimboloManual('reit', '')).toBe('REIT-');
    expect(prefixoSimboloManual('fundo', 'Fundo X')).toBe('FUNDO-FUNDO-X-');
  });

  it('criarAssetPlanejadoManual: Asset etf/USD/manual com nome em maiúsculas', async () => {
    const asset = await criarAssetPlanejadoManual('etf', ' qqq ');
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: {
        symbol: expect.stringMatching(/^QQQ-\d{13}-[a-z0-9]+$/),
        name: 'QQQ',
        type: 'etf',
        currency: 'USD',
        source: 'manual',
      },
    });
    expect(abaDoAssetPlanejado(asset)).toBe('etf');
  });

  it('encontrarPlanejadoManual: etf casa só o manual em USD, pelo prefixo do ticker', async () => {
    await encontrarPlanejadoManual('user-1', 'etf', 'voo');
    expect(mockPrisma.watchlist.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        asset: { type: 'etf', source: 'manual', symbol: { startsWith: 'VOO-' }, currency: 'USD' },
      },
      include: { asset: true },
      orderBy: { addedAt: 'asc' },
    });
  });

  it('encontrarPlanejadoManual: stock continua sem filtro de currency', async () => {
    await encontrarPlanejadoManual('user-1', 'stock', 'aapl');
    expect(mockPrisma.watchlist.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      asset: { type: 'stock', source: 'manual', symbol: { startsWith: 'AAPL-' } },
    });
  });
});
