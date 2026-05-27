import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  asset: {
    findUnique: vi.fn(),
  },
  assetPriceHistory: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
}));

const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockAxiosIsAxiosError = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
    isAxiosError: mockAxiosIsAxiosError,
  },
  isAxiosError: mockAxiosIsAxiosError,
}));

import {
  SYMBOL_TO_COINGECKO_ID,
  resolveCoinGeckoId,
  parseMarketChartResponse,
  fetchCoinGeckoHistory,
  syncCoinGeckoSymbol,
  syncCoinGeckoBatch,
  type CoinGeckoMarketChartResponse,
} from '../coinGeckoSync';

// ── Helpers ────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC_2024_01_01 = Date.UTC(2024, 0, 1);
const UTC_2024_01_02 = Date.UTC(2024, 0, 2);
const UTC_2024_01_03 = Date.UTC(2024, 0, 3);

// ── Tests ──────────────────────────────────────────────────────────────

describe('coinGeckoSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosIsAxiosError.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── SYMBOL_TO_COINGECKO_ID ─────────────────────────────────────────

  describe('SYMBOL_TO_COINGECKO_ID', () => {
    it('mapeia BTC para bitcoin', () => {
      expect(SYMBOL_TO_COINGECKO_ID.BTC).toBe('bitcoin');
    });

    it('mapeia os 10 ativos principais', () => {
      expect(SYMBOL_TO_COINGECKO_ID.ETH).toBe('ethereum');
      expect(SYMBOL_TO_COINGECKO_ID.USDT).toBe('tether');
      expect(SYMBOL_TO_COINGECKO_ID.USDC).toBe('usd-coin');
      expect(SYMBOL_TO_COINGECKO_ID.BNB).toBe('binancecoin');
      expect(SYMBOL_TO_COINGECKO_ID.XRP).toBe('ripple');
      expect(SYMBOL_TO_COINGECKO_ID.ADA).toBe('cardano');
      expect(SYMBOL_TO_COINGECKO_ID.SOL).toBe('solana');
      expect(SYMBOL_TO_COINGECKO_ID.DOGE).toBe('dogecoin');
      expect(SYMBOL_TO_COINGECKO_ID.MATIC).toBe('matic-network');
    });
  });

  // ─── resolveCoinGeckoId ──────────────────────────────────────────────

  describe('resolveCoinGeckoId', () => {
    it('resolve símbolo conhecido (uppercase)', () => {
      expect(resolveCoinGeckoId('BTC')).toBe('bitcoin');
    });

    it('resolve símbolo conhecido (lowercase)', () => {
      expect(resolveCoinGeckoId('btc')).toBe('bitcoin');
    });

    it('resolve símbolo com whitespace', () => {
      expect(resolveCoinGeckoId('  ETH  ')).toBe('ethereum');
    });

    it('retorna null para símbolo desconhecido', () => {
      expect(resolveCoinGeckoId('UNKNOWN')).toBeNull();
    });

    it('retorna null para string vazia', () => {
      expect(resolveCoinGeckoId('')).toBeNull();
      expect(resolveCoinGeckoId('   ')).toBeNull();
    });
  });

  // ─── parseMarketChartResponse ────────────────────────────────────────

  describe('parseMarketChartResponse', () => {
    it('parseia resposta válida', () => {
      const payload: CoinGeckoMarketChartResponse = {
        prices: [
          [UTC_2024_01_01, 42000.5],
          [UTC_2024_01_02, 43000.0],
          [UTC_2024_01_03, 41500.25],
        ],
      };

      const result = parseMarketChartResponse(payload);

      expect(result).toHaveLength(3);
      expect(result[0].priceUsd).toBe(42000.5);
      expect(result[0].date.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(result[2].priceUsd).toBe(41500.25);
    });

    it('normaliza timestamps para UTC midnight', () => {
      const payload: CoinGeckoMarketChartResponse = {
        prices: [
          // Timestamp às 15:30:00 UTC do dia 1 — deve virar 00:00:00 UTC do dia 1
          [UTC_2024_01_01 + 15 * 60 * 60 * 1000 + 30 * 60 * 1000, 42000],
        ],
      };

      const result = parseMarketChartResponse(payload);

      expect(result).toHaveLength(1);
      expect(result[0].date.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });

    it('deduplica múltiplos pontos no mesmo dia (mantém o último)', () => {
      const payload: CoinGeckoMarketChartResponse = {
        prices: [
          [UTC_2024_01_01, 42000],
          [UTC_2024_01_01 + 60 * 60 * 1000, 42500],
          [UTC_2024_01_01 + 23 * 60 * 60 * 1000, 43000], // último do dia
        ],
      };

      const result = parseMarketChartResponse(payload);

      expect(result).toHaveLength(1);
      expect(result[0].priceUsd).toBe(43000);
    });

    it('filtra pontos com preço inválido', () => {
      const payload: CoinGeckoMarketChartResponse = {
        prices: [
          [UTC_2024_01_01, 42000],
          [UTC_2024_01_02, 0], // zero
          [UTC_2024_01_03, -100], // negativo
          [UTC_2024_01_03 + DAY_MS, Number.NaN], // NaN
          [UTC_2024_01_03 + 2 * DAY_MS, Number.POSITIVE_INFINITY], // infinity
        ],
      };

      const result = parseMarketChartResponse(payload);

      expect(result).toHaveLength(1);
      expect(result[0].priceUsd).toBe(42000);
    });

    it('retorna array vazio para payload vazio/null', () => {
      expect(parseMarketChartResponse(null)).toEqual([]);
      expect(parseMarketChartResponse(undefined)).toEqual([]);
      expect(parseMarketChartResponse({ prices: [] })).toEqual([]);
    });

    it('ordena pontos por data ascendente', () => {
      const payload: CoinGeckoMarketChartResponse = {
        prices: [
          [UTC_2024_01_03, 41500],
          [UTC_2024_01_01, 42000],
          [UTC_2024_01_02, 43000],
        ],
      };

      const result = parseMarketChartResponse(payload);

      expect(result.map((p) => p.priceUsd)).toEqual([42000, 43000, 41500]);
    });
  });

  // ─── fetchCoinGeckoHistory ───────────────────────────────────────────

  describe('fetchCoinGeckoHistory', () => {
    it('chama o endpoint correto com vs_currency=usd', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { prices: [[UTC_2024_01_01, 42000]] },
      });

      await fetchCoinGeckoHistory('bitcoin', 3650);

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart',
        expect.objectContaining({
          params: { vs_currency: 'usd', days: '3650' },
          timeout: expect.any(Number),
        }),
      );
    });

    it('aceita days="max"', async () => {
      mockAxiosGet.mockResolvedValue({ data: { prices: [] } });

      await fetchCoinGeckoHistory('bitcoin', 'max');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { vs_currency: 'usd', days: 'max' } }),
      );
    });

    it('parseia a resposta', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          prices: [
            [UTC_2024_01_01, 42000],
            [UTC_2024_01_02, 43000],
          ],
        },
      });

      const result = await fetchCoinGeckoHistory('bitcoin', 3650);

      expect(result).toHaveLength(2);
      expect(result[0].priceUsd).toBe(42000);
    });

    it('lança erro com coinId vazio', async () => {
      await expect(fetchCoinGeckoHistory('', 3650)).rejects.toThrow('coinId é obrigatório');
    });

    it('propaga erro HTTP', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Network failed'));

      await expect(fetchCoinGeckoHistory('bitcoin', 3650)).rejects.toThrow();
    });
  });

  // ─── syncCoinGeckoSymbol ─────────────────────────────────────────────

  describe('syncCoinGeckoSymbol', () => {
    it('lança erro para símbolo sem mapeamento', async () => {
      await expect(syncCoinGeckoSymbol('UNKNOWN', 3650)).rejects.toThrow(/mapeamento CoinGecko/);
    });

    it('lança erro se Asset não existe', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      await expect(syncCoinGeckoSymbol('BTC', 3650)).rejects.toThrow(/não existe no catálogo/);
    });

    it('lança erro se Asset não é crypto', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'stock' });

      await expect(syncCoinGeckoSymbol('BTC', 3650)).rejects.toThrow(/não é crypto/);
    });

    it('dry-run: busca histórico mas não persiste', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'crypto' });
      mockAxiosGet.mockResolvedValue({
        data: {
          prices: [
            [UTC_2024_01_01, 42000],
            [UTC_2024_01_02, 43000],
            [UTC_2024_01_03, 41500],
          ],
        },
      });

      const result = await syncCoinGeckoSymbol('BTC', 3650, { dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.fetched).toBe(3);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.sample).toHaveLength(3);
      expect(mockPrisma.assetPriceHistory.createMany).not.toHaveBeenCalled();
    });

    it('apply: persiste pontos em USD com source COINGECKO', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'crypto' });
      mockAxiosGet.mockResolvedValue({
        data: {
          prices: [
            [UTC_2024_01_01, 42000],
            [UTC_2024_01_02, 43000],
          ],
        },
      });
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([]);
      mockPrisma.assetPriceHistory.createMany.mockResolvedValue({ count: 2 });

      const result = await syncCoinGeckoSymbol('BTC', 3650, { dryRun: false });

      expect(result.dryRun).toBe(false);
      expect(result.inserted).toBe(2);
      expect(result.updated).toBe(0);
      expect(mockPrisma.assetPriceHistory.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            assetId: 'a1',
            symbol: 'BTC',
            currency: 'USD',
            source: 'COINGECKO',
            price: expect.any(Decimal),
          }),
          expect.objectContaining({ symbol: 'BTC', currency: 'USD' }),
        ],
        skipDuplicates: true,
      });
    });

    it('idempotência: usa skipDuplicates e conta já existentes como updated', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'crypto' });
      mockAxiosGet.mockResolvedValue({
        data: {
          prices: [
            [UTC_2024_01_01, 42000],
            [UTC_2024_01_02, 43000],
            [UTC_2024_01_03, 41500],
          ],
        },
      });
      // 2 datas já existem no banco
      mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
        { date: new Date(UTC_2024_01_01) },
        { date: new Date(UTC_2024_01_02) },
      ]);
      // createMany com skipDuplicates → só insere 1
      mockPrisma.assetPriceHistory.createMany.mockResolvedValue({ count: 1 });

      const result = await syncCoinGeckoSymbol('BTC', 3650, { dryRun: false });

      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('retorna resultado vazio quando API devolve 0 pontos', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'crypto' });
      mockAxiosGet.mockResolvedValue({ data: { prices: [] } });

      const result = await syncCoinGeckoSymbol('BTC', 3650, { dryRun: false });

      expect(result.fetched).toBe(0);
      expect(result.inserted).toBe(0);
      expect(mockPrisma.assetPriceHistory.createMany).not.toHaveBeenCalled();
    });

    it('usa o coinId resolvido (BTC → bitcoin) na URL', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'crypto' });
      mockAxiosGet.mockResolvedValue({ data: { prices: [] } });

      await syncCoinGeckoSymbol('BTC', 3650, { dryRun: true });

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('/coins/bitcoin/market_chart'),
        expect.any(Object),
      );
    });
  });

  // ─── syncCoinGeckoBatch ──────────────────────────────────────────────

  describe('syncCoinGeckoBatch', () => {
    it('pula símbolos sem mapeamento conhecido', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ id: 'a1', type: 'crypto' });
      mockAxiosGet.mockResolvedValue({ data: { prices: [[UTC_2024_01_01, 42000]] } });

      const result = await syncCoinGeckoBatch(['BTC', 'UNKNOWN', 'ETH'], 3650, {
        dryRun: true,
        delayMs: 0,
      });

      // Pula UNKNOWN → só BTC e ETH viram tentativas
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.symbol)).toEqual(['BTC', 'ETH']);
    });

    it('continua após falha em um símbolo', async () => {
      mockPrisma.asset.findUnique
        .mockResolvedValueOnce(null) // BTC: asset não existe → erro
        .mockResolvedValueOnce({ id: 'a2', type: 'crypto' }); // ETH: ok
      mockAxiosGet.mockResolvedValue({ data: { prices: [[UTC_2024_01_01, 2500]] } });

      const result = await syncCoinGeckoBatch(['BTC', 'ETH'], 3650, {
        dryRun: true,
        delayMs: 0,
      });

      expect(result).toHaveLength(2);
      expect(result[0].errors).toBe(1);
      expect(result[1].fetched).toBe(1);
    });
  });
});
