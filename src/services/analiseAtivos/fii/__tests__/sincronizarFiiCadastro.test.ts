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
    // FIAGRO nunca entra; IRDM11 entra fechado (histórico manual)
    expect(por.AGRO11).toBeUndefined();
    expect(por.IRDM11.validTo).toEqual(new Date('2025-10-31T00:00:00Z'));

    expect(r.detalhes).toMatchObject({ fiis: 6, excluidosTipo: 1, casados: 5 });
    expect(cont.linhasLidas).toBe(6);
    expect(alertas.filter((a) => a.codigo === 'fii_sigla_nova')).toHaveLength(5);
  });

  it('dry-run (aplicar=false) não grava', async () => {
    const prisma = prismaFalso();
    const { ctx } = ctxFalso(prisma, false);
    await sincronizarFiiCadastro(ctx, {
      listaB3: lista,
      cacheDir,
      anos: [2026],
      baixarDetalhe: async (i) => detalhes[i.acronym] ?? null,
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
        ...vig('IRDM11', '28.830.325/0001-10', 'manual', true, 'x'),
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
    });
    expect(r.detalhes).toMatchObject({ plano: { abrir: 0, fechar: 0, atualizar: 0 } });
    // prioridade = AGRO (sem vigente); rolante: KNRI (não conferido) antes de HGLG; manuais nunca
    expect(baixarDetalhe.mock.calls.map(([i]) => i.acronym)).toEqual(['AGRO', 'KNRI']);
  });
});
