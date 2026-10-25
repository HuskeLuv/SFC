import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());
const mockLogSensitive = vi.hoisted(() => vi.fn());
const mockCarregar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mockLogSensitive,
}));
vi.mock('@/services/cashflow/orcamentoV2/carregarOrcamento', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/cashflow/orcamentoV2/carregarOrcamento')>()),
  carregarOrcamentoV2: mockCarregar,
}));

import { GET } from '../route';
import { limparCacheAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';

const req = (qs = '') => new NextRequest(`http://localhost/api/cashflow/orcamento/v2${qs}`);

function usuario(beta: boolean, ativadoEm: Date | null = new Date('2026-10-27')) {
  return {
    featureBetas: beta ? [{ id: 'b1' }] : [],
    cashflowOrcamentoPrefs: { estruturaCriadaEm: ativadoEm },
  };
}

const CORPO = { versao: 2, categorias: [] };

describe('GET /api/cashflow/orcamento/v2', () => {
  beforeEach(() => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'true');
    vi.stubEnv('ORCAMENTO_V2_ACESSO', 'beta');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T02:00:00.000Z')); // 23/10 em São Paulo
    mockPrisma.user.findUnique.mockReset().mockResolvedValue(usuario(true));
    mockRequireAuthWithActing.mockReset().mockResolvedValue({
      payload: { id: 'u1', email: 'a@b', role: 'user' },
      targetUserId: 'u1',
      actingClient: null,
    });
    mockLogSensitive.mockReset().mockResolvedValue(undefined);
    mockCarregar.mockReset().mockResolvedValue(CORPO);
    for (const id of ['u1', 'cliente']) limparCacheAcessoOrcamentoV2(id);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('flag desligada → 404 sem olhar a sessão', async () => {
    vi.stubEnv('ORCAMENTO_V2_HABILITADO', 'false');
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Recurso não disponível' });
    expect(mockRequireAuthWithActing).not.toHaveBeenCalled();
    expect(mockCarregar).not.toHaveBeenCalled();
  });

  it('sem sessão → 401', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockCarregar).not.toHaveBeenCalled();
  });

  it('fora do beta → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario(false));
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mockCarregar).not.toHaveBeenCalled();
  });

  it('padrões: mês corrente em São Paulo, visão mês, fonte das prefs', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CORPO);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockCarregar).toHaveBeenCalledWith(
      'u1',
      { ano: 2026, mes0: 9, visao: 'mes', fonte: undefined },
      new Date('2026-10-24T02:00:00.000Z'),
    );
    expect(mockLogSensitive).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'u1' }),
      'u1',
      null,
      '/api/cashflow/orcamento/v2',
      'GET',
    );
  });

  it('params explícitos: mês 1–12 vira 0–11', async () => {
    const res = await GET(req('?ano=2025&mes=1&visao=ano&fonte=consolidado'));
    expect(res.status).toBe(200);
    expect(mockCarregar.mock.calls[0][1]).toEqual({
      ano: 2025,
      mes0: 0,
      visao: 'ano',
      fonte: 'consolidado',
    });
  });

  it.each([
    ['?mes=13'],
    ['?mes=0'],
    ['?mes=abc'],
    ['?mes=1.5'],
    ['?ano=1800'],
    ['?ano='],
    ['?visao=semana'],
    ['?fonte=banco'],
  ])('params inválidos %s → 400', async (qs) => {
    const res = await GET(req(qs));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Parâmetros inválidos' });
    expect(mockCarregar).not.toHaveBeenCalled();
  });

  it('consultor agindo pelo cliente: gate e dados pelo cliente (targetUserId)', async () => {
    const auth = {
      payload: { id: 'cons', email: 'c@b', role: 'consultant' },
      targetUserId: 'cliente',
      actingClient: { id: 'cliente', name: 'Cliente', email: 'cli@b' },
    };
    mockRequireAuthWithActing.mockResolvedValue(auth);
    const res = await GET(req('?ano=2026&mes=10'));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'cliente' });
    expect(mockCarregar.mock.calls[0][0]).toBe('cliente');
    expect(mockLogSensitive).toHaveBeenCalledWith(
      expect.anything(),
      auth.payload,
      'cliente',
      auth.actingClient,
      '/api/cashflow/orcamento/v2',
      'GET',
    );
  });
});
