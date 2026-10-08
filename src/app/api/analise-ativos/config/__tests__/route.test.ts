import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.hoisted(() => vi.fn());
const mockEstado = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireSession: mockRequireSession }));
vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/analiseAtivos/acesso/acessoAnalise')>();
  return { ...original, estadoAcessoAnalise: mockEstado };
});
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

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
      reporteHabilitado: false,
      recursos: { raioX: false, cenarios: false, comparador: false },
    });
    expect(mockEstado).toHaveBeenCalledWith('u1');
  });

  it('reporteHabilitado: só com a flag E a área liberada para o usuário', async () => {
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'true');
    mockEstado.mockResolvedValue('liberada');
    expect((await (await GET(req())).json()).reporteHabilitado).toBe(true);
    mockEstado.mockResolvedValue('fora_do_beta');
    expect((await (await GET(req())).json()).reporteHabilitado).toBe(false);
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'false');
    mockEstado.mockResolvedValue('liberada');
    expect((await (await GET(req())).json()).reporteHabilitado).toBe(false);
  });

  it('recursos do bloco D: cada flag só vale com a área liberada para o usuário', async () => {
    vi.stubEnv('ANALISE_ATIVOS_RAIOX_HABILITADO', 'true');
    vi.stubEnv('ANALISE_ATIVOS_COMPARADOR_HABILITADO', 'true');
    mockEstado.mockResolvedValue('liberada');
    expect((await (await GET(req())).json()).recursos).toEqual({
      raioX: true,
      cenarios: false,
      comparador: true,
    });
    vi.stubEnv('ANALISE_ATIVOS_CENARIOS_HABILITADO', 'true');
    mockEstado.mockResolvedValue('fora_do_beta');
    expect((await (await GET(req())).json()).recursos).toEqual({
      raioX: false,
      cenarios: false,
      comparador: false,
    });
    // a rota passa o estado já calculado: uma consulta só
    expect(mockEstado).toHaveBeenCalledTimes(2);
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
