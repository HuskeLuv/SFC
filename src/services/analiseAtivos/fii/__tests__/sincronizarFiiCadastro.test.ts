import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sincronizarFiiCadastro } from '@/services/analiseAtivos/fii/sincronizarFiiCadastro';
import type { DetalheFundoB3, ItemListaB3Bruto } from '@/services/analiseAtivos/fii/listaB3Fii';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  CNPJ,
  jsonFixture,
  textoFixture,
} from '@/services/analiseAtivos/regras/fii/__tests__/fixturesFii';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';

const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'fii-cadastro-'));
afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));
{
  const z = new AdmZip();
  for (const e of ['geral', 'complemento', 'ativo_passivo']) {
    z.addFile(
      `inf_mensal_fii_${e}_2026.csv`,
      Buffer.from(textoFixture(`inf_mensal_fii_${e}_2026_amostra.csv`), 'latin1'),
    );
  }
  z.writeZip(path.join(cacheDir, 'inf_mensal_fii_2026.zip'));
}

const lista = [
  ...jsonFixture<{ itens: ItemListaB3Bruto[] }>('b3-fii-lista-amostra.json').itens,
  {
    id: 9999,
    acronym: 'AGRO',
    fundName: 'AGRO FIAGRO',
    tradingName: 'FIAGRO AGRO',
    typeName: null,
  },
];

