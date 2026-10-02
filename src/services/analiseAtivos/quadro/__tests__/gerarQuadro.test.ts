import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { gerarQuadro, gravarLinhasQuadro, lucrosFyVigentes } from '../gerarQuadro';
import type { EntradaQuadro, LinhaQuadroGravar } from '../montarLinhasQuadro';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';

/** Prisma fake: só analise_quadro_linhas em memória, com $transaction em lote (tudo ou nada). */
function prismaFake(falharCreate = false) {
  const tabela = new Map<string, LinhaQuadroGravar>();
  const ops: string[] = [];
  const analiseQuadroLinha = {
    deleteMany: vi.fn(() => ({ tipo: 'delete' as const })),
    createMany: vi.fn(({ data }: { data: LinhaQuadroGravar[] }) => ({
      tipo: 'create' as const,
      data,
    })),
  };
  const $transaction = vi.fn(
    async (lote: Array<{ tipo: 'delete' } | { tipo: 'create'; data: LinhaQuadroGravar[] }>) => {
      const copia = new Map(tabela);
      const resultados: Array<{ count: number }> = [];
      for (const op of lote) {
        ops.push(op.tipo);
        if (op.tipo === 'delete') {
          resultados.push({ count: copia.size });
          copia.clear();
        } else {
          if (falharCreate) throw new Error('falha no meio da transação');
          for (const l of op.data) copia.set(l.symbol, l);
          resultados.push({ count: op.data.length });
        }
      }
      tabela.clear();
      for (const [k, v] of copia) tabela.set(k, v);
      return resultados;
    },
  );
  return { prisma: { analiseQuadroLinha, $transaction } as unknown as PrismaClient, tabela, ops };
}

function ctxCom(prisma: PrismaClient, aplicar = true) {
  const alertas: AlertaJob[] = [];
  const contagem = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (campo, n = 1) => {
      contagem[campo] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-02',
    origem: 'script',
    aplicar,
  };
  return { ctx, alertas, contagem };
}

const DATA_REF = new Date('2026-09-29T00:00:00.000Z');

function entradaMinima(geradoEm: Date, simbolos = ['WEGE3', 'ITUB4']): EntradaQuadro {
  return {
    hoje: '2026-10-02',
    dataRef: DATA_REF,
    geradoEm,
    acoes: simbolos.map((s) => ({
      symbol: s,
      cnpj: `C-${s}`,
      classeTitulo: 'ON' as const,
      unitQtdOn: null,
      unitQtdPn: null,
    })),
    fiis: [],
    scores: [],
    multiplos: [],
    resumos: simbolos.map((s) => ({
      symbol: s,
      ultimoPregao: DATA_REF,
      closeRaw: 10,
      volumeMedio21: 1,
      baixaLiquidez: false,
      negociadoUltimos30: true,
    })),
    setores: [],
    nomesCia: [],
    nomesFii: [],
    assets: [],
    fiiMensal: [],
    fiiTrimestral: [],
    ultimosPregoes: [],
    porAcaoAno: [],
    lucrosFy: [],
    mesesInformeFii: [],
    contagens: [],
  };
}

