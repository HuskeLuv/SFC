/**
 * Assinaturas F2: a Análise de Ativos inteira é Pro, conferida em exigirAcessoAnalise DEPOIS das
 * flags e do beta (404 continua 404; sem plano = 403 plano_insuficiente).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockPlano = vi.hoisted(() => ({ planoDoUsuario: vi.fn(), planoParaRequisicao: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/planos/resolverPlano', () => mockPlano);

import {
  exigirAcessoAnalise,
  exigirRecursoAnalise,
  limparCacheAcessoAnalise,
} from '../acessoAnalise';
import { ApiError } from '@/utils/apiErrorHandler';

const req = () => new NextRequest('http://localhost/api/analise-ativos/quadro?classe=acao');

const PROPRIO = {
  payload: { id: 'u1', email: 'u@x', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
};
const CONSULTOR = {
  payload: { id: 'cons', email: 'c@x', role: 'consultant' },
  targetUserId: 'cliente',
  actingClient: { id: 'cliente', name: 'Cliente', email: 'cl@x' },
};

function ligarAssinaturas() {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
}

async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('não lançou');
}

describe('exigirAcessoAnalise × plano', () => {
  beforeEach(() => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    mockPrisma.user.findUnique.mockReset();
    mockRequireAuthWithActing.mockReset().mockResolvedValue(PROPRIO);
    mockPlano.planoDoUsuario.mockReset();
    mockPlano.planoParaRequisicao.mockReset();
    for (const id of ['u1', 'cons']) limparCacheAcessoAnalise(id);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('pede requireAuthWithActing sem o gate central (o plano vem depois do beta)', async () => {
    await exigirAcessoAnalise(req());
    expect(mockRequireAuthWithActing).toHaveBeenCalledWith(expect.any(NextRequest), {
      gatePlano: false,
    });
  });

  it('chave desligada: não consulta plano nenhum', async () => {
    await expect(exigirAcessoAnalise(req())).resolves.toBe(PROPRIO);
    expect(mockPlano.planoParaRequisicao).not.toHaveBeenCalled();
    expect(mockPlano.planoDoUsuario).not.toHaveBeenCalled();
  });

  it('chave ligada + flag da área desligada → 404 (não 403)', async () => {
    ligarAssinaturas();
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
    const e = await erroDe(exigirAcessoAnalise(req()));
    expect(e.statusCode).toBe(404);
    expect(mockPlano.planoParaRequisicao).not.toHaveBeenCalled();
  });

  it('chave ligada + fora do beta → 404 (não 403)', async () => {
    ligarAssinaturas();
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'user', featureBetas: [] });
    const e = await erroDe(exigirAcessoAnalise(req()));
    expect(e.statusCode).toBe(404);
    expect(mockPlano.planoParaRequisicao).not.toHaveBeenCalled();
  });

  it('chave ligada + Basic → 403 plano_insuficiente need pro', async () => {
    ligarAssinaturas();
    mockPlano.planoParaRequisicao.mockResolvedValue('basic');
    const e = await erroDe(exigirAcessoAnalise(req()));
    expect(e.statusCode).toBe(403);
    expect(e.extra).toEqual({ codigo: 'plano_insuficiente', need: 'pro', plano: 'basic' });
  });

  it('chave ligada + Pro ou Advanced → passa', async () => {
    ligarAssinaturas();
    mockPlano.planoParaRequisicao.mockResolvedValueOnce('pro').mockResolvedValueOnce('adv');
    await expect(exigirAcessoAnalise(req())).resolves.toBe(PROPRIO);
    await expect(exigirAcessoAnalise(req())).resolves.toBe(PROPRIO);
  });

  it('consultor: o plano é o do targetUserId (cliente) com a regra do max', async () => {
    ligarAssinaturas();
    mockRequireAuthWithActing.mockResolvedValue(CONSULTOR);
    mockPlano.planoParaRequisicao.mockResolvedValue('adv');
    await expect(exigirAcessoAnalise(req())).resolves.toBe(CONSULTOR);
    expect(mockPlano.planoParaRequisicao).toHaveBeenCalledWith(CONSULTOR);
  });

  it('exigirRecursoAnalise herda o corte (recurso ligado + Basic → 403)', async () => {
    ligarAssinaturas();
    vi.stubEnv('ANALISE_ATIVOS_COMPARADOR_HABILITADO', 'true');
    mockPlano.planoParaRequisicao.mockResolvedValue('basic');
    const e = await erroDe(exigirRecursoAnalise(req(), 'comparador'));
    expect(e.statusCode).toBe(403);
  });
});
