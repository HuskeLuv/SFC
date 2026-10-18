import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSalvos } from '@/services/analiseAtivos/salvos/__tests__/fakeSalvosPrisma';

/**
 * Salvos com Stocks/REITs (feature EUA, fatia D): com ANALISE_ATIVOS_EUA_HABILITADO, BRK.B e O
 * entram nas listas (classe da linha do Quadro; BRK-B vira BRK.B), a contagem traz stock/reit e o
 * índice do botão Salvar inclui os tickers EUA. Desligada: 400/404 e o Brasil igual.
 */
const h = vi.hoisted(() => ({ fake: null as unknown as FakeSalvos, auth: vi.fn() }));

vi.mock('@/lib/prisma', async () => {
  const { criarBancoRotas } =
    await import('@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos');
  const { LINHAS_FIXTURE, linhaQuadroDb } = await import('@/test/fixtures/analiseAtivos/linhasDb');
  h.fake = criarBancoRotas();
  const eua = [
    linhaQuadroDb({ symbol: 'BRK.B', classe: 'stock', cnpj: 'CIK:0001067983', moeda: 'USD' }),
    linhaQuadroDb({ symbol: 'O', classe: 'reit', cnpj: 'CIK:0000726728', moeda: 'USD' }),
  ];
  Object.assign(h.fake.prisma, {
    analiseQuadroLinha: {
      ...(h.fake.prisma as unknown as { analiseQuadroLinha: object }).analiseQuadroLinha,
      findMany: async () => [...LINHAS_FIXTURE, ...eua],
    },
  });
  return { prisma: h.fake.prisma, default: h.fake.prisma };
});
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig<object>()),
  requireAuthWithActing: h.auth,
}));

import { GET as getListas, POST as postListas } from '../../listas/route';
import { POST as postItem } from '../../listas/[id]/itens/route';
import { GET as getIndice } from '../route';
import { PUT as putSalvo } from '../[ticker]/route';
import {
  ctx,
  ligarFlags,
  requisicao,
} from '@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { mockAuthAsUser } from '@/test/mocks/auth';
import {
  ClasseSalvoSchema,
  TickerSalvoSchema,
  ehTickerValido,
} from '@/services/analiseAtivos/salvos/contrato';
import type { ListasResposta, ResumoLista } from '@/types/analiseAtivosSalvos';

const U = 'u-eua';

beforeEach(() => {
  h.fake.limpar();
  _resetarCacheLinhasQuadro();
  h.auth.mockReset();
  h.auth.mockResolvedValue(mockAuthAsUser(U));
  ligarFlags();
  vi.stubEnv('ANALISE_ATIVOS_EUA_HABILITADO', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('contrato com a chave EUA', () => {
  it('ligada: stock/reit e BRK.B (BRK-B vira BRK.B); desligada: só o Brasil', () => {
    expect(ClasseSalvoSchema.safeParse('stock').success).toBe(true);
    expect(TickerSalvoSchema.parse('brk-b')).toBe('BRK.B');
    expect(ehTickerValido('O')).toBe(true);
    vi.stubEnv('ANALISE_ATIVOS_EUA_HABILITADO', '');
    expect(ClasseSalvoSchema.safeParse('stock').success).toBe(false);
    expect(ClasseSalvoSchema.safeParse('acao').success).toBe(true);
    expect(TickerSalvoSchema.safeParse('AAPL').success).toBe(false);
    expect(TickerSalvoSchema.parse('wege3')).toBe('WEGE3');
    expect(ehTickerValido('O', 'reit')).toBe(false);
  });
});

describe('rotas dos Salvos com Stocks/REITs', () => {
  it('lista com BRK.B e O: classe da linha do Quadro, contagem e índice do Salvar', async () => {
    const res = await postListas(
      requisicao('POST', '/listas', { nome: 'EUA', tickerInicial: 'BRK-B' }),
    );
    expect(res.status).toBe(201);
    const lista = (await res.json()) as ResumoLista;
    expect(lista.contagem).toEqual({ acao: 0, fii: 0, stock: 1 });
    const item = await postItem(
      requisicao('POST', `/listas/${lista.id}/itens`, { ticker: 'O' }),
      ctx({ id: lista.id }),
    );
    expect(item.status).toBe(201);
    expect(await item.json()).toMatchObject({ ticker: 'O', classe: 'reit' });

    const listas = (await (await getListas(requisicao('GET', '/listas'))).json()) as ListasResposta;
    expect(listas.listas[0].contagem).toEqual({ acao: 0, fii: 0, stock: 1, reit: 1 });
    const indice = await (await getIndice(requisicao('GET', '/salvos'))).json();
    expect(Object.keys(indice.porTicker).sort()).toEqual(['BRK.B', 'O']);
  });

  it('PUT /salvos/BRK.B com o sentinela cria a lista padrão com o stock', async () => {
    const res = await putSalvo(
      requisicao('PUT', '/salvos/BRK.B', { listaIds: ['padrao'] }),
      ctx({ ticker: 'BRK.B' }),
    );
    expect(res.status).toBe(200);
    const indice = await (await getIndice(requisicao('GET', '/salvos'))).json();
    expect(indice.porTicker['BRK.B']).toHaveLength(1);
  });

  it('chave EUA desligada: ticker EUA → 400; contagem e índice sem EUA; o Brasil segue', async () => {
    const lista = (await (
      await postListas(requisicao('POST', '/listas', { nome: 'Mista', tickerInicial: 'O' }))
    ).json()) as ResumoLista;
    await postItem(
      requisicao('POST', `/listas/${lista.id}/itens`, { ticker: 'WEGE3' }),
      ctx({ id: lista.id }),
    );
    vi.stubEnv('ANALISE_ATIVOS_EUA_HABILITADO', '');
    const recusado = await postItem(
      requisicao('POST', `/listas/${lista.id}/itens`, { ticker: 'BRK.B' }),
      ctx({ id: lista.id }),
    );
    expect(recusado.status).toBe(400);
    const listas = (await (await getListas(requisicao('GET', '/listas'))).json()) as ListasResposta;
    expect(listas.listas[0].contagem).toEqual({ acao: 1, fii: 0 });
    const indice = await (await getIndice(requisicao('GET', '/salvos'))).json();
    expect(Object.keys(indice.porTicker)).toEqual(['WEGE3']);
  });
});
