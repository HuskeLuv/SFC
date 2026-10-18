import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';
import {
  EMAIL_DEMO,
  RECURSO_BETA_ANALISE,
  VALIDO_DESDE_CRITERIOS,
  avaliarCriteriosFixtures,
  seedAnaliseAtivos,
} from '../seedAnaliseAtivos';
import { CRITERIA_PARAMS_V1_JSON } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { CRITERIA_PARAMS_V2_JSON } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { CRITERIA_PARAMS_V3_JSON } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { semearFixturesEua } from '../seedAnaliseAtivosEua';

const MODELOS_FASE0 = [
  'scoringParams',
  'cvmCompany',
  'cvmCompanyTicker',
  'assetSetorB3',
  'fiiTickerMap',
  'fiiMonthly',
  'fiiQuarterly',
  'assetFundamentalsPeriod',
  'assetShareCount',
  'assetQuoteResumo',
  'assetQuoteDaily',
  'assetProventoAuditado',
  'assetCorporateActionCheck',
  'assetPerShareYearly',
  'assetMultiplesYearly',
  'assetMultiplesCurrent',
  'assetScore',
  'assetEvento',
];

function prismaFalso(scores: number) {
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  const p: Record<string, unknown> = {
    assetScore: { count: vi.fn().mockResolvedValue(scores), createMany },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'demo-1' }) },
    featureBetaUser: { upsert: vi.fn().mockResolvedValue({}) },
    asset: {
      findMany: vi.fn().mockResolvedValue([{ id: 'asset-wege', symbol: 'WEGE3' }]),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    analiseQuadroLinha: { createMany },
  };
  for (const m of MODELOS_FASE0) if (!p[m]) p[m] = { createMany };
  return { prisma: p as unknown as PrismaClient, createMany, p };
}

/** v2.4: o job 'criterios' das fixtures é injetado (o real roda no banco efêmero do CI). */
const avaliarCriterios = vi.fn(async () => 19);
const deps = { avaliarCriterios };

describe('seedAnaliseAtivos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('banco com dados da Fase 0: não carrega fixtures, só põe o demo no beta', async () => {
    const { prisma, createMany, p } = prismaFalso(10);
    const r = await seedAnaliseAtivos(prisma, deps);
    expect(r).toEqual({ fixtures: null, demoNoBeta: true });
    expect(createMany).not.toHaveBeenCalled();
    // banco com dados reais: o job 'criterios' é o do cron, não o do seed
    expect(avaliarCriterios).not.toHaveBeenCalled();
    const upsert = (p.featureBetaUser as { upsert: ReturnType<typeof vi.fn> }).upsert;
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recurso_userId: { recurso: RECURSO_BETA_ANALISE, userId: 'demo-1' } },
        update: {},
      }),
    );
    expect((p.user as { findUnique: ReturnType<typeof vi.fn> }).findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: EMAIL_DEMO } }),
    );
  });

  it('banco vazio: carrega todas as tabelas com skipDuplicates (idempotente) e o Quadro', async () => {
    const { prisma, createMany, p } = prismaFalso(0);
    const r = await seedAnaliseAtivos(prisma, deps);
    expect(r.fixtures).not.toBeNull();
    // v2.4: critérios avaliados sobre as fixtures depois do Quadro
    expect(avaliarCriterios).toHaveBeenCalledWith(prisma);
    expect(r.fixtures?.quadroComCriterios).toBe(19);
    for (const m of MODELOS_FASE0) expect(r.fixtures?.[m], m).toBeGreaterThan(0);
    expect(r.fixtures?.analiseQuadroLinha).toBeGreaterThanOrEqual(19);
    for (const call of createMany.mock.calls)
      expect(call[0]).toMatchObject({ skipDuplicates: true });
    // BigInt revivido na cotação diária; assetId do Quadro remapeado pelo catálogo do banco
    const daily = createMany.mock.calls.find(
      (c) => (c[0].data[0] as Record<string, unknown>)?.quantidade !== undefined,
    );
    expect(typeof (daily?.[0].data[0] as Record<string, unknown>).quantidade).toBe('bigint');
    const quadro = createMany.mock.calls[createMany.mock.calls.length - 1][0].data as Array<
      Record<string, unknown>
    >;
    expect(quadro.find((l) => l.symbol === 'WEGE3')?.assetId).toBe('asset-wege');
    expect(quadro.find((l) => l.symbol === 'HGLG11')?.assetId).toBeNull();
    // catálogo dos símbolos da amostra (ação = stock, FII = fii), antes de ligar o assetId
    const catalogo = (p.asset as { createMany: ReturnType<typeof vi.fn> }).createMany.mock
      .calls[0][0] as { data: Array<Record<string, unknown>>; skipDuplicates: boolean };
    expect(catalogo.skipDuplicates).toBe(true);
    expect(catalogo.data.find((a) => a.symbol === 'ITUB4')).toMatchObject({
      type: 'stock',
      currency: 'BRL',
    });
    expect(catalogo.data.find((a) => a.symbol === 'HGLG11')?.type).toBe('fii');
    expect(r.fixtures?.asset).toBe(catalogo.data.length);
  });

  it('EUA (fatia 0): fixtures EUA depois das BR, só no banco efêmero; o stub não grava nada', async () => {
    const semearEua = vi.fn(async () => 2);
    const vazio = prismaFalso(0);
    const r = await seedAnaliseAtivos(vazio.prisma, { avaliarCriterios, semearEua });
    expect(semearEua).toHaveBeenCalledWith(vazio.prisma);
    expect(r.fixtures?.quadroEua).toBe(2);
    semearEua.mockClear();
    await seedAnaliseAtivos(prismaFalso(10).prisma, { avaliarCriterios, semearEua });
    expect(semearEua).not.toHaveBeenCalled();
    expect(await semearFixturesEua(vazio.prisma)).toBe(0);
  });

  it('sem usuário demo não quebra', async () => {
    const { prisma, p } = prismaFalso(10);
    (p.user as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue(null);
    expect((await seedAnaliseAtivos(prisma, deps)).demoNoBeta).toBe(false);
  });

  it('fixtures cobrem os estados da amostra (incompleto, zero_regra, sem_score, FoF, fora do Quadro)', () => {
    const linhas = JSON.parse(
      readFileSync(
        path.join(__dirname, '..', 'fixtures', 'analise-ativos', 'quadro-linhas.json'),
        'utf8',
      ),
    ) as Array<{ symbol: string; estadoIndice: string; noQuadro: boolean; dataRef: string }>;
    const por = new Map(linhas.map((l) => [l.symbol, l]));
    expect(por.get('TGMA3')?.estadoIndice).toBe('incompleto');
    expect(por.get('AURE3')?.estadoIndice).toBe('zero_regra');
    expect(por.get('HCTR11')?.estadoIndice).toBe('sem_score');
    expect(por.get('HFOF11')?.estadoIndice).toBe('fora_do_indice');
    expect(por.get('WEGE3')?.estadoIndice).toBe('calculado');
    expect(linhas.some((l) => !l.noQuadro)).toBe(true);
  });
});

