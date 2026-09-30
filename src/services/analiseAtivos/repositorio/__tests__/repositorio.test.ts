import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { cotacaoFimDePeriodo } from '@/services/analiseAtivos/repositorio/cotacoes';
import { condicionalDownload } from '@/services/analiseAtivos/repositorio/fontesArquivo';
import { proventosBrutos } from '@/services/analiseAtivos/repositorio/proventos';
import { listarEmissores, universoAnalise } from '@/services/analiseAtivos/repositorio/universo';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dec = (s: string) => new Prisma.Decimal(s);

const WEGE = '84429695000111';
const BBAS = '00000000000191';
const ITSA = '61532644000115';
const SIMH = '07415333000120';
const BANCO_SEM_SETOR = '11111111000111';

function prismaCadastro() {
  return {
    cvmCompany: {
      findMany: vi.fn().mockResolvedValue([
        { cnpj: WEGE, nome: 'WEG S.A.', mesFimExercicio: 12, layoutFinanceiro: false },
        { cnpj: BBAS, nome: 'BANCO DO BRASIL', mesFimExercicio: 12, layoutFinanceiro: true },
        { cnpj: ITSA, nome: 'ITAUSA', mesFimExercicio: 12, layoutFinanceiro: false },
        { cnpj: SIMH, nome: 'SIMPAR', mesFimExercicio: 12, layoutFinanceiro: false },
        { cnpj: BANCO_SEM_SETOR, nome: 'BANCO X', mesFimExercicio: 12, layoutFinanceiro: true },
      ]),
    },
    cvmCompanyTicker: {
      findMany: vi.fn().mockResolvedValue([
        { symbol: 'WEGE3', cnpj: WEGE },
        { symbol: 'BBAS3', cnpj: BBAS },
        { symbol: 'ITSA3', cnpj: ITSA },
        { symbol: 'ITSA4', cnpj: ITSA },
        { symbol: 'SIMH3', cnpj: SIMH },
        { symbol: 'BXXX3', cnpj: BANCO_SEM_SETOR },
      ]),
    },
    assetSetorB3: {
      findMany: vi.fn().mockResolvedValue([
        {
          raiz: 'WEGE',
          setor: 'Bens Industriais',
          subsetor: 'Máquinas e Equipamentos',
          segmento: 'Motores , Compressores e Outros',
          segmentoListagem: 'Novo Mercado',
        },
        {
          raiz: 'BBAS',
          setor: 'Financeiro',
          subsetor: 'Intermediários Financeiros',
          segmento: 'Bancos',
          segmentoListagem: 'Novo Mercado',
        },
        {
          raiz: 'ITSA',
          setor: 'Financeiro',
          subsetor: 'Holdings Diversificadas',
          segmento: 'Holdings Diversificadas',
          segmentoListagem: 'Nível 1',
        },
        {
          raiz: 'SIMH',
          setor: 'Financeiro',
          subsetor: 'Holdings Diversificadas',
          segmento: 'Holdings Diversificadas',
          segmentoListagem: 'Novo Mercado',
        },
      ]),
    },
  };
}

function linhaFund(emissorId: string, escopo: string, versao: number, lucro: string) {
  return {
    id: `${emissorId}-${escopo}-${versao}`,
    emissorId,
    source: 'CVM',
    docTipo: 'DFP',
    tipoPeriodo: 'FY',
    escopo,
    padraoContabil: escopo === 'ind' && emissorId !== WEGE ? 'BRGAAP' : 'IFRS',
    dtIni: d('2024-01-01'),
    dtFim: d('2024-12-31'),
    anoFiscal: 2024,
    trimestreFiscal: null,
    versao,
    dtEntrega: d('2025-02-20'),
    dtEntregaOriginal: d('2025-02-19'),
    receita: dec('37992000000.00'),
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: dec(lucro),
    lucroAtribuivel: dec(lucro),
    ativoTotal: null,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    pl: null,
    plControladora: null,
    fco: null,
    fci: null,
    fcf: null,
    capex: null,
    dividendosJcpPagos: null,
    dmplDeclarado: null,
    lpaOn: 1.5,
    lpaPn: null,
    naoSeAplica: [],
    flags: [],
  };
}

