import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
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
}));
vi.mock('@/services/analiseAtivos/leitura/linhasQuadro', async (original) => ({
  ...(await original<typeof import('@/services/analiseAtivos/leitura/linhasQuadro')>()),
  versaoQuadro: mocks.versao,
  obterLinhasQuadroApi: mocks.linhasApi,
  obterLinhasQuadro: mocks.linhas,
}));

import { GET } from '../route';
import { ApiError } from '@/utils/apiErrorHandler';
import { GERADO_EM_FIXTURE, LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import {
  _resetarParamsQuadro,
  paraLinhaQuadroApiNaJanela,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { COMPACTOS_WEGE3, definicoesChips } from '@/test/fixtures/analiseAtivos/criterios';
import type { Janela } from '@/types/analiseAtivosCriterios';

/** Fixture com WEGE3 avaliada (cópia compacta da janela 5). */
const LINHAS_DB = LINHAS_FIXTURE.map((l) =>
  l.symbol === 'WEGE3' ? { ...l, criterios: COMPACTOS_WEGE3, perfilCriterios: 'acao' } : l,
);

/** chaves de um JSON, recursivamente */
function chavesJson(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => chavesJson(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      chavesJson(x, out);
    }
  }
  return out;
}

const VERSAO_FIXTURE_DB = GERADO_EM_FIXTURE.toISOString();

const req = (qs: string) => new NextRequest(`http://localhost/api/analise-ativos/quadro?${qs}`);

describe('GET /api/analise-ativos/quadro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetarParamsQuadro();
    mocks.exigir.mockResolvedValue(mockAuthAsUser('u1'));
    mocks.versao.mockResolvedValue(VERSAO_FIXTURE_DB);
    mocks.linhasApi.mockImplementation(async (_c: unknown, o?: { janela?: Janela }) =>
      LINHAS_DB.map((l) => paraLinhaQuadroApiNaJanela(l, o?.janela ?? 5)),
    );
    mocks.prisma.criteriaParams.findFirst.mockResolvedValue({
      version: 1,
      params: CRITERIA_PARAMS_V1,
    });
    mocks.linhas.mockResolvedValue(LINHAS_FIXTURE.filter((l) => l.noQuadro));
    mocks.prisma.portfolio.findMany.mockResolvedValue([{ asset: { symbol: 'WEGE3' } }]);
    mocks.prisma.watchlist.findMany.mockResolvedValue([{ asset: { symbol: 'itub4' } }]);
  });

  it('404 sem acesso (flag desligada ou fora do beta)', async () => {
    mocks.exigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await GET(req('classe=acao'));
    expect(res.status).toBe(404);
    expect(mocks.linhasApi).not.toHaveBeenCalled();
  });

  it('400 com query inválida (zod)', async () => {
    for (const qs of [
      '',
      'classe=stock',
      'classe=acao&ordem=nota',
      'classe=acao&limite=500',
      'classe=fii&dyMin=-1',
      // v2.4: o indicador antigo e os filtros antigos saíram (zod estrito)
      'classe=acao&ordem=indiceMf',
      'classe=acao&lucroConsistente=1',
      'classe=acao&dyMin=4',
      'classe=fii&pvpMax=1',
      'classe=fii&tipo=papel',
      'classe=acao&somenteCompletos=1',
      'classe=acao&janela=4',
      'classe=acao&janela=x',
      'classe=acao&criterios=xpto',
      // id válido, mas fora dos chips habilitados da classe
      'classe=acao&criterios=rend',
      'classe=fii&criterios=rec',
      'classe=fii&criterios=vac',
      'classe=fii&criterios=ltv',
    ]) {
      const res = await GET(req(qs));
      expect(res.status, qs).toBe(400);
    }
  });

  it('200 com no-store, Server-Timing e o contrato da resposta', async () => {
    const res = await GET(req('classe=acao&ordem=pl&dir=asc'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Server-Timing')).toMatch(/^quadro;dur=/);
    const corpo = await res.json();
    expect(corpo).toMatchObject({
      classe: 'acao',
      dataRef: '2026-09-29',
      versao: VERSAO_FIXTURE_DB,
      offset: 0,
      limite: 25,
    });
    expect(corpo.contagens.acao).toBeGreaterThan(0);
    // P/L ausente (AURE3) no fim
    const t = corpo.itens.map((i: { ticker: string }) => i.ticker);
    expect(t[t.length - 1]).toBe('AURE3');
    expect(mocks.prisma.portfolio.findMany).not.toHaveBeenCalled();
  });

  it('naCarteira=1 lê posições e planejados do targetUserId (cliente do consultor)', async () => {
    mocks.exigir.mockResolvedValue(mockAuthAsConsultant('consultor', 'cliente-9'));
    const res = await GET(req('classe=acao&naCarteira=1'));
    const corpo = await res.json();
    expect(corpo.itens.map((i: { ticker: string }) => i.ticker).sort()).toEqual(['ITUB4', 'WEGE3']);
    expect(mocks.prisma.portfolio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'cliente-9' }) }),
    );
    expect(mocks.prisma.watchlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'cliente-9' }) }),
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('padrão: A–Z, janela 5, totalClasse e definicoes (chips) da classe', async () => {
    const res = await GET(req('classe=acao'));
    const corpo = await res.json();
    expect(corpo.itens.map((i: { ticker: string }) => i.ticker)).toEqual([
      'AURE3',
      'ITUB4',
      'TGMA3',
      'WEGE3',
    ]);
    expect(corpo.janela).toBe(5);
    expect(corpo.totalClasse).toBe(4);
    expect(corpo.definicoes).toEqual(definicoesChips('acao'));
    expect(mocks.linhasApi).toHaveBeenCalledWith(undefined, { janela: undefined });
  });

  it('criterios na janela: E lógico; booleanos aceitam 1/true e combinam', async () => {
    const corpo = await (await GET(req('classe=acao&criterios=rec,luc&janela=5'))).json();
    expect(corpo.itens.map((i: { ticker: string }) => i.ticker)).toEqual(['WEGE3']);
    expect(corpo.itens[0].criterios).toMatchObject({ janela: 5, n: 5, de: 6 });
    const fcl = await (await GET(req('classe=acao&criterios=rec,fcl'))).json();
    expect(fcl.itens).toEqual([]);
    expect(fcl.total).toBe(0);
    const carteira = await (await GET(req('classe=acao&criterios=rec&naCarteira=true'))).json();
    expect(carteira.itens.map((i: { ticker: string }) => i.ticker)).toEqual(['WEGE3']);
    // a janela 10 não tem avaliação na fixture: ninguém passa
    const dez = await (await GET(req('classe=acao&criterios=rec&janela=10'))).json();
    expect(dez.janela).toBe(10);
    expect(dez.itens).toEqual([]);
    expect(mocks.linhasApi).toHaveBeenCalledWith(undefined, { janela: 10 });
  });

  it("ordem 'criterios' (desc) e 'lucro10' aceitas", async () => {
    const corpo = await (await GET(req('classe=acao&ordem=criterios'))).json();
    expect(corpo.itens[0].ticker).toBe('WEGE3');
    expect((await GET(req('classe=fii&ordem=lucro10&dir=desc'))).status).toBe(200);
  });

  it('JSON sem chave /indice|semaforo|destaque/ (varredura recursiva das chaves)', async () => {
    for (const qs of ['classe=acao', 'classe=fii&janela=3', 'classe=acao&criterios=rec']) {
      const corpo = await (await GET(req(qs))).json();
      expect(
        chavesJson(corpo).filter((k) => /indice|semaforo|destaque/i.test(k)),
        qs,
      ).toEqual([]);
    }
  });

  it('sem criteria_params no banco: usa o v1 do código (o Quadro não quebra)', async () => {
    mocks.prisma.criteriaParams.findFirst.mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await GET(req('classe=fii'));
    expect(res.status).toBe(200);
    expect((await res.json()).definicoes).toEqual(definicoesChips('fii'));
  });

  it('params dos critérios em memória: um findFirst para várias requisições', async () => {
    await GET(req('classe=acao'));
    await GET(req('classe=fii'));
    expect(mocks.prisma.criteriaParams.findFirst).toHaveBeenCalledTimes(1);
  });
});
