import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  FONTE_SEC,
  lerLocalSec,
  pontosSec,
} from '@/services/analiseAtivos/fontes/fundamentos/fonteSec';
import { FONTES, obterFonte } from '@/services/analiseAtivos/fontes/fundamentos/registro';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { fontesDoMercado } from '@/services/analiseAtivos/calculo/executarCriteriosEua';
import { fontesEfetivas } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import type { FySec } from '@/services/analiseAtivos/regras/criterios/seriesStock';
import fixture from '../../../regras/criterios/__tests__/fixtures/eua-dev.json';

const EMPRESAS = fixture.empresas as unknown as Array<{
  symbol: string;
  cik: string;
  classe: 'stock' | 'reit';
  fys: FySec[];
}>;
const aapl = EMPRESAS.find((e) => e.symbol === 'AAPL')!;
const o = EMPRESAS.find((e) => e.symbol === 'O')!;

describe('FonteSec', () => {
  it('registrada como leitura local dos mercados EUA', () => {
    expect(FONTES.sec).toBe(FONTE_SEC);
    expect(obterFonte('sec', 'production')).toMatchObject({
      modo: 'leitura_local',
      mercados: ['us_stocks', 'us_reits'],
    });
    // a SEC não publica o lucro descontado nem FFO/ocupação
    for (const s of ['net_income_adjusted', 'occupancy', 'ffo_per_share'] as const) {
      expect(FONTE_SEC.seriesOferecidas).not.toContain(s);
    }
  });

  it('pontos na unidade do catálogo (US$), um conjunto por ticker do CIK', () => {
    const pontos = pontosSec({ cik: aapl.cik, fys: aapl.fys }, ['GOOG', 'GOOGL'], 'stock');
    const rec = pontos.filter((p) => p.serie === 'revenue' && p.anoFiscal === 2025);
    expect(rec.map((p) => p.symbol)).toEqual(['GOOG', 'GOOGL']);
    // receita de 2025 da AAPL em dólares (US$ 416,2 bi)
    expect(rec[0].valor).toBeCloseTo(416_161e6, -6);
    expect(rec[0]).toMatchObject({ fonte: 'sec', tipoPeriodo: 'FY', incompleto: false });
    expect(pontos.some((p) => p.serie === 'dividend_per_share')).toBe(false);
  });

  it('REIT: séries substitutas (DPA, FCO/ação, dividendos/FCO), nada de ocupação', () => {
    const pontos = pontosSec({ cik: o.cik, fys: o.fys }, ['O'], 'reit');
    const series = new Set(pontos.map((p) => p.serie));
    expect([...series].sort()).toEqual(
      [
        'cash_payout_pct',
        'dividend_per_share',
        'net_debt_ebitda',
        'ocf_per_share',
        'revenue',
      ].sort(),
    );
  });

  it('resolverSeries com a prioridade do mercado devolve as séries em US$ mi com origem sec', () => {
    const r = resolverSeries({
      pontos: pontosSec({ cik: aapl.cik, fys: aapl.fys }, ['AAPL'], 'stock'),
      series: ['revenue', 'net_income_adjusted', 'net_income'],
      fontes: fontesDoMercado(fontesEfetivas(CRITERIA_PARAMS_V3), 'stock'),
    });
    expect(r.series.revenue?.[2025]).toBeCloseTo(416_161, 0);
    expect(r.origens.revenue?.[2025]).toMatchObject({ fonte: 'sec' });
    expect(r.series.net_income_adjusted ?? {}).toEqual({});
  });

  it('lerLocalSec: só ativos stock/reit com emissorId CIK, filtrando desdeAno', async () => {
    const findMany = vi.fn(async () => []);
    const prisma = { assetFundamentalsPeriod: { findMany } } as unknown as PrismaClient;
    const r = await lerLocalSec(
      prisma,
      [
        { symbol: 'AAPL', emissorId: 'CIK:0000320193', classe: 'stock', mercado: 'us_stocks' },
        { symbol: 'PETR4', emissorId: '33000167000101', classe: 'acao', mercado: 'br_acoes' },
      ],
      2020,
    );
    expect(r).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({
          emissorId: { in: ['CIK:0000320193'] },
          source: 'SEC',
          tipoPeriodo: 'FY',
          escopo: 'con',
          anoFiscal: { gte: 2020 },
        }),
      }),
    ]);
  });
});