describe('universo.listarEmissores', () => {
  it('banco por segmento B3; ITSA financeira pela lista de holdings; SIMH (Holdings Diversificadas) não', async () => {
    const prisma = prismaCadastro() as unknown as PrismaClient;
    const emissores = await listarEmissores(prisma);
    const por = new Map(emissores.map((e) => [e.cnpj, e]));
    expect(por.get(BBAS)).toMatchObject({
      ehBanco: true,
      ehFinanceira: true,
      escopoPreferido: 'ind',
    });
    expect(por.get(ITSA)).toMatchObject({
      ehBanco: false,
      ehFinanceira: true,
      escopoPreferido: 'con',
    });
    expect(por.get(ITSA)!.raizes).toEqual(['ITSA']);
    expect(por.get(SIMH)).toMatchObject({
      ehBanco: false,
      ehFinanceira: false,
      escopoPreferido: 'con',
    });
    expect(por.get(WEGE)).toMatchObject({
      ehBanco: false,
      ehFinanceira: false,
      segmento: 'Motores , Compressores e Outros',
      segmentoListagem: 'Novo Mercado',
    });
  });

  it('sem AssetSetorB3 (fatia C não rodou) cai para CvmCompany.layoutFinanceiro', async () => {
    const prisma = prismaCadastro() as unknown as PrismaClient;
    const [e] = (await listarEmissores(prisma)).filter((x) => x.cnpj === BANCO_SEM_SETOR);
    expect(e).toMatchObject({
      ehBanco: true,
      ehFinanceira: true,
      escopoPreferido: 'ind',
      setor: null,
    });
  });
});

describe('acoes.fundamentosVigentes', () => {
  it("devolve só a maior versão e resolve escopo 'preferido' (BBAS3 ind; WEGE3 con; banco sem setor ind)", async () => {
    const prisma = {
      ...prismaCadastro(),
      assetFundamentalsPeriod: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            linhaFund(WEGE, 'con', 1, '5731000000.00'),
            linhaFund(WEGE, 'con', 2, '5732000000.00'),
            linhaFund(WEGE, 'ind', 3, '1.00'),
            linhaFund(BBAS, 'con', 1, '37896000000.00'),
            linhaFund(BBAS, 'ind', 1, '35000000000.00'),
            linhaFund(BANCO_SEM_SETOR, 'con', 1, '10.00'),
            linhaFund(BANCO_SEM_SETOR, 'ind', 1, '20.00'),
          ]),
      },
    } as unknown as PrismaClient;

    const r = await fundamentosVigentes(prisma, [WEGE, BBAS, BANCO_SEM_SETOR], { tipos: ['FY'] });
    const por = new Map(r.map((f) => [f.emissorId, f]));
    expect(r).toHaveLength(3);
    expect(por.get(WEGE)).toMatchObject({ escopo: 'con', versao: 2, lucroLiquido: 5732000000 });
    expect(por.get(BBAS)).toMatchObject({ escopo: 'ind', padraoContabil: 'BRGAAP' });
    expect(por.get(BANCO_SEM_SETOR)).toMatchObject({ escopo: 'ind', lucroLiquido: 20 });
  });

  it('Decimal→number e Date→AAAA-MM-DD; escopo explícito filtra na query', async () => {
    const findMany = vi.fn().mockResolvedValue([linhaFund(WEGE, 'con', 1, '5731000000.55')]);
    const prisma = { assetFundamentalsPeriod: { findMany } } as unknown as PrismaClient;
    const [f] = await fundamentosVigentes(prisma, [WEGE], {
      tipos: ['FY'],
      escopo: 'con',
      desde: '2020-01-01',
    });
    expect(f.lucroLiquido).toBe(5731000000.55);
    expect(typeof f.receita).toBe('number');
    expect(f.dtFim).toBe('2024-12-31');
    expect(f.dtIni).toBe('2024-01-01');
    expect(f.dtEntregaOriginal).toBe('2025-02-19');
    expect(f.ebit).toBeNull();
    const where = findMany.mock.calls[0][0].where;
    expect(where.escopo).toBe('con');
    expect(where.dtFim.gte).toEqual(d('2020-01-01'));
  });

  it('usa os emissores passados sem consultar o cadastro', async () => {
    const cad = prismaCadastro();
    const prisma = {
      ...cad,
      assetFundamentalsPeriod: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            linhaFund(WEGE, 'con', 1, '1.00'),
            linhaFund(WEGE, 'ind', 1, '2.00'),
          ]),
      },
    } as unknown as PrismaClient;
    const [f] = await fundamentosVigentes(prisma, [WEGE], {
      tipos: ['FY'],
      emissores: [
        {
          cnpj: WEGE,
          nome: 'WEG',
          mesFimExercicio: 12,
          raizes: ['WEGE'],
          setor: null,
          subsetor: null,
          segmento: null,
          segmentoListagem: null,
          ehFinanceira: false,
          ehBanco: true,
          escopoPreferido: 'ind',
        },
      ],
    });
    expect(f.escopo).toBe('ind');
    expect(cad.cvmCompany.findMany).not.toHaveBeenCalled();
  });
});

