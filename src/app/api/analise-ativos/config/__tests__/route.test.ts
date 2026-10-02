import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.hoisted(() => vi.fn());
const mockEstado = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireSession: mockRequireSession }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  estadoAcessoAnalise: mockEstado,
}));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/analise-ativos/config');

describe('GET /api/analise-ativos/config', () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockEstado.mockReset();
    mockRequireSession.mockResolvedValue({ id: 'u1', email: 'a@b', role: 'user' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('liberada: shape completo e no-store', async () => {
    mockEstado.mockResolvedValue('liberada');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      habilitada: true,
      estado: 'liberada',
      acesso: 'beta',
      novoAte: '2026-12-31',
    });
    expect(mockEstado).toHaveBeenCalledWith('u1');
  });

  it('desligada: 200 com habilitada=false (nunca 404)', async () => {
    mockEstado.mockResolvedValue('desligada');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).habilitada).toBe(false);
  });

  it('fora do beta: habilitada=false com estado próprio; acesso e novoAte do ambiente', async () => {
    vi.stubEnv('ANALISE_ATIVOS_ACESSO', 'todos');
    vi.stubEnv('ANALISE_ATIVOS_NOVO_ATE', '2027-01-31');
    mockEstado.mockResolvedValue('fora_do_beta');
    const corpo = await (await GET(req())).json();
    expect(corpo).toMatchObject({
      habilitada: false,
      estado: 'fora_do_beta',
      acesso: 'todos',
      novoAte: '2027-01-31',
    });
  });

  it('sem sessão → 401', async () => {
    mockRequireSession.mockRejectedValue(new Error('Não autorizado'));
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
