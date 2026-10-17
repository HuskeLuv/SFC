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

import { GET as getIndice } from '../route';
import { PUT as putSalvo } from '../[ticker]/route';
import { POST as postListas } from '../../listas/route';
import {
  ctx,
  json,
  ligarFlags,
  requisicao,
} from '@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';
import type { IndiceSalvosResposta, SalvosPutResposta } from '@/types/analiseAtivosSalvos';

const U = 'u-1';

const put = (ticker: string, listaIds: unknown) =>
  putSalvo(requisicao('PUT', `/salvos/${ticker}`, { listaIds }), ctx({ ticker }));

async function lista(nome: string): Promise<string> {
  const res = await postListas(requisicao('POST', '/listas', { nome }));
  return ((await res.json()) as { id: string }).id;
}

beforeEach(() => {
  h.fake.limpar();
  _resetarCacheLinhasQuadro();
  h.auth.mockReset();
  h.auth.mockResolvedValue(mockAuthAsUser(U));
  ligarFlags();
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /salvos (índice do botão Salvar)', () => {
  it('flag desligada → 404 antes da sessão', async () => {
    ligarFlags(['ANALISE_ATIVOS_SALVOS_HABILITADO']);
    expect((await getIndice(requisicao('GET', '/salvos'))).status).toBe(404);
    expect((await put('WEGE3', ['padrao'])).status).toBe(404);
    expect(h.auth).not.toHaveBeenCalled();
  });

  it('ticker → listas, em ordem de criação; consultor vê vazio', async () => {
    const a = await lista('A');
    const b = await lista('B');
    await put('WEGE3', [b, a]);
    await put('HGLG11', [b]);
    const r = (await (
      await getIndice(requisicao('GET', '/salvos'))
    ).json()) as IndiceSalvosResposta;
    expect(r.porTicker).toEqual({ WEGE3: [a, b], HGLG11: [b] });
    expect(r.listas.map((l) => l.nome)).toEqual(['A', 'B']);
    expect(r.podeSalvar).toBe(true);

    h.auth.mockResolvedValue(mockAuthAsConsultant('c-1', U));
    const c = (await (
      await getIndice(requisicao('GET', '/salvos'))
    ).json()) as IndiceSalvosResposta;
    expect(c).toMatchObject({
      porTicker: {},
      listas: [],
      podeSalvar: false,
      motivoSemSalvar: 'consultor',
    });
  });
});

describe('PUT /salvos/[ticker]', () => {
  it("sentinela: 0 listas cria 'Salvos'; 1 usa a existente; 2+ → 400", async () => {
    const r1 = await json(await put('WEGE3', ['padrao']));
    expect(r1.status).toBe(200);
    const c1 = r1.corpo as unknown as SalvosPutResposta;
    expect(c1.listaCriada?.nome).toBe('Salvos');
    const c2 = (await (await put('ITUB4', ['padrao'])).json()) as SalvosPutResposta;
    expect(c2.listaIds).toEqual(c1.listaIds);
    expect(c2.listaCriada).toBeUndefined();
    await lista('Outra');
    const r3 = await put('TGMA3', ['padrao']);
    expect(r3.status).toBe(400);
    expect((await r3.json()).error).toBe('Escolha em quais listas salvar.');
  });

  it('dois PUT concorrentes com 0 listas criam uma lista só', async () => {
    const [a, b] = await Promise.all([put('WEGE3', ['padrao']), put('ITUB4', ['padrao'])]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.fake.tabelas.analiseLista).toHaveLength(1);
    expect(h.fake.tabelas.analiseListaItem).toHaveLength(2);
  });

  it('400: corpo inválido, padrao misturado, ticker mal formado; 404: fora do Quadro e lista alheia', async () => {
    const a = await lista('A');
    expect((await put('WEGE3', 'padrao')).status).toBe(400);
    expect((await put('WEGE3', ['padrao', a])).status).toBe(400);
    expect((await put('WEGE3', [a, a])).status).toBe(400);
    expect((await put('W$', [a])).status).toBe(400);
    expect((await put('ZZZZ3', [a])).status).toBe(404);
    h.auth.mockResolvedValue(mockAuthAsUser('outro'));
    expect((await put('WEGE3', [a])).status).toBe(404);
    expect(h.fake.tabelas.analiseListaItem).toEqual([]);
  });

  it('[] remove de todas, inclusive ativo que saiu do Quadro', async () => {
    const a = await lista('A');
    h.fake.tabelas.analiseListaItem.push({
      id: 'v',
      listaId: a,
      userId: U,
      symbol: 'CEDO4',
      classe: 'acao',
      createdAt: new Date(),
    });
    const r = await json(await put('CEDO4', []));
    expect(r).toEqual({ status: 200, corpo: { ticker: 'CEDO4', listaIds: [], salvo: false } });
    expect(h.fake.tabelas.analiseListaItem).toEqual([]);
  });

  it('limite de 500 por usuário → 409', async () => {
    const a = await lista('A');
    for (let i = 0; i < 500; i += 1) {
      h.fake.tabelas.analiseListaItem.push({
        id: `i${i}`,
        listaId: `l${i % 3}`,
        userId: U,
        symbol: `X${i}3`,
        classe: 'acao',
        createdAt: new Date(),
      });
    }
    expect((await put('WEGE3', [a])).status).toBe(409);
  });

  it('consultor → 403 sem gravar', async () => {
    h.auth.mockResolvedValue(mockAuthAsConsultant('c-1', U));
    const r = await put('WEGE3', ['padrao']);
    expect(r.status).toBe(403);
    expect(h.fake.tabelas.analiseLista).toEqual([]);
  });
});
