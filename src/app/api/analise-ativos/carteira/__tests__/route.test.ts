import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  overlay: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/services/analiseAtivos/acesso/acessoAnalise', () => ({
  exigirAcessoAnalise: mocks.exigir,
}));
vi.mock('@/services/analiseAtivos/leitura/overlayCarteira', () => ({
  overlayCarteira: mocks.overlay,
}));
vi.mock('@/services/impersonationLogger', () => ({ logSensitiveEndpointAccess: mocks.log }));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/analise-ativos/carteira');
const OVERLAY = {
  posicoes: { MXRF11: { portfolioId: 'p1', quantidade: 350, categoria: 'fiis' } },
  planejados: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overlay.mockResolvedValue(OVERLAY);
  mocks.log.mockResolvedValue(undefined);
});

describe('GET /api/analise-ativos/carteira', () => {
  it('usuário com acesso: overlay do próprio usuário, no-store', async () => {
    mocks.exigir.mockResolvedValue({
      payload: { id: 'u1', role: 'user' },
      targetUserId: 'u1',
      actingClient: null,
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual(OVERLAY);
    expect(mocks.overlay).toHaveBeenCalledWith('u1');
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it('consultor agindo: overlay do CLIENTE e acesso registrado', async () => {
    mocks.exigir.mockResolvedValue({
      payload: { id: 'c1', role: 'consultant' },
      targetUserId: 'cli1',
      actingClient: { id: 'cli1', name: 'Cliente', email: 'c@x' },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mocks.overlay).toHaveBeenCalledWith('cli1');
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.log.mock.calls[0][4]).toBe('/api/analise-ativos/carteira');
  });

  it('sem acesso (flag/beta): 404 sem consultar a carteira', async () => {
    mocks.exigir.mockRejectedValue(new ApiError(404, 'Recurso não disponível'));
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mocks.overlay).not.toHaveBeenCalled();
  });

  it('sem sessão: 401', async () => {
    mocks.exigir.mockRejectedValue(new Error('Não autorizado'));
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
