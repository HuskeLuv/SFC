import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urlCotahistDiario } from '@/services/analiseAtivos/b3/b3Arquivos';
import {
  pregoesSemCotacao,
  recalcularResumoCotacoes,
  sincronizarCotahist,
  ultimosPregoes,
} from '@/services/analiseAtivos/b3/sincronizarCotahist';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import {
  LINHAS_AGO_2026,
  LINHAS_AMOSTRA,
  comData,
  dados,
  linhaDe,
  stubFetch,
  zipCotahist,
} from './helpers';

type Linha = {
  symbol: string;
  date: Date;
  closeRaw: { toNumber(): number };
  volumeFin: { toNumber(): number };
  codBdi: string;
  especi: string | null;
};

/** Prisma falso com as operações que a fatia C usa, em memória. */
function criarPrisma(
  eventos: Array<{ symbol: string; date: string; type: string; factor: number }> = [],
) {
  const quotes = new Map<string, Linha>();
  const resumo = { updateMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const prisma = {
    assetQuoteDaily: {
      groupBy: vi.fn(async ({ where }: { where: { date: { in: Date[] } } }) => {
        const alvo = new Set(where.date.in.map(iso));
        const datas = new Set(
          [...quotes.values()].map((q) => iso(q.date)).filter((d) => alvo.has(d)),
        );
        return [...datas].map((d) => ({ date: new Date(`${d}T00:00:00.000Z`) }));
      }),
      createMany: vi.fn(async ({ data }: { data: Linha[] }) => {
        let count = 0;
        for (const l of data) {
          const k = `${l.symbol}|${iso(l.date)}`;
          if (!quotes.has(k)) {
            quotes.set(k, l);
            count++;
          }
        }
        return { count };
      }),
      aggregate: vi.fn(async () => {
        const ds = [...quotes.values()].map((q) => q.date.getTime());
        return { _max: { date: ds.length ? new Date(Math.max(...ds)) : null } };
      }),
      findMany: vi.fn(async ({ where }: { where: { date: { gte: Date } } }) =>
        [...quotes.values()]
          .filter((q) => q.date >= where.date.gte)
          .sort((a, b) =>
            a.symbol === b.symbol
              ? a.date.getTime() - b.date.getTime()
              : a.symbol < b.symbol
                ? -1
                : 1,
          ),
      ),
    },
    assetQuoteResumo: resumo,
    assetCorporateAction: {
      findMany: vi.fn(async ({ where }: { where: { symbol: { in: string[] } } }) =>
        eventos
          .filter((e) => where.symbol.in.includes(e.symbol))
          .map((e, i) => ({
            id: `e${i}`,
            ...e,
            date: new Date(`${e.date}T00:00:00.000Z`),
            source: 'BRAPI',
          })),
      ),
    },
    analiseFonteArquivo: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return { prisma, quotes, resumo };
}

function criarCtx(prisma: unknown, hoje: string) {
  const alertas: AlertaJob[] = [];
  const cont = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma: prisma as PrismaClient,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (c, n = 1) => {
      cont[c] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje,
    origem: 'cron',
    aplicar: true,
  };
  return { ctx, alertas, cont };
}

/** Arquivo diário simulado: linhas REAIS da WEGE3/HGLG11/PETR4 de 29/12/2016 com DATPRE trocado. */
function diario(aaaammdd: string): Buffer {
  const base = ['WEGE3', 'HGLG11', 'PETR4'].map((s) => comData(linhaDe(s, '20161229'), aaaammdd));
  const frac = comData(linhaDe('WEGE3F', '20161229'), aaaammdd);
  return zipCotahist([...base, frac]);
}

afterEach(() => vi.unstubAllGlobals());

describe('lacunas do cron (regras/comum/pregoes)', () => {
  it('20/11/2025 (Consciência Negra) não é lacuna', () => {
    expect(ultimosPregoes('2025-11-24', 5)).toEqual([
      '2025-11-17',
      '2025-11-18',
      '2025-11-19',
      '2025-11-21',
      '2025-11-24',
    ]);
  });

  it('Carnaval 2026 (16 e 17/02) não é lacuna; quarta de cinzas é', () => {
    expect(ultimosPregoes('2026-02-19', 5)).toEqual([
      '2026-02-11',
      '2026-02-12',
      '2026-02-13',
      '2026-02-18',
      '2026-02-19',
    ]);
  });

  it('sábado: últimos pregões terminam na sexta', () => {
    expect(ultimosPregoes('2026-10-03', 2)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('pregoesSemCotacao devolve só os pregões sem nenhuma linha', async () => {
    const { prisma } = criarPrisma();
    await prisma.assetQuoteDaily.createMany({
      data: [{ symbol: 'X', date: new Date('2025-11-19T00:00:00.000Z') } as unknown as Linha],
    });
    expect(await pregoesSemCotacao(prisma as unknown as PrismaClient, '2025-11-24', 5)).toEqual([
      '2025-11-17',
      '2025-11-18',
      '2025-11-21',
      '2025-11-24',
    ]);
  });
});

describe('sincronizarCotahist', () => {
  let rotas: Record<string, Buffer | number>;
  beforeEach(() => {
    rotas = {};
  });

  it('baixa só os pregões ausentes, grava 010/BDI 02-12 e o 404 do dia corrente é info (run ok)', async () => {
    const { prisma, quotes } = criarPrisma();
    for (const d of ['2026-09-23', '2026-09-24', '2026-09-25']) {
      await prisma.assetQuoteDaily.createMany({
        data: [
          {
            symbol: 'VALE3',
            date: new Date(`${d}T00:00:00.000Z`),
            closeRaw: { toNumber: () => 60 },
            volumeFin: { toNumber: () => 1e8 },
            codBdi: '02',
            especi: 'ON',
          },
        ],
      });
    }
    rotas[urlCotahistDiario('2026-09-28')] = diario('20260928');
    const { pedidas } = stubFetch(rotas);
    const { ctx, alertas, cont } = criarCtx(prisma, '2026-09-29');

    const r = await sincronizarCotahist(ctx);

    expect(pedidas).toEqual([urlCotahistDiario('2026-09-28'), urlCotahistDiario('2026-09-29')]);
    expect(r.parcial).toBe(false);
    expect([...quotes.keys()].filter((k) => k.endsWith('2026-09-28')).sort()).toEqual([
      'HGLG11|2026-09-28',
      'PETR4|2026-09-28',
      'WEGE3|2026-09-28',
    ]);
    expect(cont.linhasGravadas).toBe(3);
    expect(alertas).toEqual([
      expect.objectContaining({
        codigo: 'cotahist_nao_publicado',
        nivel: 'info',
        ref: '2026-09-29',
      }),
    ]);
    expect(prisma.analiseFonteArquivo.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.analiseFonteArquivo.update).toHaveBeenCalledTimes(1);
  });

  it('pregão já gravado não é rebaixado; 2ª execução é idempotente (nada baixado, nada gravado)', async () => {
    const { prisma } = criarPrisma();
    const hoje = '2026-09-29';
    for (const d of ultimosPregoes(hoje, 5)) {
      rotas[urlCotahistDiario(d)] = diario(d.replace(/-/g, ''));
    }
    stubFetch(rotas);
    const c1 = criarCtx(prisma, hoje);
    await sincronizarCotahist(c1.ctx);
    expect(c1.cont.linhasGravadas).toBe(15);

    const { pedidas } = stubFetch(rotas);
    const c2 = criarCtx(prisma, hoje);
    const r2 = await sincronizarCotahist(c2.ctx);
    expect(pedidas).toEqual([]);
    expect(c2.cont.linhasGravadas).toBe(0);
    expect((r2.detalhes as { lacunas: string[] }).lacunas).toEqual([]);
  });

  it('pregão útil sem arquivo após 2 pregões ⇒ aviso cotahist_ausente', async () => {
    const { prisma } = criarPrisma();
    stubFetch({});
    const { ctx, alertas } = criarCtx(prisma, '2026-09-29');
    await sincronizarCotahist(ctx);
    const porData = Object.fromEntries(alertas.map((a) => [a.ref, a]));
    expect(porData['2026-09-29']).toMatchObject({ nivel: 'info' });
    expect(porData['2026-09-28']).toMatchObject({ nivel: 'info' });
    expect(porData['2026-09-25']).toMatchObject({ codigo: 'cotahist_ausente', nivel: 'aviso' });
    expect(porData['2026-09-23']).toMatchObject({ codigo: 'cotahist_ausente', nivel: 'aviso' });
  });

  it('linha de outra data dentro do arquivo diário é rejeitada', async () => {
    const { prisma, quotes } = criarPrisma();
    const hoje = '2026-09-29';
    const intruso = comData(linhaDe('MGLU3', '20161229'), '20260925');
    rotas[urlCotahistDiario('2026-09-29')] = zipCotahist([
      comData(linhaDe('WEGE3', '20161229'), '20260929'),
      intruso,
    ]);
    stubFetch(rotas);
    const { ctx, cont } = criarCtx(prisma, hoje);
    await sincronizarCotahist(ctx);
    expect(quotes.has('WEGE3|2026-09-29')).toBe(true);
    expect(quotes.has('MGLU3|2026-09-25')).toBe(false);
    expect(cont.rejeitadas).toBe(1);
  });

  it('trailer inconsistente: grava as linhas lidas, NÃO marca processado e lança (reprocessa depois)', async () => {
    const { prisma, quotes } = criarPrisma();
    const linhas = ['WEGE3', 'HGLG11'].map((s) => comData(linhaDe(s, '20161229'), '20260929'));
    rotas[urlCotahistDiario('2026-09-29')] = zipCotahist(linhas, { totalTrailer: 99 });
    stubFetch(rotas);
    const { ctx } = criarCtx(prisma, '2026-09-29');
    await expect(sincronizarCotahist(ctx)).rejects.toMatchObject({ codigo: 'zip_corrompido' });
    expect(quotes.has('WEGE3|2026-09-29')).toBe(true);
    expect(quotes.has('HGLG11|2026-09-29')).toBe(true);
    expect(prisma.analiseFonteArquivo.update).not.toHaveBeenCalled();
  });

  it('layout diferente no diário ⇒ lança ErroLayoutFonte (executarJob marca falha)', async () => {
    const { prisma } = criarPrisma();
    rotas[urlCotahistDiario('2026-09-29')] = zipCotahist([], {
      header: 'OUTRO LAYOUT'.padEnd(245, ' '),
    });
    stubFetch(rotas);
    const { ctx } = criarCtx(prisma, '2026-09-29');
    await expect(sincronizarCotahist(ctx)).rejects.toMatchObject({ name: 'ErroLayoutFonte' });
  });
});

describe('recalcularResumoCotacoes', () => {
  async function carregar(prisma: ReturnType<typeof criarPrisma>['prisma'], linhas: string[]) {
    const { GravadorCotacoes } = await import('@/services/analiseAtivos/b3/gravarB3');
    const { parseLinhaCotahist } = await import('@/services/analiseAtivos/regras/b3/cotahist');
    const g = new GravadorCotacoes(prisma as unknown as PrismaClient, true);
    for (const l of linhas) await g.adicionar(parseLinhaCotahist(l)!);
    await g.descarregar();
  }

  it('HGLG11 ago/26: R$ 18,9 mi/dia, 21/21 pregões; NVHO11 14/21 ⇒ baixa liquidez', async () => {
    const { prisma, resumo } = criarPrisma();
    await carregar(prisma, dados(LINHAS_AGO_2026));
    const alertas: AlertaJob[] = [];
    const r = await recalcularResumoCotacoes(
      prisma as unknown as PrismaClient,
      SCORING_PARAMS_V1,
      (a) => alertas.push(a),
    );
    expect(r).toMatchObject({
      ultimoPregao: '2026-08-31',
      simbolos: 2,
      fiisNegociados30: 2,
      baixaLiquidez: 1,
    });
    const criados = resumo.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    const hglg = criados.find((c) => c.symbol === 'HGLG11')!;
    expect(Number(hglg.volumeMedio21) / 1e6).toBeCloseTo(18.9, 1);
    expect(hglg).toMatchObject({
      pregoesComNegocio21: 21,
      baixaLiquidez: false,
      negociadoUltimos30: true,
    });
    expect(criados.find((c) => c.symbol === 'NVHO11')).toMatchObject({
      pregoesComNegocio21: 14,
      baixaLiquidez: true,
    });
    // quem saiu da janela: liquidez zerada, sem apagar o último preço
    expect(resumo.updateMany.mock.calls[0][0]).toMatchObject({
      where: { symbol: { notIn: ['HGLG11', 'NVHO11'] } },
      data: { negociadoUltimos30: false, pregoesComNegocio21: 0, baixaLiquidez: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(alertas).toEqual([]);
  });

  it('MGLU3 grupamento 10:1 (27/05/2024) com evento bruto ⇒ sem salto; sem evento ⇒ saltoSuspeito + aviso', async () => {
    const mglu = dados(LINHAS_AMOSTRA).filter(
      (l) =>
        l.slice(12, 24).trim() === 'MGLU3' &&
        l.slice(2, 6) === '2024' &&
        l.slice(2, 10) <= '20240527',
    );
    const semEvento = criarPrisma();
    await carregar(semEvento.prisma, mglu);
    const alertas: AlertaJob[] = [];
    const r = await recalcularResumoCotacoes(
      semEvento.prisma as unknown as PrismaClient,
      SCORING_PARAMS_V1,
      (a) => alertas.push(a),
    );
    expect(r.saltos).toEqual([expect.objectContaining({ symbol: 'MGLU3', date: '2024-05-27' })]);
    expect(semEvento.resumo.createMany.mock.calls[0][0].data[0]).toMatchObject({
      symbol: 'MGLU3',
      saltoSuspeito: true,
    });
    expect(alertas[0]).toMatchObject({ codigo: 'salto_sem_evento', nivel: 'aviso', ref: 'MGLU3' });

    const comEvento = criarPrisma([
      { symbol: 'MGLU3', date: '2024-05-24', type: 'GRUPAMENTO', factor: 0.1 },
    ]);
    await carregar(comEvento.prisma, mglu);
    const r2 = await recalcularResumoCotacoes(
      comEvento.prisma as unknown as PrismaClient,
      SCORING_PARAMS_V1,
      () => {},
    );
    expect(r2.saltos).toEqual([]);
    expect(comEvento.resumo.createMany.mock.calls[0][0].data[0].saltoSuspeito).toBe(false);
  });

  it('banco vazio: nada a recalcular', async () => {
    const { prisma, resumo } = criarPrisma();
    const r = await recalcularResumoCotacoes(
      prisma as unknown as PrismaClient,
      SCORING_PARAMS_V1,
      () => {},
    );
    expect(r.simbolos).toBe(0);
    expect(resumo.createMany).not.toHaveBeenCalled();
  });
});