describe('avaliarCriteriosFixtures (v2.4)', () => {
  it('grava criteria_params v1, v2 e v3 (idempotente; v3 vigente) e copia a forma compacta para as linhas do Quadro', async () => {
    const criteriaParams = {
      createMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => ({ version: 3, params: CRITERIA_PARAMS_V3_JSON })),
    };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const $queryRaw = vi.fn(async () => [
      {
        symbol: 'WEGE3',
        perfil: 'acao',
        janela: 5,
        atendidos: 5,
        aplicaveis: 6,
        paramsVersion: 1,
        m: [['rec', 'atende', 'cresceu em 5 de 5 anos']],
      },
    ]);
    // o job roda com um universo vazio (cadastro sem tickers) e não grava nada além do Quadro
    const prisma = {
      criteriaParams,
      analiseQuadroLinha: { updateMany, findMany: vi.fn(async () => []) },
      $queryRaw,
      analiseJobRun: { findFirst: vi.fn(async () => null) },
      scoringParams: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
      cvmCompanyTicker: { findMany: vi.fn(async () => []) },
      fiiTickerMap: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<number>) =>
        fn({
          criteriaEval: {
            deleteMany: vi.fn(async () => ({ count: 0 })),
            createMany: vi.fn(async () => ({ count: 0 })),
          },
        }),
      ),
    } as unknown as PrismaClient;
    const n = await avaliarCriteriosFixtures(prisma);
    expect(n).toBe(1);
    expect(criteriaParams.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          version: 1,
          params: CRITERIA_PARAMS_V1_JSON,
          validFrom: VALIDO_DESDE_CRITERIOS,
          createdBy: 'seed',
        }),
        expect.objectContaining({
          version: 2,
          params: CRITERIA_PARAMS_V2_JSON,
          validFrom: VALIDO_DESDE_CRITERIOS,
          createdBy: 'seed',
        }),
        expect.objectContaining({
          version: 3,
          params: CRITERIA_PARAMS_V3_JSON,
          validFrom: VALIDO_DESDE_CRITERIOS,
          createdBy: 'seed',
        }),
      ],
      skipDuplicates: true,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { symbol: 'WEGE3' },
      data: {
        perfilCriterios: 'acao',
        criterios: { '5': { n: 5, de: 6, m: [['rec', 'atende', 'cresceu em 5 de 5 anos']] } },
      },
    });
  });
});
