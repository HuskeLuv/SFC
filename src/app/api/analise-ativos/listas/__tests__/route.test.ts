import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSalvos } from '@/services/analiseAtivos/salvos/__tests__/fakeSalvosPrisma';

const h = vi.hoisted(() => ({ fake: null as unknown as FakeSalvos, auth: vi.fn() }));

vi.mock('@/lib/prisma', async () => {
  const { criarBancoRotas } =
    await import('@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos');
  h.fake = criarBancoRotas();
  return { prisma: h.fake.prisma, default: h.fake.prisma };
});
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig<object>()),
  requireAuthWithActing: h.auth,
}));

import { GET as getListas, POST as postListas } from '../route';
import { DELETE as deleteLista, GET as getLista, PATCH as patchLista } from '../[id]/route';
import { POST as postItem } from '../[id]/itens/route';
import { DELETE as deleteItem } from '../[id]/itens/[ticker]/route';
import {
  ctx,
  json,
  ligarFlags,
  requisicao,
} from '@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';
import type { LinhasListaResposta, ListasResposta, ResumoLista } from '@/types/analiseAtivosSalvos';

const U = 'u-1';

async function criar(nome: string, extra: Record<string, unknown> = {}): Promise<ResumoLista> {
  const res = await postListas(requisicao('POST', '/listas', { nome, ...extra }));
  expect(res.status).toBe(201);
  return (await res.json()) as ResumoLista;
}

beforeEach(() => {
  h.fake.limpar();
  _resetarCacheLinhasQuadro();
  h.auth.mockReset();
  h.auth.mockResolvedValue(mockAuthAsUser(U));
  ligarFlags();
});
afterEach(() => vi.unstubAllEnvs());

