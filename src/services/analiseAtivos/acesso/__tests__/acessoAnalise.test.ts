import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));

import {
  RECURSO_BETA,
  TTL_ACESSO_MS,
  estadoAcessoAnalise,
  exigirAcessoAnalise,
  limparCacheAcessoAnalise,
  podeAcessarAnaliseAtivos,
} from '../acessoAnalise';
import { ApiError } from '@/utils/apiErrorHandler';

function usuario(role: string, beta: boolean) {
  return { role, featureBetas: beta ? [{ id: 'b1' }] : [] };
}

const req = () => new NextRequest('http://localhost/api/analise-ativos/quadro?classe=acao');

describe('acessoAnalise', () => {
  beforeEach(() => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'beta');
    mockPrisma.user.findUnique.mockReset();
    mockRequireAuthWithActing.mockReset();
    for (const id of ['u1', 'u2', 'admin', 'cons', 'cliente']) limparCacheAcessoAnalise(id);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('flag desligada → desligada, sem consultar o banco', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
    expect(await estadoAcessoAnalise('u1')).toBe('desligada');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("acesso 'todos' → liberada sem consultar o banco", async () => {
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
    expect(await estadoAcessoAnalise('u1')).toBe('liberada');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('admin entra sem estar no beta', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario('admin', false));
    expect(await estadoAcessoAnalise('admin')).toBe('liberada');
  });

  it('usuário no beta entra; consulta role e beta numa query só', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario('user', true));
    expect(await podeAcessarAnaliseAtivos('u1')).toBe(true);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.user.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'u1' });
    expect(arg.select.featureBetas.where).toEqual({ recurso: RECURSO_BETA });
  });

  it('usuário fora do beta → fora_do_beta; inexistente também', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario('user', false));
    expect(await estadoAcessoAnalise('u1')).toBe('fora_do_beta');
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await estadoAcessoAnalise('u2')).toBe('fora_do_beta');
  });

  it('cache de 60 s por userId', async () => {
    vi.useFakeTimers();
    mockPrisma.user.findUnique.mockResolvedValue(usuario('user', true));
    await estadoAcessoAnalise('u1');
    await estadoAcessoAnalise('u1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TTL_ACESSO_MS + 1);
    mockPrisma.user.findUnique.mockResolvedValue(usuario('user', false));
    expect(await estadoAcessoAnalise('u1')).toBe('fora_do_beta');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  describe('exigirAcessoAnalise', () => {
    it('flag desligada → 404 antes da sessão', async () => {
      vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
      await expect(exigirAcessoAnalise(req())).rejects.toMatchObject({ statusCode: 404 });
      expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
    });

    it('sem sessão → propaga o erro de auth (401 no withErrorHandler)', async () => {
      mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
      await expect(exigirAcessoAnalise(req())).rejects.toThrow('Não autorizado');
    });

    it('fora do beta → ApiError 404', async () => {
      mockRequireAuthWithActing.mockResolvedValue({
        payload: { id: 'u1', email: 'a@b', role: 'user' },
        targetUserId: 'u1',
        actingClient: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue(usuario('user', false));
      const erro = await exigirAcessoAnalise(req()).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ApiError);
      expect((erro as ApiError).statusCode).toBe(404);
    });

    it('consultor: decide pelo payload.id (logado), devolve targetUserId do cliente', async () => {
      mockRequireAuthWithActing.mockResolvedValue({
        payload: { id: 'cons', email: 'c@b', role: 'consultant' },
        targetUserId: 'cliente',
        actingClient: { id: 'cliente' },
      });
      mockPrisma.user.findUnique.mockResolvedValue(usuario('consultant', true));
      const auth = await exigirAcessoAnalise(req());
      expect(auth.targetUserId).toBe('cliente');
      expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'cons' });
    });
  });
});
