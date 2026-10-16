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

import { GET as getFiltros, POST as postFiltro } from '../route';
import { DELETE as deleteFiltro, PATCH as patchFiltro } from '../[id]/route';
import {
  ctx,
  json,
  ligarFlags,
  requisicao,
} from '@/services/analiseAtivos/salvos/__tests__/apoioRotasSalvos';
import { _resetarParamsQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { mockAuthAsConsultant, mockAuthAsUser } from '@/test/mocks/auth';
import type { FiltroSalvoApi, FiltrosResposta } from '@/types/analiseAtivosSalvos';

const U = 'u-1';
const ESTADO = { janela: 5, criterios: ['luc'], naCarteira: false, setor: null };

const post = (b: unknown) => postFiltro(requisicao('POST', '/filtros', b));

beforeEach(() => {
  h.fake.limpar();
  _resetarParamsQuadro();
  h.auth.mockReset();
  h.auth.mockResolvedValue(mockAuthAsUser(U));
  ligarFlags();
});
afterEach(() => vi.unstubAllEnvs());

describe('/filtros', () => {
  it('flag desligada → 404 antes da sessão', async () => {
    ligarFlags(['ANALISE_ATIVOS_SALVOS_HABILITADO']);
    expect((await getFiltros(requisicao('GET', '/filtros?classe=acao'))).status).toBe(404);
    expect((await post({ nome: 'A', classe: 'acao', estado: ESTADO })).status).toBe(404);
    expect(h.auth).not.toHaveBeenCalled();
  });

  it('cria (201) e lista por classe, isolado por usuário', async () => {
    const r = await json(await post({ nome: 'Lucro', classe: 'acao', estado: ESTADO }));
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      nome: 'Lucro',
      classe: 'acao',
      estado: ESTADO,
      ajustado: false,
    });
    const lista = (await (
      await getFiltros(requisicao('GET', '/filtros?classe=acao'))
    ).json()) as FiltrosResposta;
    expect(lista.filtros.map((f) => f.nome)).toEqual(['Lucro']);
    expect(lista.limites.filtrosPorClasse).toBe(20);
    const fii = (await (
      await getFiltros(requisicao('GET', '/filtros?classe=fii'))
    ).json()) as FiltrosResposta;
    expect(fii.filtros).toEqual([]);
    h.auth.mockResolvedValue(mockAuthAsUser('outro'));
    const dele = (await (
      await getFiltros(requisicao('GET', '/filtros?classe=acao'))
    ).json()) as FiltrosResposta;
    expect(dele.filtros).toEqual([]);
  });

  it('400: sem classe, estado com modo/ordem, critério de outra classe; 409: nome repetido e 21º', async () => {
    expect((await getFiltros(requisicao('GET', '/filtros'))).status).toBe(400);
    expect(
      (await post({ nome: 'A', classe: 'acao', estado: { ...ESTADO, ordem: 'pl' } })).status,
    ).toBe(400);
    expect(
      (await post({ nome: 'A', classe: 'fii', estado: { ...ESTADO, criterios: ['luc'] } })).status,
    ).toBe(400);
    expect((await post({ nome: 'Lucro', classe: 'acao', estado: ESTADO })).status).toBe(201);
    expect((await post({ nome: 'LUCRO', classe: 'acao', estado: ESTADO })).status).toBe(409);
    // mesmo nome em outra classe pode
    expect(
      (await post({ nome: 'Lucro', classe: 'fii', estado: { ...ESTADO, criterios: [] } })).status,
    ).toBe(201);
    for (let i = 1; i < 20; i += 1) {
      expect((await post({ nome: `F${i}`, classe: 'acao', estado: ESTADO })).status).toBe(201);
    }
    const r = await post({ nome: 'F21', classe: 'acao', estado: ESTADO });
    expect(r.status).toBe(409);
  });

  it('critério que saiu da classe é retirado na leitura (ajustado=true)', async () => {
    h.fake.tabelas.analiseFiltroSalvo.push({
      id: '00000000-0000-4000-8000-0000000000f1',
      userId: U,
      nome: 'Antigo',
      nomeNormalizado: 'antigo',
      classe: 'acao',
      estado: { ...ESTADO, criterios: ['luc', 'vac'] },
      createdAt: new Date(),
      updatedAt: new Date(),
      ultimoUsoEm: null,
    });
    const r = (await (
      await getFiltros(requisicao('GET', '/filtros?classe=acao'))
    ).json()) as FiltrosResposta;
    expect(r.filtros[0]).toMatchObject({ ajustado: true, estado: { criterios: ['luc'] } });
  });

  it('PATCH (estado, usado, nome) e DELETE; outro usuário → 404', async () => {
    const f = (await (
      await post({ nome: 'A', classe: 'acao', estado: ESTADO })
    ).json()) as FiltroSalvoApi;
    const id = f.id;
    const patch = (b: unknown) =>
      patchFiltro(requisicao('PATCH', `/filtros/${id}`, b), ctx({ id }));
    const r = (await (
      await patch({ estado: { ...ESTADO, janela: 10 }, usado: true })
    ).json()) as FiltroSalvoApi;
    expect(r.estado.janela).toBe(10);
    expect(r.ultimoUsoEm).not.toBeNull();
    expect((await patch({})).status).toBe(400);
    expect((await patch({ usado: false })).status).toBe(400);
    h.auth.mockResolvedValue(mockAuthAsUser('outro'));
    expect((await patch({ nome: 'B' })).status).toBe(404);
    expect((await deleteFiltro(requisicao('DELETE', `/filtros/${id}`), ctx({ id }))).status).toBe(
      404,
    );
    h.auth.mockResolvedValue(mockAuthAsUser(U));
    expect((await deleteFiltro(requisicao('DELETE', `/filtros/${id}`), ctx({ id }))).status).toBe(
      200,
    );
    expect(h.fake.tabelas.analiseFiltroSalvo).toEqual([]);
  });

  it('consultor: GET vazio (podeSalvar=false); POST/PATCH/DELETE 403', async () => {
    const f = (await (
      await post({ nome: 'A', classe: 'acao', estado: ESTADO })
    ).json()) as FiltroSalvoApi;
    h.auth.mockResolvedValue(mockAuthAsConsultant('c-1', U));
    const g = (await (
      await getFiltros(requisicao('GET', '/filtros?classe=acao'))
    ).json()) as FiltrosResposta;
    expect(g).toMatchObject({ filtros: [], podeSalvar: false, motivoSemSalvar: 'consultor' });
    expect((await post({ nome: 'B', classe: 'acao', estado: ESTADO })).status).toBe(403);
    expect(
      (
        await patchFiltro(
          requisicao('PATCH', `/filtros/${f.id}`, { usado: true }),
          ctx({ id: f.id }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await deleteFiltro(requisicao('DELETE', `/filtros/${f.id}`), ctx({ id: f.id }))).status,
    ).toBe(403);
  });
});
