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

import { GET as getComparacoes, POST as postComparacao } from '../route';
import { DELETE as deleteComparacao, PATCH as patchComparacao } from '../[id]/route';
import {
  ctx,
  json,
  ligarFlags,
  requisicao,
} from '@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos';
import { _resetarCacheLinhasQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';
import type { ComparacaoPostResposta, ComparacoesResposta } from '@/types/analiseAtivosSalvos';

const U = 'u-1';
const post = (b: unknown) => postComparacao(requisicao('POST', '/comparacoes', b));

beforeEach(() => {
  h.fake.limpar();
  _resetarCacheLinhasQuadro();
  h.auth.mockReset();
  h.auth.mockResolvedValue(mockAuthAsUser(U));
  ligarFlags();
});
afterEach(() => vi.unstubAllEnvs());

describe('/comparacoes', () => {
  it('exige salvos E comparador: qualquer flag desligada → 404 antes da sessão', async () => {
    for (const flag of [
      'ANALISE_ATIVOS_SALVOS_HABILITADO',
      'ANALISE_ATIVOS_COMPARADOR_HABILITADO',
    ] as const) {
      ligarFlags([flag]);
      expect((await getComparacoes(requisicao('GET', '/comparacoes'))).status).toBe(404);
      expect((await post({ classe: 'acao', tickers: ['WEGE3'], janela: 5 })).status).toBe(404);
    }
    expect(h.auth).not.toHaveBeenCalled();
  });

  it('201 nova; 200 atualizada na mesma chave (ordem dos slots não importa); href pronto', async () => {
    const r1 = await json(await post({ classe: 'acao', tickers: ['wege3', 'ITUB4'], janela: 5 }));
    expect(r1.status).toBe(201);
    const c1 = r1.corpo as unknown as ComparacaoPostResposta;
    expect(c1).toMatchObject({
      atualizada: false,
      comparacao: { nome: 'WEGE3 · ITUB4', tickers: ['WEGE3', 'ITUB4'], tipoFii: null },
    });
    expect(c1.comparacao.href).toBe('/analise-ativos/comparador?t=WEGE3,ITUB4');
    const r2 = await json(
      await post({ classe: 'acao', tickers: ['ITUB4', 'WEGE3'], janela: 5, nome: 'Bancos' }),
    );
    expect(r2.status).toBe(200);
    expect(r2.corpo).toMatchObject({
      atualizada: true,
      comparacao: { id: c1.comparacao.id, nome: 'Bancos', tickers: ['ITUB4', 'WEGE3'] },
    });
    // outra janela = outra comparação
    expect((await post({ classe: 'acao', tickers: ['WEGE3', 'ITUB4'], janela: 10 })).status).toBe(
      201,
    );
    const lista = (await (
      await getComparacoes(requisicao('GET', '/comparacoes?classe=acao'))
    ).json()) as ComparacoesResposta;
    expect(lista.comparacoes).toHaveLength(2);
    expect(lista.comparacoes[1].href).toBe('/analise-ativos/comparador?t=ITUB4,WEGE3');
  });

  it('400: classe misturada, tipoFii em ação, campo extra, 5 tickers; 404 fora do Quadro', async () => {
    expect((await post({ classe: 'acao', tickers: ['WEGE3', 'HGLG11'], janela: 5 })).status).toBe(
      400,
    );
    expect((await post({ classe: 'fii', tickers: ['WEGE3'], janela: 5 })).status).toBe(400);
    expect(
      (await post({ classe: 'acao', tickers: ['WEGE3'], janela: 5, tipoFii: 'papel' })).status,
    ).toBe(400);
    expect((await post({ classe: 'acao', tickers: ['WEGE3'], janela: 5, x: 1 })).status).toBe(400);
    expect(
      (
        await post({
          classe: 'acao',
          tickers: ['WEGE3', 'ITUB4', 'TGMA3', 'AURE3', 'CEDO4'],
          janela: 5,
        })
      ).status,
    ).toBe(400);
    expect((await post({ classe: 'acao', tickers: ['ZZZZ3'], janela: 5 })).status).toBe(404);
    expect(h.fake.tabelas.analiseComparacao).toEqual([]);
  });

  it('FII com tipo entra na chave e no href', async () => {
    const r = (await (
      await post({ classe: 'fii', tickers: ['HGLG11', 'HCTR11'], janela: 5, tipoFii: 'tijolo' })
    ).json()) as ComparacaoPostResposta;
    expect(r.comparacao.href).toBe('/analise-ativos/comparador?t=HGLG11,HCTR11&tipo=tijolo');
    expect(
      (await post({ classe: 'fii', tickers: ['HGLG11', 'HCTR11'], janela: 5, tipoFii: 'papel' }))
        .status,
    ).toBe(201);
  });

  it('31ª comparação → 409', async () => {
    for (let i = 0; i < 30; i += 1) {
      h.fake.tabelas.analiseComparacao.push({
        id: `c${i}`,
        userId: U,
        chave: `k${i}`,
        nome: 'x',
        classe: 'acao',
        tickers: ['WEGE3'],
        janela: 5,
        tipoFii: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const r = await post({ classe: 'acao', tickers: ['WEGE3'], janela: 5 });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/30 comparações/);
  });

  it('PATCH/DELETE: outro usuário 404; consultor GET vazio e mutações 403', async () => {
    const c = (await (
      await post({ classe: 'acao', tickers: ['WEGE3'], janela: 5 })
    ).json()) as ComparacaoPostResposta;
    const id = c.comparacao.id;
    const patch = () =>
      patchComparacao(requisicao('PATCH', `/comparacoes/${id}`, { nome: 'Nova' }), ctx({ id }));
    const del = () => deleteComparacao(requisicao('DELETE', `/comparacoes/${id}`), ctx({ id }));

    h.auth.mockResolvedValue(mockAuthAsUser('outro'));
    expect([(await patch()).status, (await del()).status]).toEqual([404, 404]);

    h.auth.mockResolvedValue(mockAuthAsConsultant('c-1', U));
    const g = (await (
      await getComparacoes(requisicao('GET', '/comparacoes'))
    ).json()) as ComparacoesResposta;
    expect(g).toMatchObject({ comparacoes: [], podeSalvar: false });
    expect([(await patch()).status, (await del()).status]).toEqual([403, 403]);
    expect((await post({ classe: 'acao', tickers: ['ITUB4'], janela: 5 })).status).toBe(403);

    h.auth.mockResolvedValue(mockAuthAsUser(U));
    expect((await json(await patch())).corpo).toMatchObject({ nome: 'Nova' });
    expect(await (await del()).json()).toEqual({ ok: true });
    expect(h.fake.tabelas.analiseComparacao).toEqual([]);
  });
});
