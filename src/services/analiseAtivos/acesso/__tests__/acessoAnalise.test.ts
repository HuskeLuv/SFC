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
  MENSAGEM_SEM_ACESSO,
  estadoAcessoAnalise,
  exigirAcessoAnalise,
  exigirRecursoAnalise,
  flagsRecursosBlocoD,
  limparCacheAcessoAnalise,
  podeAcessarAnaliseAtivos,
  recursosLiberados,
  type RecursoBlocoD,
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

  describe('bloco D: recursos com flag própria', () => {
    const FLAGS: Record<RecursoBlocoD, string> = {
      raioX: 'ANALISE_ATIVOS_RAIOX_HABILITADO',
      cenarios: 'ANALISE_ATIVOS_CENARIOS_HABILITADO',
      comparador: 'ANALISE_ATIVOS_COMPARADOR_HABILITADO',
    };
    const RECURSOS = Object.keys(FLAGS) as RecursoBlocoD[];
    const authUsuario = (id: string, role = 'user') => ({
      payload: { id, email: 'a@b', role },
      targetUserId: id,
      actingClient: null,
    });

    it('flags desligadas por padrão; só "true" liga', () => {
      expect(flagsRecursosBlocoD()).toEqual({ raioX: false, cenarios: false, comparador: false });
      vi.stubEnv('ANALISE_ATIVOS_RAIOX_HABILITADO', '1');
      vi.stubEnv('ANALISE_ATIVOS_CENARIOS_HABILITADO', 'TRUE');
      vi.stubEnv('ANALISE_ATIVOS_COMPARADOR_HABILITADO', 'true');
      expect(flagsRecursosBlocoD()).toEqual({ raioX: false, cenarios: false, comparador: true });
    });

    it('3 flags desligadas: tudo false sem consultar o banco', async () => {
      expect(await recursosLiberados('u1')).toEqual({
        raioX: false,
        cenarios: false,
        comparador: false,
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    // matriz flag × área × perfil (admin / beta / fora do beta)
    const PERFIS: Array<[string, ReturnType<typeof usuario>, boolean]> = [
      ['admin', usuario('admin', false), true],
      ['beta', usuario('user', true), true],
      ['fora do beta', usuario('user', false), false],
    ];
    for (const recurso of RECURSOS) {
      for (const [nome, perfil, entra] of PERFIS) {
        it(`${recurso} × ${nome}: flag ligada + área ligada → ${entra}`, async () => {
          vi.stubEnv(FLAGS[recurso], 'true');
          mockPrisma.user.findUnique.mockResolvedValue(perfil);
          const r = await recursosLiberados('u1');
          expect(r[recurso]).toBe(entra);
          for (const outro of RECURSOS.filter((x) => x !== recurso)) expect(r[outro]).toBe(false);
        });
      }
      it(`${recurso}: área desligada → false mesmo com a flag`, async () => {
        vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
        vi.stubEnv(FLAGS[recurso], 'true');
        expect((await recursosLiberados('u1'))[recurso]).toBe(false);
      });
    }

    it('usa o estado recebido sem consultar de novo', async () => {
      vi.stubEnv('ANALISE_ATIVOS_RAIOX_HABILITADO', 'true');
      expect((await recursosLiberados('u1', 'liberada')).raioX).toBe(true);
      expect((await recursosLiberados('u1', 'fora_do_beta')).raioX).toBe(false);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    describe('exigirRecursoAnalise', () => {
      it('flag do recurso desligada → 404 antes da sessão (área ligada)', async () => {
        for (const recurso of RECURSOS) {
          const erro = await exigirRecursoAnalise(req(), recurso).catch((e: unknown) => e);
          expect(erro).toBeInstanceOf(ApiError);
          expect((erro as ApiError).statusCode).toBe(404);
          expect((erro as ApiError).message).toBe(MENSAGEM_SEM_ACESSO);
        }
        expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
      });

      it('área desligada → 404 mesmo com a flag do recurso', async () => {
        vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'false');
        vi.stubEnv('ANALISE_ATIVOS_RAIOX_HABILITADO', 'true');
        await expect(exigirRecursoAnalise(req(), 'raioX')).rejects.toMatchObject({
          statusCode: 404,
        });
        expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
      });

      it('flag ligada + sem sessão → propaga o erro de auth', async () => {
        vi.stubEnv('ANALISE_ATIVOS_COMPARADOR_HABILITADO', 'true');
        mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
        await expect(exigirRecursoAnalise(req(), 'comparador')).rejects.toThrow('Não autorizado');
      });

      it('flag ligada + fora do beta → 404', async () => {
        vi.stubEnv('ANALISE_ATIVOS_CENARIOS_HABILITADO', 'true');
        mockRequireAuthWithActing.mockResolvedValue(authUsuario('u1'));
        mockPrisma.user.findUnique.mockResolvedValue(usuario('user', false));
        await expect(exigirRecursoAnalise(req(), 'cenarios')).rejects.toMatchObject({
          statusCode: 404,
        });
      });

      it('flag ligada + liberada → devolve o mesmo AuthWithActingResult (consultor incluso)', async () => {
        vi.stubEnv('ANALISE_ATIVOS_CENARIOS_HABILITADO', 'true');
        const auth = {
          payload: { id: 'cons', email: 'c@b', role: 'consultant' },
          targetUserId: 'cliente',
          actingClient: { id: 'cliente' },
        };
        mockRequireAuthWithActing.mockResolvedValue(auth);
        mockPrisma.user.findUnique.mockResolvedValue(usuario('consultant', true));
        expect(await exigirRecursoAnalise(req(), 'cenarios')).toBe(auth);
      });
    });
  });
});
