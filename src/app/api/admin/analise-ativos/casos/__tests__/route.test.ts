import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listarCasos: vi.fn(),
  detalharCaso: vi.fn(),
  aplicarAcaoCaso: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: {}, prisma: {} }));
vi.mock('@/utils/auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/services/analiseAtivos/curadoria/filaCuradoria', async (orig) => ({
  ...(await orig<typeof import('@/services/analiseAtivos/curadoria/filaCuradoria')>()),
  listarCasos: mocks.listarCasos,
  detalharCaso: mocks.detalharCaso,
}));
vi.mock('@/services/analiseAtivos/curadoria/acoesCuradoria', async (orig) => ({
  ...(await orig<typeof import('@/services/analiseAtivos/curadoria/acoesCuradoria')>()),
  aplicarAcaoCaso: mocks.aplicarAcaoCaso,
}));

import { GET as GET_LISTA } from '../route';
import { GET as GET_CASO, PATCH } from '../[id]/route';
import { ConflitoCaso } from '@/services/analiseAtivos/curadoria/acoesCuradoria';

const ID = '7d3f6a52-1b2c-4d5e-8f90-123456789abc';
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const lista = (qs = '') =>
  new NextRequest(`http://localhost/api/admin/analise-ativos/casos${qs}`, { method: 'GET' });
const caso = (id = ID) =>
  new NextRequest(`http://localhost/api/admin/analise-ativos/casos/${id}`, { method: 'GET' });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/admin/analise-ativos/casos/${ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

const negar = () =>
  mocks.requireAdmin.mockImplementation(() => {
    throw new ApiError(403, 'Acesso negado');
  });

const DETALHE = { caso: { id: ID }, reportes: [], eventos: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: 'adm1', role: 'admin' });
  mocks.listarCasos.mockResolvedValue({ itens: [], contagens: {}, proximoCursor: null });
  mocks.detalharCaso.mockResolvedValue(DETALHE);
  mocks.aplicarAcaoCaso.mockResolvedValue({ notificados: 0 });
});

describe('403 para quem não é admin em /api/admin/analise-ativos/*', () => {
  it('lista, detalhe e PATCH', async () => {
    negar();
    expect((await GET_LISTA(lista())).status).toBe(403);
    expect((await GET_CASO(caso(), ctx())).status).toBe(403);
    expect((await PATCH(patch({ acao: 'assumir', atualizadoEmEsperado: 'x' }), ctx())).status).toBe(
      403,
    );
    expect(mocks.listarCasos).not.toHaveBeenCalled();
    expect(mocks.detalharCaso).not.toHaveBeenCalled();
    expect(mocks.aplicarAcaoCaso).not.toHaveBeenCalled();
  });
});

describe('GET lista', () => {
  it('passa os filtros validados e o admin; no-store', async () => {
    const res = await GET_LISTA(lista('?fila=vencidos&classe=fii&q=hglg11&limite=20'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.listarCasos).toHaveBeenCalledWith(
      {},
      { fila: 'vencidos', classe: 'fii', q: 'hglg11', limite: 20 },
      { adminId: 'adm1' },
    );
  });

  it('400 para filtro inválido ou chave desconhecida', async () => {
    expect((await GET_LISTA(lista('?status=fechado'))).status).toBe(400);
    expect((await GET_LISTA(lista('?q=<script>'))).status).toBe(400);
    expect((await GET_LISTA(lista('?limite=500'))).status).toBe(400);
    expect((await GET_LISTA(lista('?xpto=1'))).status).toBe(400);
    expect(mocks.listarCasos).not.toHaveBeenCalled();
  });
});

describe('GET detalhe', () => {
  it('404 para id que não é uuid ou caso inexistente', async () => {
    expect((await GET_CASO(caso('abc'), ctx('abc'))).status).toBe(404);
    mocks.detalharCaso.mockResolvedValueOnce(null);
    expect((await GET_CASO(caso(), ctx())).status).toBe(404);
  });

  it('200 com o detalhe', async () => {
    const res = await GET_CASO(caso(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DETALHE);
  });
});

describe('PATCH', () => {
  const decidir = {
    acao: 'decidir',
    status: 'corrigido',
    resolucao: 'corrigido_fonte',
    efeitoTela: 'sem_efeito',
    respostaPublica: 'Corrigido na fonte.',
    atualizadoEmEsperado: '2026-10-02T13:00:00.000Z',
  };

  it('400 de zod: ação desconhecida, status inválido, sem atualizadoEmEsperado', async () => {
    expect((await PATCH(patch({ acao: 'apagar', atualizadoEmEsperado: 'x' }), ctx())).status).toBe(
      400,
    );
    expect((await PATCH(patch({ ...decidir, status: 'fechado' }), ctx())).status).toBe(400);
    const { atualizadoEmEsperado: _x, ...sem } = decidir;
    expect((await PATCH(patch(sem), ctx())).status).toBe(400);
    expect(mocks.aplicarAcaoCaso).not.toHaveBeenCalled();
  });

  it('decisão 16: conferenciaManual no corpo é chave desconhecida (400)', async () => {
    const res = await PATCH(patch({ ...decidir, conferenciaManual: true }), ctx());
    expect(res.status).toBe(400);
    expect(mocks.aplicarAcaoCaso).not.toHaveBeenCalled();
  });

  it('200 devolve o detalhe + notificados', async () => {
    mocks.aplicarAcaoCaso.mockResolvedValueOnce({ notificados: 2 });
    const res = await PATCH(patch(decidir), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...DETALHE, notificados: 2 });
    expect(mocks.aplicarAcaoCaso).toHaveBeenCalledWith(
      {},
      { casoId: ID, adminId: 'adm1', corpo: decidir },
    );
  });

  it('409 com quem alterou e quando', async () => {
    const corpo = {
      error: 'O caso foi alterado por outra pessoa.',
      atualizadoEm: '2026-10-02T13:05:00.000Z',
      atualizadoPor: { id: 'adm2', nome: 'Ana' },
    };
    mocks.aplicarAcaoCaso.mockRejectedValueOnce(new ConflitoCaso(corpo));
    const res = await PATCH(patch(decidir), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(corpo);
  });

  it('400 de compliance chega com details.termos', async () => {
    mocks.aplicarAcaoCaso.mockRejectedValueOnce(
      new ApiError(400, 'A resposta tem um termo que não pode ser usado: barato.', {
        termos: ['barato'],
      }),
    );
    const res = await PATCH(patch(decidir), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).details).toEqual({ termos: ['barato'] });
  });
});
