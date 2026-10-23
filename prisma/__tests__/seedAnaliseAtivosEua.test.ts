import { describe, expect, it, vi } from 'vitest';
import { lerFixturesEua, montarFixturesEua, semearFixturesEua } from '../seedAnaliseAtivosEua';
import { CLASSES_EUA } from '@/types/analiseAtivosApi';
import { RE_TICKER_EUA } from '@/types/analiseAtivosEua';

const AGORA = new Date('2026-10-17T12:00:00Z');

describe('fixtures EUA (Stocks e REITs) do banco efêmero', () => {
  const arquivo = lerFixturesEua();

  it('amostra sem rede: stocks e REITs com a financeira JPM', () => {
    const porClasse = (c: string) => arquivo.empresas.filter((e) => e.classe === c).length;
    expect(porClasse('stock')).toBeGreaterThanOrEqual(8);
    expect(porClasse('reit')).toBeGreaterThanOrEqual(5);
    expect(arquivo.empresas.find((e) => e.ticker === 'JPM')?.ehFinanceira).toBe(true);
    for (const e of arquivo.empresas) expect(e.ticker).toMatch(RE_TICKER_EUA);
  });

  it('avalia pelo motor da v3 (n de 6) e monta a linha no contrato do Quadro EUA', async () => {
    const { avaliacoes, linhas } = await montarFixturesEua(arquivo, undefined, AGORA);
    expect(linhas).toHaveLength(arquivo.empresas.length);
    const aapl = avaliacoes.find((a) => a.symbol === 'AAPL')!;
    expect(aapl.cnpj).toBe('CIK:0000320193');
    expect(aapl.avaliacao.perfil).toBe('stock');
    expect(aapl.avaliacao.janelas['5'].aplicaveis).toBe(6);
    expect(aapl.avaliacao.janelas['5'].atendidos).toBe(2);
    const o = avaliacoes.find((a) => a.symbol === 'O')!;
    expect(o.avaliacao.perfil).toBe('reit');
    const ocup = o.avaliacao.janelas['5'].resultados.find((r) => r.id === 'ocup');
    expect(ocup?.estado).toBe('sem_dado');
    expect(avaliacoes.find((a) => a.symbol === 'JPM')?.avaliacao.perfil).toBe('stock_financeira');

    const linhaO = linhas.find((l) => l.symbol === 'O')!;
    expect(linhaO).toMatchObject({
      classe: 'reit',
      moeda: 'USD',
      bolsa: 'NYSE',
      segmento: 'Net lease',
      preco: null,
      noQuadro: true,
    });
    expect(linhaO.fcoPorAcao).toBeCloseTo(4.4, 1);
    expect(linhaO.dividendosFcoPct).toBeCloseTo(73, 0);
  });

  it('grava com as classes EUA nos dois gravadores (nunca apaga acao/fii)', async () => {
    const tx = {
      criteriaEval: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      },
      analiseQuadroLinha: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      },
    };
    const prisma = {
      secCompany: { upsert: vi.fn(async () => ({})) },
      secCompanyTicker: { upsert: vi.fn(async () => ({})) },
      assetFundamentalsPeriod: { upsert: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const n = await semearFixturesEua(prisma as never, arquivo, AGORA);
    expect(n).toBe(arquivo.empresas.length);
    const filtro = { where: { classe: { in: [...CLASSES_EUA] } } };
    expect(tx.criteriaEval.deleteMany).toHaveBeenCalledWith(filtro);
    expect(tx.analiseQuadroLinha.deleteMany).toHaveBeenCalledWith(filtro);
    expect(prisma.secCompany.upsert).toHaveBeenCalledTimes(arquivo.empresas.length);
  });
});
