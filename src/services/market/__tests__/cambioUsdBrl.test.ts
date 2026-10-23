import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

const mockPrisma = vi.hoisted(() => ({
  assetPriceHistory: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const mockGetIndicator = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/market/marketIndicatorService', () => ({ getIndicator: mockGetIndicator }));

import {
  carregarSerieCambio,
  cotacaoMoedaDasNotes,
  fxDaTransacao,
  getCotacaoDolarHoje,
  montarSerieCambio,
} from '../cambioUsdBrl';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('montarSerieCambio', () => {
  const serie = montarSerieCambio([
    { date: d('2026-06-05'), price: new Decimal('5.40') },
    { date: d('2026-06-01'), price: 5.3 },
    { date: d('2026-06-08'), price: '5.5' },
  ]);

  it('devolve o ponto do dia', () => {
    expect(serie(d('2026-06-01'))).toBe(5.3);
    expect(serie(d('2026-06-08'))).toBe(5.5);
  });

  it('buraco repete a última taxa conhecida', () => {
    expect(serie(d('2026-06-03'))).toBe(5.3);
    expect(serie(new Date('2026-06-07T18:30:00.000Z'))).toBe(5.4);
    expect(serie(d('2026-10-22').getTime())).toBe(5.5);
  });

  it('data antes da série = null', () => {
    expect(serie(d('2026-05-31'))).toBeNull();
  });

  it('série vazia ou com taxas inválidas = null', () => {
    expect(montarSerieCambio([])(d('2026-06-01'))).toBeNull();
    expect(montarSerieCambio([{ date: d('2026-06-01'), price: 0 }])(d('2026-06-02'))).toBeNull();
  });
});

describe('carregarSerieCambio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com desde: inclui o último ponto anterior para cobrir o início', async () => {
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: d('2026-05-29'),
      price: new Decimal('5.25'),
    });
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: d('2026-06-02'), price: new Decimal('5.35') },
    ]);
    const serie = await carregarSerieCambio(d('2026-06-01'));
    expect(serie(d('2026-06-01'))).toBe(5.25);
    expect(serie(d('2026-06-03'))).toBe(5.35);
    expect(mockPrisma.assetPriceHistory.findMany.mock.calls[0][0].where).toMatchObject({
      symbol: 'USD-BRL',
      date: { gte: d('2026-06-01') },
    });
  });

  it('sem desde: série inteira', async () => {
    mockPrisma.assetPriceHistory.findMany.mockResolvedValue([
      { date: d('2026-06-02'), price: 5.35 },
    ]);
    const serie = await carregarSerieCambio();
    expect(serie(d('2026-06-01'))).toBeNull();
    expect(serie(d('2026-06-02'))).toBe(5.35);
    expect(mockPrisma.assetPriceHistory.findFirst).not.toHaveBeenCalled();
  });
});

describe('getCotacaoDolarHoje', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa o indicador (cache/BRAPI) quando há preço', async () => {
    mockGetIndicator.mockResolvedValue({ price: 5.0377, changePercent: 0.1 });
    const res = await getCotacaoDolarHoje();
    expect(res).toMatchObject({ taxa: 5.0377, fonte: 'indicador' });
    expect(mockGetIndicator).toHaveBeenCalledWith('USD-BRL', { useBrapiFallback: true });
    expect(mockPrisma.assetPriceHistory.findFirst).not.toHaveBeenCalled();
  });

  it('cache vazio cai no último ponto da série', async () => {
    mockGetIndicator.mockResolvedValue({ price: null, changePercent: null });
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({
      date: d('2026-06-07'),
      price: new Decimal('5.4321'),
    });
    const res = await getCotacaoDolarHoje();
    expect(res).toEqual({ taxa: 5.4321, data: d('2026-06-07'), fonte: 'serie' });
  });

  it('indicador que lança também cai na série', async () => {
    mockGetIndicator.mockRejectedValue(new Error('brapi fora'));
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue({ date: d('2026-06-07'), price: 5.4 });
    expect((await getCotacaoDolarHoje())?.fonte).toBe('serie');
  });

  it('sem nada = null', async () => {
    mockGetIndicator.mockResolvedValue({ price: null, changePercent: null });
    mockPrisma.assetPriceHistory.findFirst.mockResolvedValue(null);
    expect(await getCotacaoDolarHoje()).toBeNull();
  });
});

describe('fxDaTransacao', () => {
  const serie = montarSerieCambio([{ date: d('2026-06-01'), price: 5.3 }]);

  it('notes.cotacaoMoeda vence operation.cotacaoMoeda e a série', () => {
    const notes = JSON.stringify({ cotacaoMoeda: 5.1, operation: { cotacaoMoeda: 5.2 } });
    expect(fxDaTransacao(notes, d('2026-06-02'), serie)).toBe(5.1);
  });

  it('sem notes.cotacaoMoeda usa operation.cotacaoMoeda', () => {
    const notes = JSON.stringify({ operation: { cotacaoMoeda: 5.2 } });
    expect(fxDaTransacao(notes, d('2026-06-02'), serie)).toBe(5.2);
  });

  it('sem cotação nas notes (ou ilegível) usa a série na data', () => {
    expect(fxDaTransacao('{quebrado', d('2026-06-02'), serie)).toBe(5.3);
    expect(fxDaTransacao(JSON.stringify({ cotacaoMoeda: 0 }), d('2026-06-02'), serie)).toBe(5.3);
  });

  it('sem cotação e data antes da série (ou sem série) = null', () => {
    expect(fxDaTransacao(null, d('2026-05-01'), serie)).toBeNull();
    expect(fxDaTransacao(null, d('2026-06-02'), null)).toBeNull();
  });

  it('cotacaoMoedaDasNotes aceita objeto já parseado', () => {
    expect(cotacaoMoedaDasNotes({ operation: { cotacaoMoeda: 4.9 } })).toBe(4.9);
  });
});
