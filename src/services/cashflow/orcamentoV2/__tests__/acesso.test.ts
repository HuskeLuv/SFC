import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));

import {
  MENSAGEM_SEM_ACESSO,
  RECURSO_ORCAMENTO_V2,
  TTL_ACESSO_MS,
  estadoAcessoOrcamentoV2,
  exigirAcessoOrcamentoV2,
  limparCacheAcessoOrcamentoV2,
} from '../acesso';
import { ApiError } from '@/utils/apiErrorHandler';

function usuario(beta: boolean, ativadoEm: Date | null = null, comPrefs = true) {
  return {
    featureBetas: beta ? [{ id: 'b1' }] : [],
    cashflowOrcamentoPrefs: comPrefs ? { estruturaCriadaEm: ativadoEm } : null,
  };
}

const auth = (id: string, targetUserId = id, role = 'user') => ({
  payload: { id, email: 'a@b', role },
  targetUserId,
  actingClient: targetUserId === id ? null : { id: targetUserId },
});

const req = () => new NextRequest('http://localhost/api/cashflow/orcamento/v2');

describe('acesso do Orçamento v2', () => {
  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    mockPrisma.user.findUnique.mockReset();
    mockRequireAuthWithActing.mockReset();
    for (const id of ['u1', 'u2', 'admin', 'cons', 'cliente']) limparCacheAcessoOrcamentoV2(id);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('flag desligada → desligada e ativado=false, sem consultar o banco', async () => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'desligada', ativado: false });
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', '');
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'desligada', ativado: false });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('beta: na lista → liberada; consulta beta e ativação numa query só', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario(true));
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'liberada', ativado: false });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.user.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'u1' });
    expect(arg.select.featureBetas.where).toEqual({ recurso: RECURSO_ORCAMENTO_V2 });
    expect(arg.select.cashflowOrcamentoPrefs).toEqual({ select: { estruturaCriadaEm: true } });
  });

  it('fora da lista → fora_do_beta; usuário inexistente também', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario(false));
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'fora_do_beta', ativado: false });
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await estadoAcessoOrcamentoV2('u2')).toEqual({ estado: 'fora_do_beta', ativado: false });
  });

  it('admin NÃO entra automaticamente (só pela lista)', async () => {
    // a query nem pede role: o perfil do admin fora da lista é igual ao de qualquer usuário
    mockPrisma.user.findUnique.mockResolvedValue(usuario(false));
    expect((await estadoAcessoOrcamentoV2('admin')).estado).toBe('fora_do_beta');
    expect(mockPrisma.user.findUnique.mock.calls[0][0].select.role).toBeUndefined();
  });

  it("acesso 'todos' → liberada mesmo fora da lista (ainda lê a ativação)", async () => {
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'todos');
    mockPrisma.user.findUnique.mockResolvedValue(usuario(false, new Date('2026-10-27')));
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'liberada', ativado: true });
  });

  it('ativado = prefs.estruturaCriadaEm preenchido; sem prefs ou null → false', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario(true, new Date('2026-10-27')));
    expect((await estadoAcessoOrcamentoV2('u1')).ativado).toBe(true);
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario(true, null));
    expect((await estadoAcessoOrcamentoV2('u2')).ativado).toBe(false);
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario(true, null, false));
    expect((await estadoAcessoOrcamentoV2('cliente')).ativado).toBe(false);
  });

  it('ativado fora do beta continua fora_do_beta (a tela exige liberada && ativado)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario(false, new Date('2026-10-27')));
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'fora_do_beta', ativado: true });
  });

  it('cache de 60 s por userId; limparCache força nova leitura', async () => {
    vi.useFakeTimers();
    mockPrisma.user.findUnique.mockResolvedValue(usuario(true));
    await estadoAcessoOrcamentoV2('u1');
    await estadoAcessoOrcamentoV2('u1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TTL_ACESSO_MS + 1);
    mockPrisma.user.findUnique.mockResolvedValue(usuario(false));
    expect((await estadoAcessoOrcamentoV2('u1')).estado).toBe('fora_do_beta');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);

    mockPrisma.user.findUnique.mockResolvedValue(usuario(true, new Date('2026-10-27')));
    expect((await estadoAcessoOrcamentoV2('u1')).ativado).toBe(false); // ainda em cache
    limparCacheAcessoOrcamentoV2('u1');
    expect(await estadoAcessoOrcamentoV2('u1')).toEqual({ estado: 'liberada', ativado: true });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(3);
  });

  describe('exigirAcessoOrcamentoV2', () => {
    it('flag desligada → 404 antes da sessão', async () => {
      vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
      await expect(exigirAcessoOrcamentoV2(req())).rejects.toMatchObject({
        statusCode: 404,
        message: MENSAGEM_SEM_ACESSO,
      });
      expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('sem sessão → propaga o erro de auth (401 no withErrorHandler)', async () => {
      mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
      await expect(exigirAcessoOrcamentoV2(req())).rejects.toThrow('Não autorizado');
    });

    it('fora do beta → ApiError 404', async () => {
      mockRequireAuthWithActing.mockResolvedValue(auth('u1'));
      mockPrisma.user.findUnique.mockResolvedValue(usuario(false));
      const erro = await exigirAcessoOrcamentoV2(req()).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ApiError);
      expect((erro as ApiError).statusCode).toBe(404);
      expect((erro as ApiError).message).toBe(MENSAGEM_SEM_ACESSO);
    });

    it('liberada sem ativação → passa (o POST /ativar usa este gate)', async () => {
      const a = auth('u1');
      mockRequireAuthWithActing.mockResolvedValue(a);
      mockPrisma.user.findUnique.mockResolvedValue(usuario(true, null));
      expect(await exigirAcessoOrcamentoV2(req())).toBe(a);
    });

    it('consultor agindo pelo cliente no beta: decide pelo targetUserId (cliente)', async () => {
      const a = auth('cons', 'cliente', 'consultant');
      mockRequireAuthWithActing.mockResolvedValue(a);
      mockPrisma.user.findUnique.mockResolvedValue(usuario(true, new Date('2026-10-27')));
      expect(await exigirAcessoOrcamentoV2(req())).toBe(a);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'cliente' });
    });

    it('consultor no beta agindo por cliente fora do beta → 404', async () => {
      mockRequireAuthWithActing.mockResolvedValue(auth('cons', 'cliente', 'consultant'));
      mockPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        usuario(where.id === 'cons'),
      );
      await expect(exigirAcessoOrcamentoV2(req())).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.user.findUnique.mock.calls.map((c) => c[0].where.id)).toEqual(['cliente']);
    });
  });
});
