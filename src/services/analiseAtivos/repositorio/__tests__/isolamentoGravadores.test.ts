/**
 * Fatia 0 da feature Stocks e REITs: os gravadores deletam POR CLASSE (bug latente do desenho:
 * gerarQuadro e repositorio/criterios faziam deleteMany({}) e o job BR apagaria as linhas EUA todo
 * dia). Testado nos DOIS sentidos, nas duas tabelas, com um Postgres fake em memória que respeita
 * os filtros where (classe IN / NOT IN, symbol IN) e a transação tudo-ou-nada.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { gravarLinhasQuadro } from '@/services/analiseAtivos/quadro/gerarQuadro';
import type { LinhaQuadroGravar } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  ErroClasseGravador,
  exigirClassesDoGravador,
  gravarCriteriaEval,
  type LinhaCriteriaEval,
} from '@/services/analiseAtivos/repositorio/criterios';
import { CLASSES_BR, CLASSES_EUA } from '@/types/analiseAtivosApi';

interface LinhaFake {
  symbol: string;
  classe: string;
  janela?: number;
}

interface Where {
  symbol?: { in: string[] };
  classe?: { in?: string[]; notIn?: string[] };
}

function casa(l: LinhaFake, where: Where | undefined): boolean {
  if (!where) return true;
  if (where.symbol && !where.symbol.in.includes(l.symbol)) return false;
  if (where.classe?.in && !where.classe.in.includes(l.classe)) return false;
  if (where.classe?.notIn && where.classe.notIn.includes(l.classe)) return false;
  return true;
}

/** Tabela fake com a chave da tabela real (quadro: symbol; criteria_eval: symbol × janela). */
function tabelaFake(chave: (l: LinhaFake) => string) {
  return {
    findMany: (linhas: Map<string, LinhaFake>) =>
      vi.fn(async ({ where }: { where?: Where }) =>
        [...linhas.values()]
          .filter((l) => casa(l, where))
          .map((l) => ({ symbol: l.symbol, classe: l.classe })),
      ),
    deleteMany: (linhas: Map<string, LinhaFake>) =>
      vi.fn(async (args?: { where?: Where }) => {
        let count = 0;
        for (const [k, l] of linhas) {
          if (casa(l, args?.where)) {
            linhas.delete(k);
            count++;
          }
        }
        return { count };
      }),
    createMany: (linhas: Map<string, LinhaFake>) =>
      vi.fn(async ({ data }: { data: LinhaFake[] }) => {
        for (const l of data) {
          if (linhas.has(chave(l))) throw new Error(`unique violada: ${chave(l)}`);
          linhas.set(chave(l), l);
        }
        return { count: data.length };
      }),
  };
}

function bancoFake() {
  const quadro = new Map<string, LinhaFake>();
  const avaliacoes = new Map<string, LinhaFake>();
  const tq = tabelaFake((l) => l.symbol);
  const te = tabelaFake((l) => `${l.symbol}|${l.janela}`);
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<number>) => {
    const cq = new Map(quadro);
    const ce = new Map(avaliacoes);
    const tx = {
      analiseQuadroLinha: {
        findMany: tq.findMany(cq),
        deleteMany: tq.deleteMany(cq),
        createMany: tq.createMany(cq),
      },
      criteriaEval: {
        findMany: te.findMany(ce),
        deleteMany: te.deleteMany(ce),
        createMany: te.createMany(ce),
      },
    };
    const r = await fn(tx);
    quadro.clear();
    for (const [k, v] of cq) quadro.set(k, v);
    avaliacoes.clear();
    for (const [k, v] of ce) avaliacoes.set(k, v);
    return r;
  });
  return { prisma: { $transaction } as unknown as PrismaClient, quadro, avaliacoes };
}

const linhaQuadro = (symbol: string, classe: string) =>
  ({ symbol, classe }) as unknown as LinhaQuadroGravar;
const linhasEval = (symbol: string, classe: string): LinhaCriteriaEval[] =>
  [3, 5, 10].map((janela) => ({ symbol, classe, janela }) as unknown as LinhaCriteriaEval);

const classesDe = (m: Map<string, LinhaFake>) =>
  [...new Set([...m.values()].map((l) => l.classe))].sort();
const symbolsDe = (m: Map<string, LinhaFake>, classe: string) =>
  [...m.values()].filter((l) => l.classe === classe).map((l) => l.symbol);

