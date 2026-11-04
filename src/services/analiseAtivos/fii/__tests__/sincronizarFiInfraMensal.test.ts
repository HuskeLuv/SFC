import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  FLAG_SEM_COMPOSICAO,
  mesesFechadosDesde,
  sincronizarFiInfraMensal,
} from '@/services/analiseAtivos/fii/sincronizarFiInfraMensal';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { textoFixture } from '@/services/analiseAtivos/regras/fii/__tests__/fixturesFii';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';

const KDIF = '26324298000189';
const JURO = '42730834000100';
const SEM_LINHA = '99999999000191';
const URL_DIARIO =
  'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202609.zip';

const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'fi-infra-mensal-'));
afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));
{
  const z = new AdmZip();
  z.addFile(
    'inf_diario_fi_202609.csv',
    Buffer.from(textoFixture('inf_diario_fi_202609_amostra.csv'), 'latin1'),
  );
  z.writeZip(path.join(cacheDir, 'inf_diario_fi_202609.zip'));
}

function prismaFalso() {
  return {
    fiiTickerMap: {
      findMany: vi.fn().mockResolvedValue([{ cnpj: KDIF }, { cnpj: JURO }, { cnpj: SEM_LINHA }]),
    },
    fiiTipoOverride: { findMany: vi.fn().mockResolvedValue([]) },
    fiiMonthly: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

function ctxFalso(prisma: ReturnType<typeof prismaFalso>, aplicar = true) {
  const alertas: AlertaJob[] = [];
  const cont = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma: prisma as unknown as PrismaClient,
    prazo: Date.now() + 120_000,
    restanteMs: () => 120_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (c, n = 1) => {
      cont[c] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-11-04',
    origem: 'script',
    aplicar,
  };
  return { ctx, alertas, cont };
}

describe('sincronizarFiInfraMensal (FI-Infra leve)', () => {
  it('mesesFechadosDesde: de 2021-01 (ou do pedido) até o mês anterior ao corrente', () => {
    expect(mesesFechadosDesde('2026-11-04', '2026-08-01')).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(mesesFechadosDesde('2021-03-10')).toEqual(['2021-01-01', '2021-02-01']);
    expect(mesesFechadosDesde('2026-11-04', '2019-01-01')[0]).toBe('2021-01-01');
  });

  it('grava o fechamento do mês como FII de papel, segmento FI-Infra, sem composição', async () => {
    const prisma = prismaFalso();
    const { ctx, alertas, cont } = ctxFalso(prisma);
    await sincronizarFiInfraMensal(ctx, { meses: ['2026-09-01'], cacheDir });
    expect(prisma.fiiTickerMap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipoFundo: { in: ['FI-INFRA'] } } }),
    );
    const criadas = prisma.fiiMonthly.createMany.mock.calls[0][0].data as Array<{
      cnpj: string;
      pl: number;
      cotas: number;
      vpCota: number;
      cotistas: number;
      cri: number | null;
      tipoComposicao: string | null;
      tipoVigente: string;
      reguaVigente: string;
      segmentoCvm: string;
      flags: string[];
      sourceUrl: string;
    }>;
    expect(criadas.map((c) => c.cnpj).sort()).toEqual([KDIF, JURO]);
    const kdif = criadas.find((c) => c.cnpj === KDIF)!;
    expect(kdif).toMatchObject({
      pl: 2771158833.09,
      vpCota: 117.9981286,
      cotistas: 55632,
      cri: null,
      tipoComposicao: null,
      tipoVigente: 'papel',
      reguaVigente: 'fii_papel',
      segmentoCvm: 'FI-Infra',
      sourceUrl: URL_DIARIO,
    });
    expect(kdif.cotas).toBeCloseTo(2771158833.09 / 117.9981286, 3);
    expect(kdif.flags).toContain(FLAG_SEM_COMPOSICAO);
    expect(cont.linhasGravadas).toBe(2);
    expect(alertas.map((a) => a.codigo)).toContain('fi_infra_sem_informe_diario');
  });

  it('dry-run não grava; mapa sem FI-Infra ⇒ aviso', async () => {
    const prisma = prismaFalso();
    await sincronizarFiInfraMensal(ctxFalso(prisma, false).ctx, {
      meses: ['2026-09-01'],
      cacheDir,
    });
    expect(prisma.fiiMonthly.createMany).not.toHaveBeenCalled();

    const vazio = prismaFalso();
    vazio.fiiTickerMap.findMany.mockResolvedValue([]);
    const c = ctxFalso(vazio);
    expect((await sincronizarFiInfraMensal(c.ctx, { meses: ['2026-09-01'] })).detalhes).toEqual({
      cnpjs: 0,
    });
    expect(c.alertas.map((a) => a.codigo)).toEqual(['fi_infra_mapa_vazio']);
  });
});