describe('proventos.proventosBrutos', () => {
  const linhas = [
    {
      id: 'y1',
      symbol: 'PETR4',
      date: d('2015-04-28'),
      dataCom: null,
      tipo: 'Dividendo',
      valorUnitario: 0.1,
      source: 'YAHOO',
    },
    {
      id: 'b1',
      symbol: 'PETR4',
      date: d('2024-05-20'),
      dataCom: d('2024-05-03'),
      tipo: 'DIVIDENDO',
      valorUnitario: 0.5,
      source: 'BRAPI',
    },
  ];

  it("linha YAHOO (dataCom null, date = ex) ⇒ dataExGravada=date, dataPagamento=null, dataExOrigem='date'", async () => {
    const prisma = {
      assetDividendHistory: { findMany: vi.fn().mockResolvedValue(linhas) },
    } as unknown as PrismaClient;
    const r = await proventosBrutos(prisma, ['PETR4']);
    expect(r[0]).toEqual({
      id: 'y1',
      symbol: 'PETR4',
      source: 'YAHOO',
      tipo: 'Dividendo',
      valor: 0.1,
      dataPagamento: null,
      dataExGravada: '2015-04-28',
      dataExOrigem: 'date',
    });
    expect(r[1]).toMatchObject({
      dataPagamento: '2024-05-20',
      dataExGravada: '2024-05-03',
      dataExOrigem: 'dataCom',
    });
  });

  it('impressão digital por símbolo muda quando valor/data muda e existe para símbolo sem linhas', async () => {
    const f1 = vi.fn().mockResolvedValue(linhas);
    const r1 = await proventosBrutos(
      { assetDividendHistory: { findMany: f1 } } as unknown as PrismaClient,
      ['PETR4', 'VALE3'],
    );
    const alterado = [linhas[0], { ...linhas[1], valorUnitario: 1.0 }];
    const f2 = vi.fn().mockResolvedValue(alterado);
    const r2 = await proventosBrutos(
      { assetDividendHistory: { findMany: f2 } } as unknown as PrismaClient,
      ['PETR4'],
    );
    expect(r1.impressoes.get('PETR4')).toMatchObject({ n: 2, somaValor: 0.6 });
    expect(r1.impressoes.get('VALE3')).toMatchObject({ n: 0, somaValor: 0 });
    expect(r2.impressoes.get('PETR4')!.hash).not.toBe(r1.impressoes.get('PETR4')!.hash);
  });
});

describe('universo.universoAnalise', () => {
  it("'fii' exclui conferido=false por padrão e inclui com incluirNaoConferidos", async () => {
    const prisma = {
      fiiTickerMap: {
        findMany: vi.fn().mockResolvedValue([
          { ticker: 'HGLG11', cnpj: 'A', conferido: true, origem: 'b3_isin' },
          { ticker: 'XPTO11', cnpj: 'B', conferido: false, origem: 'b3_nome' },
        ]),
      },
      assetQuoteResumo: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { symbol: 'HGLG11', negociadoUltimos30: true, baixaLiquidez: false },
          ]),
      },
    } as unknown as PrismaClient;
    const padrao = await universoAnalise(prisma, 'fii');
    expect(padrao.map((u) => u.symbol)).toEqual(['HGLG11']);
    expect(padrao[0]).toMatchObject({
      classe: 'fii',
      negociadoUltimos30: true,
      baixaLiquidez: false,
    });

    const todos = await universoAnalise(prisma, 'fii', { incluirNaoConferidos: true });
    expect(todos.map((u) => [u.symbol, u.conferido, u.baixaLiquidez])).toEqual([
      ['HGLG11', true, false],
      ['XPTO11', false, null],
    ]);
  });
});

describe('cotacoes.cotacaoFimDePeriodo', () => {
  it('último pregão ≤ dtFim dentro da janela; sem cotação ⇒ null', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        symbol: 'WEGE3',
        date: d('2024-12-30'),
        closeRaw: dec('50.100000'),
        volumeFin: dec('1000.00'),
        negocios: 10,
        codBdi: '02',
      },
      {
        symbol: 'WEGE3',
        date: d('2024-12-27'),
        closeRaw: dec('49.000000'),
        volumeFin: dec('900.00'),
        negocios: 9,
        codBdi: '02',
      },
    ]);
    const prisma = { assetQuoteDaily: { findMany } } as unknown as PrismaClient;
    const r = await cotacaoFimDePeriodo(
      prisma,
      [
        { symbol: 'WEGE3', dtFim: '2024-12-31' },
        { symbol: 'XXXX3', dtFim: '2024-12-31' },
      ],
      5,
    );
    expect(r.get('WEGE3|2024-12-31')).toMatchObject({ date: '2024-12-30', closeRaw: 50.1 });
    expect(r.get('XXXX3|2024-12-31')).toBeNull();
    expect(findMany.mock.calls[0][0].where.date.gte).toEqual(d('2024-12-26'));
  });
});

describe('fontesArquivo.condicionalDownload', () => {
  it('só envia condicional quando o último download foi processado', () => {
    const base = {
      url: 'https://dados.cvm.gov.br/x.zip',
      etag: '"e"',
      lastModified: null,
      bytes: 10,
      sha256: 'h',
      baixadoEm: new Date(),
      jobUltimo: null,
    };
    expect(condicionalDownload(null)).toBeUndefined();
    expect(condicionalDownload({ ...base, processadoEm: null })).toBeUndefined();
    expect(condicionalDownload({ ...base, processadoEm: new Date() })).toEqual({
      etag: '"e"',
      lastModified: null,
      sha256: 'h',
    });
  });
});