describe('gravarLinhasQuadro — isolamento por classe', () => {
  it('job BR (CLASSES_BR) regrava acao/fii e mantém as linhas stock/reit', async () => {
    const { prisma, quadro } = bancoFake();
    await gravarLinhasQuadro(
      prisma,
      [linhaQuadro('AAPL', 'stock'), linhaQuadro('O', 'reit')],
      CLASSES_EUA,
    );
    await gravarLinhasQuadro(
      prisma,
      [linhaQuadro('PETR4', 'acao'), linhaQuadro('MXRF11', 'fii')],
      CLASSES_BR,
    );
    // 2ª rodada do BR com outro conjunto: troca só acao/fii
    await gravarLinhasQuadro(prisma, [linhaQuadro('WEGE3', 'acao')], CLASSES_BR);
    expect(classesDe(quadro)).toEqual(['acao', 'reit', 'stock']);
    expect(symbolsDe(quadro, 'acao')).toEqual(['WEGE3']);
    expect(symbolsDe(quadro, 'fii')).toEqual([]);
    expect(symbolsDe(quadro, 'stock')).toEqual(['AAPL']);
    expect(symbolsDe(quadro, 'reit')).toEqual(['O']);
  });

  it('job EUA (CLASSES_EUA) regrava stock/reit e mantém acao/fii intactos', async () => {
    const { prisma, quadro } = bancoFake();
    await gravarLinhasQuadro(
      prisma,
      [linhaQuadro('PETR4', 'acao'), linhaQuadro('MXRF11', 'fii')],
      CLASSES_BR,
    );
    await gravarLinhasQuadro(prisma, [linhaQuadro('AAPL', 'stock')], CLASSES_EUA);
    await gravarLinhasQuadro(
      prisma,
      [linhaQuadro('MSFT', 'stock'), linhaQuadro('PLD', 'reit')],
      CLASSES_EUA,
    );
    expect(symbolsDe(quadro, 'acao')).toEqual(['PETR4']);
    expect(symbolsDe(quadro, 'fii')).toEqual(['MXRF11']);
    expect(symbolsDe(quadro, 'stock')).toEqual(['MSFT']);
    expect(symbolsDe(quadro, 'reit')).toEqual(['PLD']);
  });

  it('colisão: symbol já gravado com classe de outro job → erro, nada muda', async () => {
    const { prisma, quadro } = bancoFake();
    await gravarLinhasQuadro(prisma, [linhaQuadro('XPTO', 'acao')], CLASSES_BR);
    await expect(
      gravarLinhasQuadro(prisma, [linhaQuadro('XPTO', 'stock')], CLASSES_EUA),
    ).rejects.toThrow(/symbol já gravado com outra classe — XPTO \(acao\)/);
    expect([...quadro.values()]).toEqual([{ symbol: 'XPTO', classe: 'acao' }]);
  });

  it('linha com classe fora das do job → erro antes de abrir a transação', async () => {
    const { prisma, quadro } = bancoFake();
    await expect(
      gravarLinhasQuadro(prisma, [linhaQuadro('AAPL', 'stock')], CLASSES_BR),
    ).rejects.toBeInstanceOf(ErroClasseGravador);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(quadro.size).toBe(0);
  });
});

describe('gravarCriteriaEval — isolamento por classe', () => {
  it('job BR (CLASSES_BR) não apaga as avaliações stock/reit', async () => {
    const { prisma, avaliacoes } = bancoFake();
    await gravarCriteriaEval(
      prisma,
      [...linhasEval('AAPL', 'stock'), ...linhasEval('O', 'reit')],
      CLASSES_EUA,
    );
    expect(await gravarCriteriaEval(prisma, linhasEval('PETR4', 'acao'), CLASSES_BR)).toBe(3);
    await gravarCriteriaEval(prisma, linhasEval('WEGE3', 'acao'), CLASSES_BR);
    expect(symbolsDe(avaliacoes, 'acao')).toEqual(['WEGE3', 'WEGE3', 'WEGE3']);
    expect(symbolsDe(avaliacoes, 'stock')).toHaveLength(3);
    expect(symbolsDe(avaliacoes, 'reit')).toHaveLength(3);
  });

  it('job EUA (CLASSES_EUA) não apaga acao/fii', async () => {
    const { prisma, avaliacoes } = bancoFake();
    await gravarCriteriaEval(
      prisma,
      [...linhasEval('PETR4', 'acao'), ...linhasEval('MXRF11', 'fii')],
      CLASSES_BR,
    );
    await gravarCriteriaEval(prisma, linhasEval('AAPL', 'stock'), CLASSES_EUA);
    await gravarCriteriaEval(prisma, linhasEval('MSFT', 'stock'), CLASSES_EUA);
    expect(classesDe(avaliacoes)).toEqual(['acao', 'fii', 'stock']);
    expect(new Set(symbolsDe(avaliacoes, 'stock'))).toEqual(new Set(['MSFT']));
    expect(symbolsDe(avaliacoes, 'acao')).toHaveLength(3);
    expect(symbolsDe(avaliacoes, 'fii')).toHaveLength(3);
  });

  it('colisão entre classes → erro e a tabela fica como estava', async () => {
    const { prisma, avaliacoes } = bancoFake();
    await gravarCriteriaEval(prisma, linhasEval('XPTO', 'stock'), CLASSES_EUA);
    await expect(
      gravarCriteriaEval(prisma, linhasEval('XPTO', 'acao'), CLASSES_BR),
    ).rejects.toThrow(/criteria_eval: symbol já gravado com outra classe — XPTO \(stock\)/);
    expect(classesDe(avaliacoes)).toEqual(['stock']);
  });

  it('lote vazio só apaga as classes do job', async () => {
    const { prisma, avaliacoes } = bancoFake();
    await gravarCriteriaEval(prisma, linhasEval('AAPL', 'stock'), CLASSES_EUA);
    await gravarCriteriaEval(prisma, linhasEval('PETR4', 'acao'), CLASSES_BR);
    expect(await gravarCriteriaEval(prisma, [], CLASSES_BR)).toBe(0);
    expect(classesDe(avaliacoes)).toEqual(['stock']);
  });
});

describe('exigirClassesDoGravador', () => {
  it('recusa lista vazia, classe desconhecida e linha fora das classes', () => {
    expect(() => exigirClassesDoGravador('t', [], [])).toThrow(/classes do job inválidas/);
    expect(() => exigirClassesDoGravador('t', ['etf' as never], [])).toThrow(/inválidas/);
    expect(() =>
      exigirClassesDoGravador('t', CLASSES_BR, [{ symbol: 'O', classe: 'reit' }]),
    ).toThrow(/O tem classe 'reit' fora das classes do job \(acao, fii\)/);
    expect(exigirClassesDoGravador('t', ['acao', 'acao', 'fii'], [])).toEqual(['acao', 'fii']);
  });
});
