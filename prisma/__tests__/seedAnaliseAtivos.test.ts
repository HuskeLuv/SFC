import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';
import { EMAIL_DEMO, RECURSO_BETA_ANALISE, seedAnaliseAtivos } from '../seedAnaliseAtivos';

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
    asset: { findMany: vi.fn().mockResolvedValue([{ id: 'asset-wege', symbol: 'WEGE3' }]) },
    analiseQuadroLinha: { createMany },
  };
  for (const m of MODELOS_FASE0) if (!p[m]) p[m] = { createMany };
  return { prisma: p as unknown as PrismaClient, createMany, p };
}

describe('seedAnaliseAtivos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('banco com dados da Fase 0: não carrega fixtures, só põe o demo no beta', async () => {
    const { prisma, createMany, p } = prismaFalso(10);
    const r = await seedAnaliseAtivos(prisma);
    expect(r).toEqual({ fixtures: null, demoNoBeta: true });
    expect(createMany).not.toHaveBeenCalled();
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
    const { prisma, createMany } = prismaFalso(0);
    const r = await seedAnaliseAtivos(prisma);
    expect(r.fixtures).not.toBeNull();
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
  });

  it('sem usuário demo não quebra', async () => {
    const { prisma, p } = prismaFalso(10);
    (p.user as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue(null);
    expect((await seedAnaliseAtivos(prisma)).demoNoBeta).toBe(false);
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