describe('gerarQuadro', () => {
  it('grava todas as linhas numa transação (deleteMany + createMany) e relata', async () => {
    const { prisma, tabela, ops } = prismaFake();
    const { ctx, contagem } = ctxCom(prisma);
    const carregar = vi.fn(async () => entradaMinima(new Date('2026-09-30T10:40:00Z')));
    const r = await gerarQuadro(ctx, { carregar });
    expect(carregar).toHaveBeenCalledWith(prisma, '2026-10-02');
    expect(ops).toEqual(['delete', 'create']);
    expect(tabela.size).toBe(2);
    expect(contagem).toMatchObject({ linhasLidas: 2, linhasGravadas: 2 });
    expect(r.detalhes).toMatchObject({
      dataRef: '2026-09-29',
      linhasGravadas: 2,
      noQuadroPorClasse: { acao: 2, fii: 0 },
    });
  });

  it('idempotente: rodar de novo troca a versão inteira sem duplicar nem deixar sobra', async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx } = ctxCom(prisma);
    const v1 = new Date('2026-09-30T10:40:00Z');
    const v2 = new Date('2026-10-01T10:40:00Z');
    await gerarQuadro(ctx, { carregar: async () => entradaMinima(v1, ['WEGE3', 'ITUB4', 'OLD3']) });
    await gerarQuadro(ctx, { carregar: async () => entradaMinima(v2) });
    await gerarQuadro(ctx, { carregar: async () => entradaMinima(v2) });
    expect([...tabela.keys()].sort()).toEqual(['ITUB4', 'WEGE3']);
    expect([...tabela.values()].every((l) => l.geradoEm === v2)).toBe(true);
  });

  it('falha no meio da transação mantém a versão anterior inteira', async () => {
    const ok = prismaFake();
    await gerarQuadro(ctxCom(ok.prisma).ctx, {
      carregar: async () => entradaMinima(new Date('2026-09-30T10:40:00Z')),
    });
    const quebrado = prismaFake(true);
    for (const [k, v] of ok.tabela) quebrado.tabela.set(k, v);
    await expect(
      gerarQuadro(ctxCom(quebrado.prisma).ctx, {
        carregar: async () => entradaMinima(new Date('2026-10-01T10:40:00Z'), ['NOVO3']),
      }),
    ).rejects.toThrow(/falha no meio/);
    expect([...quebrado.tabela.keys()].sort()).toEqual(['ITUB4', 'WEGE3']);
  });

  it('dry-run (aplicar=false) não grava', async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx } = ctxCom(prisma, false);
    const r = await gerarQuadro(ctx, {
      carregar: async () => entradaMinima(new Date('2026-09-30T10:40:00Z')),
    });
    expect(tabela.size).toBe(0);
    expect(r.detalhes).toMatchObject({ linhas: 2, linhasGravadas: 0 });
  });

  it('cadastro vazio não apaga a versão atual e alerta', async () => {
    const { prisma, ops } = prismaFake();
    const { ctx, alertas } = ctxCom(prisma);
    await gerarQuadro(ctx, {
      carregar: async () => ({ ...entradaMinima(new Date(), []), acoes: [] }),
    });
    expect(ops).toEqual([]);
    expect(alertas.map((a) => a.codigo)).toContain('quadro_vazio');
  });

  it('gravarLinhasQuadro devolve o count do createMany', async () => {
    const { prisma } = prismaFake();
    const n = await gravarLinhasQuadro(prisma, [{ symbol: 'X3' } as unknown as LinhaQuadroGravar]);
    expect(n).toBe(1);
  });
});

describe('lucrosFyVigentes', () => {
  const dec = (n: number | null) => (n === null ? null : { toNumber: () => n });
  it('maior versão, escopo preferido, um FY por ano e individual com controladora_zero', async () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const findMany = vi.fn(async () => [
      // versão 2 vence a 1
      {
        emissorId: 'A',
        dtFim: d('2024-12-31'),
        escopo: 'con',
        versao: 1,
        anoFiscal: 2024,
        lucroAtribuivel: dec(10),
        flags: [],
      },
      {
        emissorId: 'A',
        dtFim: d('2024-12-31'),
        escopo: 'con',
        versao: 2,
        anoFiscal: 2024,
        lucroAtribuivel: dec(12),
        flags: [],
      },
      {
        emissorId: 'A',
        dtFim: d('2024-12-31'),
        escopo: 'ind',
        versao: 1,
        anoFiscal: 2024,
        lucroAtribuivel: dec(99),
        flags: [],
      },
      // controladora_zero ⇒ individual
      {
        emissorId: 'A',
        dtFim: d('2025-12-31'),
        escopo: 'con',
        versao: 1,
        anoFiscal: 2025,
        lucroAtribuivel: null,
        flags: ['controladora_zero'],
      },
      {
        emissorId: 'A',
        dtFim: d('2025-12-31'),
        escopo: 'ind',
        versao: 1,
        anoFiscal: 2025,
        lucroAtribuivel: dec(7),
        flags: [],
      },
      // banco: escopo preferido 'ind'
      {
        emissorId: 'B',
        dtFim: d('2025-12-31'),
        escopo: 'con',
        versao: 1,
        anoFiscal: 2025,
        lucroAtribuivel: dec(1),
        flags: [],
      },
      {
        emissorId: 'B',
        dtFim: d('2025-12-31'),
        escopo: 'ind',
        versao: 1,
        anoFiscal: 2025,
        lucroAtribuivel: dec(2),
        flags: [],
      },
      // mudou o fim do exercício: dois FY em 2023, vale o de dtFim mais recente
      {
        emissorId: 'B',
        dtFim: d('2023-09-30'),
        escopo: 'ind',
        versao: 1,
        anoFiscal: 2023,
        lucroAtribuivel: dec(3),
        flags: [],
      },
      {
        emissorId: 'B',
        dtFim: d('2023-12-31'),
        escopo: 'ind',
        versao: 1,
        anoFiscal: 2023,
        lucroAtribuivel: dec(4),
        flags: [],
      },
    ]);
    const prisma = { assetFundamentalsPeriod: { findMany } } as unknown as PrismaClient;
    const r = await lucrosFyVigentes(
      prisma,
      ['A', 'B'],
      [
        { cnpj: 'A', escopoPreferido: 'con' },
        { cnpj: 'B', escopoPreferido: 'ind' },
      ],
    );
    const mapa = Object.fromEntries(r.map((x) => [`${x.cnpj}${x.anoFiscal}`, x.lucro]));
    expect(mapa).toEqual({ A2024: 12, A2025: 7, B2025: 2, B2023: 4 });
  });
});
