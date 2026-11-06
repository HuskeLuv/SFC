import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  economicIndex: { findMany: vi.fn() },
  asset: { findMany: vi.fn() },
}));
const mockResolveProventoEvents = vi.hoisted(() => vi.fn());
const mockGetAssetHistory = vi.hoisted(() => vi.fn());
const mockCarregarSerieCambio = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mockResolveProventoEvents,
}));
vi.mock('@/services/pricing/assetPriceService', () => ({ getAssetHistory: mockGetAssetHistory }));
vi.mock('@/services/market/cambioUsdBrl', () => ({ carregarSerieCambio: mockCarregarSerieCambio }));

import type { MesesRelatorio } from '@/types/relatorioFinanceiro';
import type { ContextoMontador, Insumos, PontoPerformance } from '../insumos';
import { mesesDaJanela, periodoDoRelatorio } from '../periodo';
import {
  montarCarteiraAvancada,
  proventosDaJanelaCarregados,
  tipoDoProvento,
  twrMensal,
  twrRebaseado,
} from '../carteiraAvancada';

const AGORA = new Date('2026-11-06T09:42:00-03:00');
const HOJE = { ano: 2026, mes0: 10, dia: 6 };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ponto = (iso: string, cumulativeReturn: number): PontoPerformance => ({
  date: d(iso),
  dailyReturn: null,
  cumulativeReturn,
});

function ctxCom(meses: MesesRelatorio, perf: PontoPerformance[]): ContextoMontador {
  const insumos = {
    userId: 'u1',
    agora: AGORA,
    hojeSP: HOJE,
    janela: mesesDaJanela(HOJE, 13),
    inicioJanela: d('2025-11-01'),
    performance13m: vi.fn().mockResolvedValue(perf),
  } as unknown as Insumos;
  return {
    userId: 'u1',
    meses,
    periodo: periodoDoRelatorio(meses, AGORA),
    mesesDoPeriodo: mesesDaJanela(HOJE, meses),
    agora: AGORA,
    hojeSP: HOJE,
    comConsultor: false,
    insumos,
  };
}

const ev = (
  symbol: string,
  pagamento: string,
  net: number,
  extra: Partial<{ tipo: string; moeda: 'BRL' | 'USD' }> = {},
) => ({
  symbol,
  paymentDay: d(pagamento).getTime(),
  exDay: d(pagamento).getTime(),
  bookingDay: d(pagamento).getTime(),
  tipo: extra.tipo ?? 'Dividendo',
  moeda: extra.moeda ?? 'BRL',
  net,
  gross: net,
});

