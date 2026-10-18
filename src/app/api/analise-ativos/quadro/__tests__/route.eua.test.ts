import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsUser } from '@/test/mocks/auth';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  exigirClasse: vi.fn(),
  flagsEua: vi.fn(),
  versao: vi.fn(),
  linhasApi: vi.fn(),
  linhas: vi.fn(),
  prisma: {
    portfolio: { findMany: vi.fn() },
    watchlist: { findMany: vi.fn() },
    criteriaParams: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mocks.exigir,
  exigirClasseAnalise: mocks.exigirClasse,
  flagsEua: mocks.flagsEua,
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (original) => ({
  ...(await original<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>()),
  versaoQuadro: mocks.versao,
  obterLinhasQuadroApi: mocks.linhasApi,
  obterLinhasQuadro: mocks.linhas,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { LINHAS_FIXTURE, linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import {
  _resetarParamsQuadro,
  paraLinhaQuadroApiNaJanela,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import type { QuadroResposta } from '@/types/analiseAtivosApi';
import type { AnaliseQuadroLinha } from '@prisma/client';

function eua(over: Partial<AnaliseQuadroLinha>): AnaliseQuadroLinha {
  return linhaQuadroDb({
    classe: 'stock',
    cnpj: 'CIK:0000320193',
    temScore: false,
    estadoIndice: 'sem_score',
    segmentoListagem: null,
    subsetor: null,
    segmento: null,
    preco: null,
    precoData: null,
    pl: 30,
    dy12mPct: 0.4,
    moeda: 'USD',
    bolsa: 'Nasdaq',
    dpa: 1.02,
    criterios: {
      '5': {
        n: 2,
        de: 6,
        m: [
          ['rec', 'nao_atende', 'x'],
          ['luc', 'nao_atende', 'x'],
          ['ebitda', 'nao_atende', 'x'],
          ['mg', 'atende', 'x'],
          ['dl', 'atende', 'x'],
          ['fcl', 'nao_atende', 'x'],
        ],
      },
    } as never,
    perfilCriterios: 'stock',
    ...over,
  });
}

const LINHAS_EUA: AnaliseQuadroLinha[] = [
  eua({ symbol: 'MSFT', nome: 'Microsoft Corp', setor: 'Serviços', preco: 410 as never }),
  eua({ symbol: 'AAPL', nome: 'Apple Inc.', setor: 'Indústria', preco: 230 as never }),
  eua({ symbol: 'BRK.B', nome: 'Berkshire Hathaway', setor: 'Finanças, seguros e imóveis' }),
  eua({
    symbol: 'O',
    classe: 'reit',
    nome: 'Realty Income Corp',
    setor: 'Finanças, seguros e imóveis',
    segmento: 'Net lease',
    bolsa: 'NYSE',
    perfilCriterios: 'reit',
    criterios: null,
    fcoPorAcao: 4.4,
    dividendosFcoPct: 73,
  }),
];

function m2() {
  _resetarParamsQuadro();
  mocks.prisma.criteriaParams.findFirst.mockResolvedValue({
    version: 2,
    params: CRITERIA_PARAMS_V2,
  });
}

const TODAS = [...LINHAS_FIXTURE, ...LINHAS_EUA];
const req = (qs: string) => new NextRequest(`http://localhost/api/analise-ativos/quadro?${qs}`);

async function corpo(qs: string): Promise<QuadroResposta> {
  const res = await GET(req(qs));
  expect(res.status).toBe(200);
  return (await res.json()) as QuadroResposta;
}

describe('GET /api/analise-ativos/quadro — Stocks e REITs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetarParamsQuadro();
    mocks.exigir.mockResolvedValue(mockAuthAsUser('u1'));
    mocks.exigirClasse.mockResolvedValue(mockAuthAsUser('u1'));
    mocks.flagsEua.mockReturnValue({ eua: true, euaPreco: false });
    mocks.versao.mockResolvedValue('v-eua');
    mocks.linhasApi.mockImplementation(async () =>
      TODAS.map((l) => paraLinhaQuadroApiNaJanela(l, 5)),
    );
    mocks.linhas.mockResolvedValue(TODAS);
    mocks.prisma.criteriaParams.findFirst.mockResolvedValue({
      version: 3,
      params: CRITERIA_PARAMS_V3,
    });
    mocks.prisma.portfolio.findMany.mockResolvedValue([
      { asset: { symbol: 'BRKB-1731234567890-abc' } },
    ]);
    mocks.prisma.watchlist.findMany.mockResolvedValue([]);
  });

  it('404 sem a chave EUA (antes da sessão), em stock e em reit', async () => {
    mocks.exigirClasse.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    for (const c of ['stock', 'reit']) {
      const res = await GET(req(`classe=${c}`));
      expect(res.status).toBe(404);
    }
    expect(mocks.exigirClasse).toHaveBeenCalledTimes(2);
    expect(mocks.exigir).not.toHaveBeenCalled();
    expect(mocks.linhasApi).not.toHaveBeenCalled();
  });

  it('A–Z, US$, regra do universo sem nome de índice e sem cotação sem a chave de preço', async () => {
    const r = await corpo('classe=stock');
    expect(r.itens.map((i) => i.ticker)).toEqual(['AAPL', 'BRK.B', 'MSFT']);
    expect(r.moeda).toBe('USD');
    expect(r.universoDescricao).toMatch(/NYSE ou na Nasdaq/);
    expect(r.universoDescricao).toMatch(/US\$ 2 bi/);
    expect(encontrarProibidasV2(r.universoDescricao ?? '')).toEqual([]);
    const aapl = r.itens[0];
    expect(aapl.preco).toMatchObject({ estado: 'ausente', motivo: 'licenca' });
    expect(aapl.pl).toMatchObject({ estado: 'ausente', motivo: 'licenca' });
    expect(aapl.dy12m).toMatchObject({ estado: 'ausente', motivo: 'licenca' });
    expect(aapl.precoData).toBeNull();
    expect(aapl.dpa).toBe(1.02);
    expect(r.definicoes.map((d) => d.id)).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
  });

  it('com a chave de preço, a cotação EUA da linha segue', async () => {
    mocks.flagsEua.mockReturnValue({ eua: true, euaPreco: true });
    const r = await corpo('classe=stock');
    expect(r.itens[0].preco).toEqual({ estado: 'ok', valor: 230 });
  });

  it('contagens das abas: stock/reit só com a chave EUA', async () => {
    const com = await corpo('classe=acao');
    expect(com.contagens.stock).toBe(3);
    expect(com.contagens.reit).toBe(1);
    expect(com.moeda).toBeUndefined();
    mocks.flagsEua.mockReturnValue({ eua: false, euaPreco: false });
    const sem = await corpo('classe=acao');
    expect(sem.contagens).not.toHaveProperty('stock');
    expect(sem.contagens).not.toHaveProperty('reit');
  });

  it('REIT: chips da v3 com Ocupação desabilitada; ?criterios=ocup = 400', async () => {
    const r = await corpo('classe=reit');
    expect(r.definicoes.map((d) => d.id)).toEqual(['rec', 'dpa', 'fco_acao', 'dl', 'pay', 'ocup']);
    expect(r.definicoes.find((d) => d.id === 'ocup')?.habilitado).toBe(false);
    expect(r.facetas.setores).toEqual(['Net lease']);
    const res = await GET(req('classe=reit&criterios=ocup'));
    expect(res.status).toBe(400);
    expect((await GET(req('classe=reit&criterios=pay'))).status).toBe(200);
  });

  it('params ativos sem os perfis EUA (v2, antes do seed da v3): chips do código, sem 400', async () => {
    m2();
    const r = await corpo('classe=stock&criterios=mg');
    expect(r.definicoes.map((d) => d.id)).toEqual(['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl']);
    expect(r.total).toBe(3);
  });

  it('filtros: critério (E), setor (stock), segmento (reit) e Na minha carteira normalizada', async () => {
    expect((await corpo('classe=stock&criterios=mg,dl')).total).toBe(3);
    expect((await corpo('classe=stock&criterios=rec')).total).toBe(0);
    expect((await corpo('classe=stock&setor=Serviços')).itens.map((i) => i.ticker)).toEqual([
      'MSFT',
    ]);
    expect((await corpo('classe=reit&segmento=Net%20lease')).total).toBe(1);
    const cart = await corpo('classe=stock&naCarteira=1');
    expect(cart.itens.map((i) => i.ticker)).toEqual(['BRK.B']);
  });
});
