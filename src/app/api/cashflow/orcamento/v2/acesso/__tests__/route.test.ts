import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));

import { GET } from '../route';
import { limparCacheAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';

const req = () => new NextRequest('http://localhost/api/cashflow/orcamento/v2/acesso');

function usuario(beta: boolean, ativadoEm: Date | null = null) {
  return {
    featureBetas: beta ? [{ id: 'b1' }] : [],
    cashflowOrcamentoPrefs: { estruturaCriadaEm: ativadoEm },
  };
}

describe('GET /api/cashflow/orcamento/v2/acesso', () => {
  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    mockPrisma.user.findUnique.mockReset();
    mockRequireAuthWithActing.mockReset();
    mockLogSensitive.mockReset().mockResolvedValue(undefined);
    for (const id of ['u1', 'cons', 'cliente']) limparCacheAcessoOrcamentoV2(id);
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'u1', email: 'a@b', role: 'user' },
      targetUserId: 'u1',
      actingClient: null,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('flag desligada → 200 {desligada, ativado:false} (nunca 404), sem consultar o banco', async () => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: 'desligada', ativado: false });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('fora do beta → fora_do_beta', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario(false));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: 'fora_do_beta', ativado: false });
  });

  it('no beta e ativado → liberada + ativado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario(true, new Date('2026-10-27')));
    expect(await (await GET(req())).json()).toEqual({ estado: 'liberada', ativado: true });
  });

  it('consultor agindo pelo cliente: responde pelo cliente e registra o acesso', async () => {
    const auth = {
      payload: { id: 'cons', email: 'c@b', role: 'consultant' },
      targetUserId: 'cliente',
      actingClient: { id: 'cliente', name: 'Cliente', email: 'cli@b' },
    };
    mockRequireAuthWithActing.mockResolvedValue(auth);
    mockPrisma.user.findUnique.mockResolvedValue(usuario(true, null));
    expect(await (await GET(req())).json()).toEqual({ estado: 'liberada', ativado: false });
    expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'cliente' });
    expect(mockLogSensitive).toHaveBeenCalledWith(
      expect.anything(),
      auth.payload,
      'cliente',
      auth.actingClient,
      '/api/cashflow/orcamento/v2/acesso',
      'GET',
    );
  });
});