describe('TWR rebaseado', () => {
  it('10% → 21% acumulado = 10% no período', () => {
    const r = twrRebaseado(
      [ponto('2026-07-31', 10), ponto('2026-11-05', 21)],
      d('2026-09-01').getTime(),
    );
    expect(r).not.toBeNull();
    expect(r!.carteira[0]).toBe(0);
    expect(r!.carteira[1]).toBeCloseTo(10, 10);
    expect(r!.datasMs.map((x) => new Date(x).toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-11-05',
    ]);
  });

  it('carteira que começou no período rebaseia no 1º ponto; 1 ponto só = sem TWR', () => {
    const r = twrRebaseado(
      [ponto('2026-10-02', 5), ponto('2026-10-30', 15.5)],
      d('2026-09-01').getTime(),
    );
    expect(r!.carteira[1]).toBeCloseTo(10, 10);
    expect(twrRebaseado([ponto('2026-10-02', 5)], d('2026-09-01').getTime())).toBeNull();
    expect(twrRebaseado([], d('2026-09-01').getTime())).toBeNull();
  });

  it('TWR mensal pelo fim de cada mês', () => {
    const perf = [ponto('2026-08-31', 0), ponto('2026-09-30', 2), ponto('2026-10-31', 4.04)];
    const r = twrMensal(perf, ['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(r[0]).toBeNull(); // sem ponto antes de agosto
    expect(r[1]).toBeCloseTo(2, 4);
    expect(r[2]).toBeCloseTo(2, 4);
    expect(r[3]).toBeNull(); // novembro ainda sem ponto
  });
});

describe('tipoDoProvento', () => {
  it('USD → exterior; JCP; FII; resto → ações', () => {
    expect(tipoDoProvento({ moeda: 'USD', tipo: 'Dividendo' }, 'reit')).toBe('exterior');
    expect(tipoDoProvento({ moeda: 'BRL', tipo: 'JCP' }, 'stock')).toBe('jcp');
    expect(tipoDoProvento({ moeda: 'BRL', tipo: 'Juros sobre capital' }, 'stock')).toBe('jcp');
    expect(tipoDoProvento({ moeda: 'BRL', tipo: 'Rendimento' }, 'fii')).toBe('fii');
    expect(tipoDoProvento({ moeda: 'BRL', tipo: 'Dividendo' }, 'etf')).toBe('acao');
    expect(tipoDoProvento({ moeda: 'BRL', tipo: 'Dividendo' }, 'bdr')).toBe('acao');
  });
});

describe('montarCarteiraAvancada (4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.economicIndex.findMany.mockImplementation(
      async (args: { where: { indexType: string } }) =>
        args.where.indexType === 'CDI'
          ? [
              { date: d('2026-08-01'), value: 0.01 },
              { date: d('2026-10-01'), value: 0.01 },
            ]
          : [{ date: d('2026-09-01'), value: 0.005 }],
    );
    mockGetAssetHistory.mockResolvedValue([
      { date: d('2026-07-31').getTime(), value: 100 },
      { date: d('2026-11-05').getTime(), value: 110 },
    ]);
    mockPrisma.asset.findMany.mockResolvedValue([
      { symbol: 'HGLG11', type: 'fii' },
      { symbol: 'PETR4', type: 'stock' },
      { symbol: 'O', type: 'reit' },
    ]);
    mockCarregarSerieCambio.mockResolvedValue(() => 5);
    mockResolveProventoEvents.mockResolvedValue({
      events: [
        ev('HGLG11', '2026-10-15', 100),
        ev('PETR4', '2026-10-20', 50),
        ev('PETR4', '2026-09-20', 30, { tipo: 'JCP' }),
        ev('O', '2026-10-10', 2, { moeda: 'USD' }),
        ev('PETR4', '2026-12-20', 999), // pagamento futuro: fora
        ev('RESERVA-EMERG-1', '2026-10-01', 7), // bloqueado
      ],
      total: 0,
    });
  });

  it('carteira, CDI, IPCA e Ibovespa na mesma base e data final', async () => {
    const ctx = ctxCom(3, [
      ponto('2026-07-31', 10),
      ponto('2026-09-30', 15),
      ponto('2026-11-05', 21),
    ]);
    const b = await montarCarteiraAvancada(ctx);
    expect(b.retornoDiario.datas).toEqual(['2026-07-31', '2026-09-30', '2026-11-05']);
    expect(b.twr).toBeCloseTo(10, 3);
    expect(b.retornoDiario.cdi).toEqual([0, 1, 2.01]);
    expect(b.cdi).toBeCloseTo(2.01, 4);
    expect(b.retornoDiario.ipca).toEqual([0, 0.5, 0.5]); // degrau mensal
    expect(b.ibov).toBeCloseTo(10, 4);
    expect(b.fgc).toBeNull();
    expect(b.irRendaVariavel).toBeNull();
    // CDI e IPCA a partir da base (exclusiva) até a data final
    const where = mockPrisma.economicIndex.findMany.mock.calls[0][0].where;
    expect(where.date.gt.toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(where.date.lte.toISOString().slice(0, 10)).toBe('2026-11-05');
  });

  it('proventos por tipo no período, pagos até hoje; USD pelo câmbio', async () => {
    const ctx = ctxCom(3, []);
    const b = await montarCarteiraAvancada(ctx);
    expect(b.proventos).toEqual([
      { mes: '2026-09', fii: 0, acao: 0, jcp: 30, exterior: 0 },
      { mes: '2026-10', fii: 100, acao: 50, jcp: 0, exterior: 10 },
      { mes: '2026-11', fii: 0, acao: 0, jcp: 0, exterior: 0 },
    ]);
    // a janela inteira fica pronta para a saúde (fase 2)
    expect(proventosDaJanelaCarregados(ctx.insumos)).toHaveLength(13);
  });

  it('sem performance: tudo null ("em processamento"), proventos seguem', async () => {
    const b = await montarCarteiraAvancada(ctxCom(1, []));
    expect(b.twr).toBeNull();
    expect(b.cdi).toBeNull();
    expect(b.ibov).toBeNull();
    expect(b.retornoDiario.datas).toEqual([]);
    expect(b.proventos).toHaveLength(1);
    expect(mockPrisma.economicIndex.findMany).not.toHaveBeenCalled();
  });
});
