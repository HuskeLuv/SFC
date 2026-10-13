import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { gerarQuadro, gravarLinhasQuadro, lucrosFyVigentes } from '../gerarQuadro';
import type { EntradaQuadro, LinhaQuadroGravar } from '../montarLinhasQuadro';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { avaliarAtivo } from '@/services/analiseAtivos/regras/criterios/avaliarAtivo';
import {
  compactarAvaliacao,
  lerCompactosPorSimbolo,
  linhasCriteriaEval,
} from '@/services/analiseAtivos/repositorio/criterios';

/**
 * Prisma fake: só analise_quadro_linhas em memória, com $transaction INTERATIVA (tudo ou nada: o
 * callback trabalha numa cópia, que só vira a tabela se ele terminar).
 */
function prismaFake(falharCreate = false) {
  const tabela = new Map<string, LinhaQuadroGravar>();
  const ops: string[] = [];
  const opcoes: unknown[] = [];
  const $transaction = vi.fn(
    async (fn: (tx: unknown) => Promise<number>, opts?: { timeout?: number }) => {
      opcoes.push(opts);
      const copia = new Map(tabela);
      const tx = {
        analiseQuadroLinha: {
          deleteMany: vi.fn(async () => {
            ops.push('delete');
            const count = copia.size;
            copia.clear();
            return { count };
          }),
          createMany: vi.fn(async ({ data }: { data: LinhaQuadroGravar[] }) => {
            ops.push('create');
            if (falharCreate) throw new Error('falha no meio da transação');
            for (const l of data) copia.set(l.symbol, l);
            return { count: data.length };
          }),
        },
      };
      const r = await fn(tx);
      tabela.clear();
      for (const [k, v] of copia) tabela.set(k, v);
      return r;
    },
  );
  return { prisma: { $transaction } as unknown as PrismaClient, tabela, ops, opcoes };
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

  it('gravarLinhasQuadro grava em lotes de 200 numa transação interativa com prazo longo', async () => {
    const { prisma, tabela, ops, opcoes } = prismaFake();
    const linhas = Array.from(
      { length: 450 },
      (_, i) => ({ symbol: `X${i}` }) as unknown as LinhaQuadroGravar,
    );
    expect(await gravarLinhasQuadro(prisma, linhas)).toBe(450);
    expect(ops).toEqual(['delete', 'create', 'create', 'create']);
    expect(tabela.size).toBe(450);
    expect(opcoes[0]).toMatchObject({ timeout: 120_000 });
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

describe('gerarQuadro — critérios de fundamentos (v2.4)', () => {
  it('grava a cópia compacta de criteria_eval nas linhas avaliadas e relata', async () => {
    const { prisma, tabela } = prismaFake();
    const { ctx, alertas } = ctxCom(prisma);
    const a = avaliarAtivo(
      {
        symbol: 'WEGE3',
        classe: 'acao',
        perfil: 'acao',
        anoFim: 2025,
        series: { receita: { 2020: 1, 2021: 2, 2022: 3, 2023: 4, 2024: 5, 2025: 6 } },
        meses: null,
      },
      CRITERIA_PARAMS_V1,
      1,
    );
    const compactos = compactarAvaliacao(a);
    const r = await gerarQuadro(ctx, {
      carregar: async () => ({
        ...entradaMinima(new Date('2026-10-13T10:40:00Z')),
        criterios: [
          { symbol: 'WEGE3', perfil: 'acao', criterios: compactos },
          { symbol: 'ITUB4', perfil: 'acao_financeira', criterios: compactos },
        ],
      }),
    });
    expect(tabela.get('WEGE3')).toMatchObject({ perfilCriterios: 'acao', criterios: compactos });
    expect(tabela.get('ITUB4')?.perfilCriterios).toBe('acao_financeira');
    expect(r.detalhes).toMatchObject({ comCriterios: 2 });
    expect(alertas.map((x) => x.codigo)).not.toContain('quadro_sem_criterios');
    expect(compactos['5']?.m.map((m) => m[0])).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
  });

  it('lerCompactosPorSimbolo monta o compacto por símbolo a partir do SQL, em páginas', async () => {
    const a = avaliarAtivo(
      { symbol: 'WEGE3', classe: 'acao', perfil: 'acao', anoFim: 2025, series: {}, meses: null },
      CRITERIA_PARAMS_V1,
      4,
    );
    // o que o Postgres devolve: (symbol, janela) em ordem, com m = [[id, estado, fato]…]
    const linhasSql = linhasCriteriaEval({ symbol: 'WEGE3', cnpj: 'C', avaliacao: a }, new Date())
      .map((l) => ({
        symbol: l.symbol,
        perfil: l.perfil,
        janela: l.janela,
        atendidos: l.atendidos,
        aplicaveis: l.aplicaveis,
        paramsVersion: l.paramsVersion,
        m: (l.resultados as Array<{ id: string; estado: string; fato: string }>).map((r) => [
          r.id,
          r.estado,
          r.fato,
        ]),
      }))
      .sort((x, y) => x.janela - y.janela);
    let chamada = 0;
    const $queryRaw = vi.fn(async () => {
      const pagina = linhasSql.slice(chamada * 2, chamada * 2 + 2);
      chamada++;
      return pagina;
    });
    const m = await lerCompactosPorSimbolo({ $queryRaw } as unknown as PrismaClient, {
      pagina: 2,
    });
    expect($queryRaw).toHaveBeenCalledTimes(2);
    expect(m.get('WEGE3')).toMatchObject({ perfil: 'acao', paramsVersion: 4 });
    expect(Object.keys(m.get('WEGE3')!.criterios).sort()).toEqual(['10', '3', '5']);
    expect(m.get('WEGE3')!.criterios).toEqual(compactarAvaliacao(a));
  });
});