describe('acesso', () => {
  it('flag SALVOS desligada → 404 em todas, ANTES da sessão', async () => {
    ligarFlags(['ANALISE_ATIVOS_SALVOS_HABILITADO']);
    const id = '00000000-0000-4000-8000-000000000001';
    const respostas = await Promise.all([
      getListas(requisicao('GET', '/listas')),
      postListas(requisicao('POST', '/listas', { nome: 'A' })),
      getLista(requisicao('GET', `/listas/${id}?classe=acao`), ctx({ id })),
      patchLista(requisicao('PATCH', `/listas/${id}`, { nome: 'B' }), ctx({ id })),
      deleteLista(requisicao('DELETE', `/listas/${id}`), ctx({ id })),
      postItem(requisicao('POST', `/listas/${id}/itens`, { ticker: 'WEGE3' }), ctx({ id })),
      deleteItem(requisicao('DELETE', `/listas/${id}/itens/WEGE3`), ctx({ id, ticker: 'WEGE3' })),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
    expect(h.auth).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    h.auth.mockRejectedValue(new Error('Não autorizado'));
    expect((await getListas(requisicao('GET', '/listas'))).status).toBe(401);
  });

  it('consultor agindo: GET vazio com podeSalvar=false; mutações 403', async () => {
    const minha = await criar('Do cliente');
    h.auth.mockResolvedValue(mockAuthAsConsultant('consultor-1', U));
    const { status, corpo } = await json(await getListas(requisicao('GET', '/listas')));
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ listas: [], podeSalvar: false, motivoSemSalvar: 'consultor' });
    const id = minha.id;
    const mut = await Promise.all([
      postListas(requisicao('POST', '/listas', { nome: 'X' })),
      getLista(requisicao('GET', `/listas/${id}?classe=acao`), ctx({ id })),
      patchLista(requisicao('PATCH', `/listas/${id}`, { nome: 'B' }), ctx({ id })),
      deleteLista(requisicao('DELETE', `/listas/${id}`), ctx({ id })),
      postItem(requisicao('POST', `/listas/${id}/itens`, { ticker: 'WEGE3' }), ctx({ id })),
      deleteItem(requisicao('DELETE', `/listas/${id}/itens/WEGE3`), ctx({ id, ticker: 'WEGE3' })),
    ]);
    expect(mut.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect((await mut[0].json()).error).toBe('As listas são pessoais');
    expect(h.fake.tabelas.analiseLista).toHaveLength(1);
  });
});

describe('POST/GET /listas', () => {
  it('cria (201) com o ativo inicial e lista em ordem de criação, com limites', async () => {
    const a = await criar('  Dividendos   e  renda ', { tickerInicial: 'hglg11' });
    expect(a).toMatchObject({ nome: 'Dividendos e renda', contagem: { acao: 0, fii: 1 } });
    await criar('Bancos');
    const { corpo } = await json(await getListas(requisicao('GET', '/listas')));
    const r = corpo as unknown as ListasResposta;
    expect(r.listas.map((l) => l.nome)).toEqual(['Dividendos e renda', 'Bancos']);
    expect(r.podeSalvar).toBe(true);
    expect(r.limites.listas).toBe(20);
  });

  it('400 com campo extra, nome vazio ou longo; 409 com nome repetido; 404 ativo fora do Quadro', async () => {
    const st = async (b: unknown) => (await postListas(requisicao('POST', '/listas', b))).status;
    expect(await st({ nome: 'A', extra: 1 })).toBe(400);
    expect(await st({ nome: '   ' })).toBe(400);
    expect(await st({ nome: 'x'.repeat(41) })).toBe(400);
    expect(await st(null)).toBe(400);
    await criar('Bancos');
    expect(await st({ nome: 'BANCOS' })).toBe(409);
    expect(await st({ nome: 'Novo', tickerInicial: 'ZZZZ3' })).toBe(404);
  });

  it('21ª lista → 409', async () => {
    for (let i = 0; i < 20; i += 1) await criar(`L${i}`);
    const res = await postListas(requisicao('POST', '/listas', { nome: 'L20' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/20 listas/);
  });
});

describe('/listas/[id]', () => {
  it('GET: linhas do Quadro da classe + foraDoQuadro; outra classe pela query', async () => {
    const l = await criar('Mista', { tickerInicial: 'WEGE3' });
    const id = l.id;
    for (const t of ['ITUB4', 'CEDO4', 'HGLG11']) {
      const r = await postItem(
        requisicao('POST', `/listas/${id}/itens`, { ticker: t }),
        ctx({ id }),
      );
      expect(r.status).toBe(201);
    }
    const acao = (await (
      await getLista(requisicao('GET', `/listas/${id}?classe=acao&janela=3`), ctx({ id }))
    ).json()) as LinhasListaResposta;
    expect(acao.linhas.map((x) => x.ticker)).toEqual(['ITUB4', 'WEGE3']);
    expect(acao.janela).toBe(3);
    expect(acao.foraDoQuadro.map((x) => [x.ticker, x.motivo])).toEqual([
      ['CEDO4', 'fora_do_quadro'],
    ]);
    expect(acao.contagem).toEqual({ acao: 3, fii: 1 });
    expect(acao.definicoes.length).toBeGreaterThan(0);
    const fii = (await (
      await getLista(requisicao('GET', `/listas/${id}?classe=fii`), ctx({ id }))
    ).json()) as LinhasListaResposta;
    expect(fii.linhas.map((x) => x.ticker)).toEqual(['HGLG11']);
  });

  it('GET 400 com query inválida; 404 com id inválido ou de outro usuário', async () => {
    const l = await criar('Minha');
    const id = l.id;
    expect((await getLista(requisicao('GET', `/listas/${id}`), ctx({ id }))).status).toBe(400);
    expect(
      (await getLista(requisicao('GET', `/listas/${id}?classe=acao&x=1`), ctx({ id }))).status,
    ).toBe(400);
    expect(
      (await getLista(requisicao('GET', '/listas/abc?classe=acao'), ctx({ id: 'abc' }))).status,
    ).toBe(404);
    h.auth.mockResolvedValue(mockAuthAsUser('outro'));
    expect(
      (await getLista(requisicao('GET', `/listas/${id}?classe=acao`), ctx({ id }))).status,
    ).toBe(404);
    expect(
      (await patchLista(requisicao('PATCH', `/listas/${id}`, { nome: 'Minha agora' }), ctx({ id })))
        .status,
    ).toBe(404);
    expect((await deleteLista(requisicao('DELETE', `/listas/${id}`), ctx({ id }))).status).toBe(
      404,
    );
    expect(
      (await postItem(requisicao('POST', `/listas/${id}/itens`, { ticker: 'WEGE3' }), ctx({ id })))
        .status,
    ).toBe(404);
    expect(h.fake.tabelas.analiseLista[0]).toMatchObject({ nome: 'Minha', userId: U });
  });

  it('PATCH nome e alertas; alertas com o recurso desligado → 400', async () => {
    const l = await criar('A');
    const id = l.id;
    const r = await json(
      await patchLista(
        requisicao('PATCH', `/listas/${id}`, { nome: 'B', alertas: { criterios: true } }),
        ctx({ id }),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ nome: 'B', alertas: { criterios: true, resultado: true } });
    expect((await patchLista(requisicao('PATCH', `/listas/${id}`, {}), ctx({ id }))).status).toBe(
      400,
    );
    ligarFlags(['ANALISE_ATIVOS_ALERTAS_HABILITADO']);
    expect(
      (
        await patchLista(
          requisicao('PATCH', `/listas/${id}`, { alertas: { provento: false } }),
          ctx({ id }),
        )
      ).status,
    ).toBe(400);
  });

  it('DELETE apaga a lista e os itens', async () => {
    const l = await criar('A', { tickerInicial: 'WEGE3' });
    const res = await deleteLista(requisicao('DELETE', `/listas/${l.id}`), ctx({ id: l.id }));
    expect(await res.json()).toEqual({ ok: true });
    expect(h.fake.tabelas.analiseLista).toEqual([]);
    expect(h.fake.tabelas.analiseListaItem).toEqual([]);
  });
});

describe('/listas/[id]/itens', () => {
  it('201 → 200 (idempotente); ticker inválido 400; fora do Quadro 404; 201º item 409', async () => {
    const l = await criar('A');
    const id = l.id;
    const post = (ticker: unknown) =>
      postItem(requisicao('POST', `/listas/${id}/itens`, { ticker }), ctx({ id }));
    const r1 = await json(await post('wege3'));
    expect(r1).toMatchObject({ status: 201, corpo: { ticker: 'WEGE3', classe: 'acao' } });
    expect((await post('WEGE3')).status).toBe(200);
    expect((await post('WE')).status).toBe(400);
    expect((await post('ZZZZ3')).status).toBe(404);
    for (let i = 0; i < 199; i += 1) {
      h.fake.tabelas.analiseListaItem.push({
        id: `x${i}`,
        listaId: id,
        userId: U,
        symbol: `X${i}3`,
        classe: 'acao',
        createdAt: new Date(),
      });
    }
    expect((await post('ITUB4')).status).toBe(409);
  });

  it('DELETE remove (idempotente) e aceita ativo que saiu do Quadro', async () => {
    const l = await criar('A', { tickerInicial: 'WEGE3' });
    h.fake.tabelas.analiseListaItem.push({
      id: 'velho',
      listaId: l.id,
      userId: U,
      symbol: 'CEDO4',
      classe: 'acao',
      createdAt: new Date(),
    });
    const del = (t: string) =>
      deleteItem(requisicao('DELETE', `/listas/${l.id}/itens/${t}`), ctx({ id: l.id, ticker: t }));
    expect((await del('CEDO4')).status).toBe(200);
    expect((await del('WEGE3')).status).toBe(200);
    expect((await del('WEGE3')).status).toBe(200);
    expect(h.fake.tabelas.analiseListaItem).toEqual([]);
  });
});
