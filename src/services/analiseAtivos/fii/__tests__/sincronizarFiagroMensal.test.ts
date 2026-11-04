import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  comFundosPapel,
  ehFonteDedicada,
  existentesDeOutraFonte,
  type LinhaFiiMensal,
} from '@/services/analiseAtivos/fii/gravarFii';
import {
  mesesDesdeInicioFiagro,
  sincronizarFiagroMensal,
} from '@/services/analiseAtivos/fii/sincronizarFiagroMensal';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { textoFixture } from '@/services/analiseAtivos/regras/fii/__tests__/fixturesFii';
import type { AlertaJob, FiiTipo, JobContexto } from '@/services/analiseAtivos/tipos';

const KNCA = '41745701000137';
const RURA = '42479593000160';
const URL_FII = 'https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_2025.zip';
const URL_FIAGRO =
  'https://dados.cvm.gov.br/dados/FIAGRO/DOC/INF_MENSAL/DADOS/inf_mensal_fiagro_202609.zip';

const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'fiagro-mensal-'));
afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));
{
  const z = new AdmZip();
  z.addFile(
    'inf_mensal_fiagro_202609.csv',
    Buffer.from(textoFixture('inf_mensal_fiagro_202609_amostra.csv'), 'latin1'),
  );
  z.writeZip(path.join(cacheDir, 'inf_mensal_fiagro_202609.zip'));
}

function prismaFalso(gravados: Array<Record<string, unknown>> = []) {
  return {
    fiiTickerMap: { findMany: vi.fn().mockResolvedValue([{ cnpj: KNCA }, { cnpj: RURA }]) },
    fiiTipoOverride: { findMany: vi.fn().mockResolvedValue([]) },
    fiiMonthly: {
      findMany: vi.fn().mockResolvedValue(gravados),
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

describe('helpers de fonte e tipo (Fiagro/FI-Infra)', () => {
  it('comFundosPapel: Fiagro/FI-Infra viram papel; override manual vale', () => {
    const o = comFundosPapel(new Map<string, FiiTipo>([[RURA, 'fof']]), [KNCA, RURA]);
    expect(o.get(KNCA)).toBe('papel');
    expect(o.get(RURA)).toBe('fof');
  });

  it('ehFonteDedicada: informe de Fiagro e informe diário; o de FII não', () => {
    expect(ehFonteDedicada(URL_FIAGRO)).toBe(true);
    expect(
      ehFonteDedicada(
        'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202609.zip',
      ),
    ).toBe(true);
    expect(ehFonteDedicada(URL_FII)).toBe(false);
    expect(ehFonteDedicada(null)).toBe(false);
  });

  it('existentesDeOutraFonte: linha de outra fonte entra com versão 0', () => {
    const linha = { cnpj: KNCA, refMonth: '2025-05-01', versao: 3, sourceUrl: URL_FII };
    const m = new Map([[`${KNCA}|2025-05-01`, linha as unknown as LinhaFiiMensal]]);
    expect(
      existentesDeOutraFonte(m, (u) => u === URL_FIAGRO).get(`${KNCA}|2025-05-01`),
    ).toMatchObject({ versao: 0 });
    expect(existentesDeOutraFonte(m, (u) => u === URL_FII).get(`${KNCA}|2025-05-01`)).toMatchObject(
      { versao: 3 },
    );
  });

  it('mesesDesdeInicioFiagro: 202505 até o mês anterior ao corrente', () => {
    const m = mesesDesdeInicioFiagro('2026-11-04');
    expect(m[0]).toBe('2025-05-01');
    expect(m[m.length - 1]).toBe('2026-10-01');
    expect(m).toHaveLength(18);
  });
});

describe('sincronizarFiagroMensal', () => {
  it('grava os Fiagros do mapa como FII de papel, segmento Fiagro', async () => {
    const prisma = prismaFalso();
    const { ctx, cont } = ctxFalso(prisma);
    const r = await sincronizarFiagroMensal(ctx, { meses: ['2026-09-01'], cacheDir });
    expect(prisma.fiiTickerMap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipoFundo: { in: ['FIAGRO'] } } }),
    );
    const criadas = prisma.fiiMonthly.createMany.mock.calls[0][0].data as Array<{
      cnpj: string;
      tipoVigente: string;
      reguaVigente: string;
      segmentoCvm: string;
      dyMesCvmPct: number;
      sourceUrl: string;
    }>;
    expect(criadas.map((c) => c.cnpj).sort()).toEqual([KNCA, RURA]);
    for (const c of criadas) {
      expect(c).toMatchObject({
        tipoVigente: 'papel',
        reguaVigente: 'fii_papel',
        segmentoCvm: 'Fiagro',
        sourceUrl: URL_FIAGRO,
      });
    }
    expect(criadas.find((c) => c.cnpj === KNCA)!.dyMesCvmPct).toBeCloseTo(0.93, 6);
    expect(cont.linhasGravadas).toBe(2);
    expect(r.detalhes).toMatchObject({ cnpjsUniverso: 2 });
  });

  it('mês gravado antes pelo informe de FII (versão maior) é sobrescrito pelo de Fiagro', async () => {
    const doFii = {
      id: 'x',
      cnpj: KNCA,
      refMonth: new Date('2026-09-01T00:00:00Z'),
      versao: 4,
      dtEntrega: null,
      vpCota: null,
      vpCotaRecalculado: false,
      pl: null,
      cotas: null,
      cotistas: null,
      dyMesCvmPct: null,
      rentEfetivaMesPct: null,
      taxaAdmPct: null,
      ativoTotal: null,
      passivoTotal: null,
      rendDistribuir: null,
      obrigAquisicao: null,
      obrigSecuritizacao: null,
      outrosValoresPagar: null,
      valoresReceber: null,
      imoveis: null,
      spe: null,
      cri: null,
      lciLca: null,
      cotasFii: null,
      rendaFixa: null,
      acoes: null,
      segmentoCvm: 'Títulos e Val. Mob.',
      tipoComposicao: 'papel',
      tipoVigente: 'papel',
      reguaVigente: 'fii_papel',
      obrigacoesPlPct: null,
      obrigacoesAtivoPct: null,
      fatorDesdobramento: null,
      flags: [],
      sourceUrl: URL_FII,
    };
    const prisma = prismaFalso([doFii]);
    const { ctx } = ctxFalso(prisma);
    await sincronizarFiagroMensal(ctx, { meses: ['2026-09-01'], cacheDir });
    expect(prisma.fiiMonthly.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cnpj_refMonth: { cnpj: KNCA, refMonth: new Date('2026-09-01T00:00:00Z') } },
        data: expect.objectContaining({ sourceUrl: URL_FIAGRO, segmentoCvm: 'Fiagro' }),
      }),
    );
  });

  it('dry-run não grava; mapa sem Fiagro ⇒ aviso e nada lido', async () => {
    const prisma = prismaFalso();
    const { ctx } = ctxFalso(prisma, false);
    await sincronizarFiagroMensal(ctx, { meses: ['2026-09-01'], cacheDir });
    expect(prisma.fiiMonthly.createMany).not.toHaveBeenCalled();

    const vazio = prismaFalso();
    vazio.fiiTickerMap.findMany.mockResolvedValue([]);
    const c2 = ctxFalso(vazio);
    const r = await sincronizarFiagroMensal(c2.ctx, { meses: ['2026-09-01'], cacheDir });
    expect(r.detalhes).toEqual({ cnpjs: 0 });
    expect(c2.alertas.map((a) => a.codigo)).toEqual(['fiagro_mapa_vazio']);
  });
});