function prismaFalso(mapa: unknown[] = []) {
  const p = {
    fiiTickerMap: {
      findMany: vi.fn().mockResolvedValue(mapa),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    assetQuoteResumo: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return p;
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
    hoje: '2026-09-30',
    origem: 'script',
    aplicar,
  };
  return { ctx, alertas, cont };
}

const detalhes: Record<string, DetalheFundoB3> = {
  HGLG: { cnpj: '11728688000147', tradingCode: 'HGLG11', typeName: 'FII' },
  AGRO: { cnpj: '00000000000191', tradingCode: 'AGRO11', typeName: 'FIAGRO' },
};

beforeEach(() => vi.clearAllMocks());

describe('sincronizarFiiCadastro', () => {
  it('casa a lista B3 com o informe e grava o mapa (manual, CNPJ B3, nome)', async () => {
    const prisma = prismaFalso();
    const { ctx, alertas, cont } = ctxFalso(prisma);
    const baixarDetalhe = vi.fn(async (i: ItemListaB3Bruto) => detalhes[i.acronym] ?? null);
    const r = await sincronizarFiiCadastro(ctx, {
      listaB3: lista,
      cacheDir,
      anos: [2026],
      baixarDetalhe,
      maxDetalhes: 10,
      candidatosFiagro: [],
    });

    expect(baixarDetalhe).toHaveBeenCalledTimes(6); // todos novos ⇒ prioridade
    const criadas = prisma.fiiTickerMap.createMany.mock.calls[0][0].data as Array<{
      ticker: string;
      cnpj: string;
      origem: string;
      conferido: boolean;
      validTo: Date | null;
    }>;
    const por = Object.fromEntries(criadas.map((c) => [c.ticker, c]));
    expect(por.HGLG11).toMatchObject({ cnpj: CNPJ.HGLG, origem: 'b3_cnpj', conferido: true });
    expect(por.BTCI11).toMatchObject({ cnpj: CNPJ.BTCI, origem: 'manual', conferido: true });
    expect(por.IRIM11).toMatchObject({ cnpj: CNPJ.IRIM, origem: 'manual' });
    expect(por.TRXF11).toMatchObject({ cnpj: CNPJ.TRXF, origem: 'manual' });
    // KNRI casa pelo nome; sem cotação (COTAHIST ainda não rodou) ⇒ não conferido
    expect(por.KNRI11).toMatchObject({ cnpj: CNPJ.KNRI, origem: 'b3_nome', conferido: false });
    // FIAGRO (pelo detalhe da B3) entra com o tipo; sem informe recente do CNPJ ⇒ não conferido.
    // IRDM11 entra fechado (histórico manual)
    expect(por.AGRO11).toMatchObject({
      cnpj: '00000000000191',
      origem: 'b3_cnpj',
      conferido: false,
      tipoFundo: 'FIAGRO',
      motivo: 'cnpj_b3_sem_informe_recente',
    });
    expect(por.HGLG11).toMatchObject({ tipoFundo: 'FII' });
    expect(por.IRDM11.validTo).toEqual(new Date('2025-10-31T00:00:00Z'));

    expect(r.detalhes).toMatchObject({
      fiis: 6,
      excluidosTipo: 0,
      casados: 6,
      porTipo: { FII: 5, FIAGRO: 1 },
    });
    expect(cont.linhasLidas).toBe(6);
    expect(alertas.filter((a) => a.codigo === 'fii_sigla_nova')).toHaveLength(6);
  });

  it('dry-run (aplicar=false) não grava', async () => {
    const prisma = prismaFalso();
    const { ctx } = ctxFalso(prisma, false);
    await sincronizarFiiCadastro(ctx, {
      listaB3: lista,
      cacheDir,
      anos: [2026],
      baixarDetalhe: async (i) => detalhes[i.acronym] ?? null,
      candidatosFiagro: [],
    });
    expect(prisma.fiiTickerMap.createMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('2ª execução com o mapa igual não abre nem fecha nada; só consulta o lote rolante', async () => {
    const vig = (
      ticker: string,
      cnpj: string,
      origem: string,
      conferido: boolean,
      motivo: string,
    ) => ({
      id: `id-${ticker}`,
      ticker,
      cnpj,
      validFrom: new Date('2026-09-29T00:00:00Z'),
      validTo: null,
      origem,
      conferido,
      conferidoPor:
        origem === 'manual'
          ? 'manual:tickersManuais'
          : origem === 'b3_cnpj'
            ? 'auto_b3_cnpj'
            : null,
      motivo,
      nomeB3: lista.find((i) => `${i.acronym}11` === ticker)?.tradingName ?? null,
      fetchedAt: new Date('2026-09-29T00:00:00Z'),
    });
    const mapa = [
      vig('HGLG11', CNPJ.HGLG, 'b3_cnpj', true, 'cnpj_b3;cnpj_sem_cotacao'),
      vig('BTCI11', CNPJ.BTCI, 'manual', true, 'manual'),
      vig('IRIM11', CNPJ.IRIM, 'manual', true, 'manual'),
      vig('TRXF11', CNPJ.TRXF, 'manual', true, 'manual'),
      vig('KNRI11', CNPJ.KNRI, 'b3_nome', false, 'nome_igual;nome_sem_cotacao'),
      {
        ...vig('IRDM11', '28830325000110', 'manual', true, 'x'),
        validTo: new Date('2025-10-31T00:00:00Z'),
      },
    ];
    const prisma = prismaFalso(mapa);
    const { ctx } = ctxFalso(prisma);
    const baixarDetalhe = vi.fn(async (i: ItemListaB3Bruto) => detalhes[i.acronym] ?? null);
    const r = await sincronizarFiiCadastro(ctx, {
      listaB3: lista,
      cacheDir,
      anos: [2026],
      baixarDetalhe,
      maxDetalhes: 2,
      candidatosFiagro: [],
    });
    // só o AGRO11 (Fiagro pelo detalhe, antes excluído) abre; o resto fica igual
    expect(r.detalhes).toMatchObject({ plano: { abrir: 1, fechar: 0, atualizar: 0 } });
    // prioridade = AGRO (sem vigente); rolante: KNRI (não conferido) antes de HGLG; manuais nunca
    expect(baixarDetalhe.mock.calls.map(([i]) => i.acronym)).toEqual(['AGRO', 'KNRI']);
  });

  it('listas FIAGRO e FI-INFRA: CNPJ da B3 conferido com o informe de Fiagro / o diário', async () => {
    const prisma = prismaFalso();
    prisma.assetQuoteResumo.findMany.mockResolvedValue([
      { symbol: 'KNCA11', closeRaw: { toNumber: () => 83.6 }, ultimoPregao: new Date() },
      { symbol: 'KDIF11', closeRaw: { toNumber: () => 104.9 }, ultimoPregao: new Date() },
    ]);
    const { ctx } = ctxFalso(prisma);
    const fundos: ItemListaB3Bruto[] = [
      {
        id: 6627,
        acronym: 'KNCA',
        fundName: 'KINEA CRÉDITO AGRO FIAGRO',
        tradingName: 'FIAGRO KINEA',
        typeName: null,
        tipoFundo: 'FIAGRO',
      },
      {
        id: 27,
        acronym: 'KDIF',
        fundName: 'KINEA INFRA',
        tradingName: 'KINEA INFRAF',
        typeName: 'FI-INFRA',
        tipoFundo: 'FI-INFRA',
      },
    ];
    const det: Record<string, DetalheFundoB3> = {
      KNCA: { cnpj: '41745701000137', tradingCode: 'KNCA11', typeName: 'FIAGRO' },
      KDIF: { cnpj: '26324298000189', tradingCode: 'KDIF11', typeName: 'FI-INFRA' },
    };
    const candidatosFiInfra = vi.fn(async (cnpjs: Set<string>) =>
      [...cnpjs].map((cnpj) => ({
        cnpj,
        nomes: [],
        isin: null,
        ultimoMes: '2026-09-01',
        bolsa: true,
        pl: 2771158833.09,
        cotas: 23484769.3431,
      })),
    );
    const r = await sincronizarFiiCadastro(ctx, {
      listaB3: [...lista, ...fundos],
      cacheDir,
      anos: [2026],
      baixarDetalhe: async (i) => det[i.acronym] ?? detalhes[i.acronym] ?? null,
      maxDetalhes: 20,
      candidatosFiagro: [
        {
          cnpj: '41745701000137',
          nomes: ['KINEA CRÉDITO AGRO FIAGRO-IMOBILIÁRIO'],
          isin: 'BRKNCACTF014',
          ultimoMes: '2026-09-01',
          bolsa: true,
          pl: 2164726036.54,
          cotas: 21599919,
        },
      ],
      candidatosFiInfra,
    });
    expect(candidatosFiInfra).toHaveBeenCalledWith(new Set(['26324298000189']));
    const criadas = prisma.fiiTickerMap.createMany.mock.calls[0][0].data as Array<{
      ticker: string;
      tipoFundo: string;
      conferido: boolean;
      conferidoPor: string | null;
      isin: string | null;
    }>;
    const por = Object.fromEntries(criadas.map((c) => [c.ticker, c]));
    expect(por.KNCA11).toMatchObject({
      tipoFundo: 'FIAGRO',
      conferido: true,
      conferidoPor: 'auto_pl_cotacao',
      isin: 'BRKNCACTF014',
    });
    expect(por.KDIF11).toMatchObject({
      tipoFundo: 'FI-INFRA',
      conferido: true,
      conferidoPor: 'auto_pl_cotacao',
    });
    expect(r.detalhes).toMatchObject({ candidatosFiagro: 1, candidatosFiInfra: 1 });
  });
});
