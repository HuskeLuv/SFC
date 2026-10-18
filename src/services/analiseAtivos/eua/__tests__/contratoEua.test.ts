/**
 * Fatia 0 da feature Stocks e REITs: helpers do contrato (src/types/analiseAtivosEua.ts e
 * ClasseQuadro) e as leituras do cadastro SEC (repositorio/eua.ts) com um Prisma fake.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CLASSES_BR,
  CLASSES_EUA,
  CLASSES_QUADRO,
  ehClasseBr,
  ehClasseEua,
  ehClasseQuadro,
} from '@/types/analiseAtivosApi';
import {
  cikDoEmissorId,
  ehSicFinanceira,
  ehTickerEua,
  emissorIdSec,
  familiaDados,
  mercadoDaClasse,
  moedaDaClasse,
  normalizarCik,
  normalizarTickerEua,
  symbolAnaliseDaSec,
  symbolSecDaAnalise,
  UNIVERSO_EUA_PADRAO,
} from '@/types/analiseAtivosEua';
import { PERFIS_CRITERIO, ehPerfilEua, IDS_CRITERIO } from '@/types/analiseAtivosCriterios';
import { camadaDaFonte, unidadeNoMercado } from '@/types/analiseAtivosFontes';
import { cikPorSymbolNorm, lerCadastroEua, listarUniversoEua } from '../../repositorio/eua';

describe('classes do Quadro', () => {
  it('BR + EUA, com os guards', () => {
    expect(CLASSES_QUADRO).toEqual(['acao', 'fii', 'stock', 'reit']);
    expect(CLASSES_BR).toEqual(['acao', 'fii']);
    expect(CLASSES_EUA).toEqual(['stock', 'reit']);
    expect(['stock', 'reit'].every(ehClasseEua)).toBe(true);
    expect(['acao', 'fii'].some(ehClasseEua)).toBe(false);
    expect(ehClasseBr('fii')).toBe(true);
    expect(ehClasseQuadro('etf')).toBe(false);
  });

  it('mercado, moeda e família de dados', () => {
    expect(CLASSES_QUADRO.map(mercadoDaClasse)).toEqual([
      'br_acoes',
      'br_fii',
      'us_stocks',
      'us_reits',
    ]);
    expect(CLASSES_QUADRO.map(moedaDaClasse)).toEqual(['BRL', 'BRL', 'USD', 'USD']);
    expect(CLASSES_QUADRO.map(familiaDados)).toEqual(['cvm_acao', 'cvm_fii', 'sec', 'sec']);
  });

  it('perfis e ids novos (ffo_acao reservado)', () => {
    expect(PERFIS_CRITERIO).toEqual([
      'acao',
      'acao_financeira',
      'fii_tijolo',
      'fii_papel',
      'stock',
      'stock_financeira',
      'reit',
    ]);
    expect(ehPerfilEua('stock_financeira')).toBe(true);
    expect(ehPerfilEua('acao')).toBe(false);
    for (const id of ['dpa', 'fco_acao', 'pay', 'ocup', 'ffo_acao'])
      expect(IDS_CRITERIO).toContain(id);
  });
});

describe('CIK, emissorId e ticker', () => {
  it('CIK com 10 dígitos e emissorId SEC', () => {
    expect(normalizarCik(320193)).toBe('0000320193');
    expect(normalizarCik('CIK0000906107')).toBe('0000906107');
    expect(emissorIdSec('906107')).toBe('CIK:0000906107');
    expect(cikDoEmissorId('CIK:0000906107')).toBe('0000906107');
    expect(cikDoEmissorId('33.000.167/0001-01')).toBeNull();
    expect(() => normalizarCik('AAPL')).toThrow(/CIK inválido/);
  });

  it('ticker: forma da Análise (BRK.B) × SEC (BRK-B) × normalizado (BRKB)', () => {
    expect(symbolAnaliseDaSec('BRK-B')).toBe('BRK.B');
    expect(symbolSecDaAnalise('brk.b')).toBe('BRK-B');
    expect(['BRK-B', 'BRK.B', 'brkb', ' BRKB '].map(normalizarTickerEua)).toEqual([
      'BRKB',
      'BRKB',
      'BRKB',
      'BRKB',
    ]);
    expect(['AAPL', 'BRK.B', 'BRK-B', 'O'].every(ehTickerEua)).toBe(true);
    // ticker da B3 sempre tem dígito: nunca colide com o EUA
    expect(['PETR4', 'AAPL34', 'MXRF11', 'GOOGLE'].some(ehTickerEua)).toBe(false);
  });

  it('SIC financeira = 6000–6799 exceto 6798 (REIT)', () => {
    expect(ehSicFinanceira(6021)).toBe(true);
    expect(ehSicFinanceira(6798)).toBe(false);
    expect(ehSicFinanceira(3571)).toBe(false);
    expect(ehSicFinanceira(null)).toBe(false);
  });

  it('universo padrão (decisão de 17/10): ≥ US$ 2 bi com saída < US$ 1,6 bi', () => {
    expect(UNIVERSO_EUA_PADRAO.stock).toEqual({ floatEntradaUsd: 2e9, floatSaidaUsd: 1.6e9 });
    expect(UNIVERSO_EUA_PADRAO.reit.floatEntradaUsd).toBe(2e9);
  });

  it('fontes: SEC é regulatória (camada cvm) e as unidades viram USD nos mercados us_*', () => {
    expect(camadaDaFonte('sec')).toBe('cvm');
    expect(camadaDaFonte('provedor_x')).toBe('provedor');
    expect(unidadeNoMercado('revenue', 'us_stocks')).toBe('USD');
    expect(unidadeNoMercado('revenue', 'br_acoes')).toBe('BRL');
    expect(unidadeNoMercado('dividend_per_share', 'us_reits')).toBe('USD_por_acao');
    expect(unidadeNoMercado('net_margin', 'us_stocks')).toBe('pct');
  });
});

describe('repositorio/eua — leituras do cadastro SEC', () => {
  const dec = (n: number) => ({ toNumber: () => n });
  const empresas = [
    {
      cik: '0001067983',
      nome: 'Berkshire Hathaway Inc.',
      classe: 'stock',
      sic: 6331,
      ehFinanceira: true,
      bolsa: 'NYSE',
      segmento: null,
      exercicioFimMmdd: '1231',
      publicFloatUsd: dec(6e11),
      publicFloatData: new Date('2025-06-30T00:00:00Z'),
      cikHistorico: null,
      noUniverso: true,
    },
    {
      cik: '0000726728',
      nome: 'Realty Income Corp',
      classe: 'reit',
      sic: 6798,
      ehFinanceira: false,
      bolsa: 'NYSE',
      segmento: 'net_lease',
      exercicioFimMmdd: '1231',
      publicFloatUsd: dec(5e10),
      publicFloatData: null,
      cikHistorico: null,
      noUniverso: true,
    },
  ];
  const tickers = [
    { cik: '0001067983', symbol: 'BRK-A', symbolNorm: 'BRKA', principal: false },
    { cik: '0001067983', symbol: 'BRK-B', symbolNorm: 'BRKB', principal: true },
    { cik: '0000726728', symbol: 'O', symbolNorm: 'O', principal: true },
  ];
  function prismaFake() {
    return {
      secCompany: {
        findMany: vi.fn(
          async ({ where }: { where: { cik?: { in: string[] }; classe?: { in: string[] } } }) =>
            empresas.filter(
              (e) =>
                (!where.cik || where.cik.in.includes(e.cik)) &&
                (!where.classe || where.classe.in.includes(e.classe)),
            ),
        ),
      },
      secCompanyTicker: {
        findMany: vi.fn(
          async ({ where }: { where: { cik?: { in: string[] }; symbol?: { in: string[] } } }) =>
            tickers.filter(
              (t) =>
                (!where.cik || where.cik.in.includes(t.cik)) &&
                (!where.symbol || where.symbol.in.includes(t.symbol)),
            ),
        ),
        findFirst: vi.fn(
          async ({ where }: { where: { symbolNorm: string } }) =>
            tickers.find((t) => t.symbolNorm === where.symbolNorm) ?? null,
        ),
      },
    } as unknown as PrismaClient;
  }

  it('listarUniversoEua: um item por ticker vigente, na forma da Análise', async () => {
    const prisma = prismaFake();
    const stocks = await listarUniversoEua(prisma, ['stock']);
    expect(stocks.map((e) => e.symbol)).toEqual(['BRK.A', 'BRK.B']);
    expect(stocks[1]).toMatchObject({
      symbolSec: 'BRK-B',
      symbolNorm: 'BRKB',
      principal: true,
      classe: 'stock',
      ehFinanceira: true,
      bolsa: 'NYSE',
      publicFloatUsd: 6e11,
      publicFloatData: '2025-06-30',
      cikFundamentos: '0001067983',
    });
    expect((await listarUniversoEua(prisma, ['reit']))[0]).toMatchObject({
      symbol: 'O',
      segmento: 'net_lease',
    });
    expect(await listarUniversoEua(prisma, [])).toEqual([]);
  });

  it('lerCadastroEua aceita BRK.B e BRK-B; cikPorSymbolNorm casa sem pontuação', async () => {
    const prisma = prismaFake();
    const m = await lerCadastroEua(prisma, ['BRK.B', 'O', 'XXXX']);
    expect([...m.keys()].sort()).toEqual(['BRK.B', 'O']);
    expect(await cikPorSymbolNorm(prisma, 'brk.b')).toBe('0001067983');
    expect(await cikPorSymbolNorm(prisma, 'ZZZ')).toBeNull();
  });
});

describe('linhasQuadro — campos EUA na resposta do Quadro', () => {
  it('só nas linhas com moeda USD; a linha BR fica sem as chaves novas', async () => {
    const { camposEuaDaLinha } = await import('@/services/analiseAtivos/leitura/linhasQuadro');
    const nulos = { moeda: null, bolsa: null, dpa: null, fcoPorAcao: null, dividendosFcoPct: null };
    expect(camposEuaDaLinha(nulos)).toEqual({});
    expect(
      camposEuaDaLinha({
        ...nulos,
        moeda: 'USD',
        bolsa: 'NYSE',
        dpa: 3.17,
        fcoPorAcao: 4.4,
        dividendosFcoPct: 73,
      }),
    ).toEqual({ moeda: 'USD', bolsa: 'NYSE', dpa: 3.17, fcoPorAcao: 4.4, dividendosFcoPct: 73 });
    expect(camposEuaDaLinha({ ...nulos, moeda: 'USD', bolsa: 'LSE' }).bolsa).toBeNull();
  });
});
