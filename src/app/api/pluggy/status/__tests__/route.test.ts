import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockFetchConnectors = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/pluggy', () => ({
  getPluggyClient: () => ({ fetchConnectors: mockFetchConnectors }),
}));

import { GET } from '../route';

const request = () => new NextRequest('http://localhost/api/pluggy/status', { method: 'GET' });

describe('GET /api/pluggy/status', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockReturnValue({ id: 'admin-1', role: 'admin' });
    delete process.env.PLUGGY_HABILITADO;
    delete process.env.PLUGGY_CLIENT_ID;
    delete process.env.PLUGGY_CLIENT_SECRET;
    delete process.env.PLUGGY_WEBHOOK_SECRET;
    delete process.env.PLUGGY_INCLUI_SANDBOX;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('403 para quem não é admin', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw new ApiError(403, 'Acesso negado');
    });
    expect((await GET(request())).status).toBe(403);
    expect(mockFetchConnectors).not.toHaveBeenCalled();
  });

  it('desligado: informa sem chamar o Pluggy', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      habilitado: false,
      credenciaisOk: false,
      webhookSecretConfigurado: false,
    });
    expect(mockFetchConnectors).not.toHaveBeenCalled();
  });

  it('ligado: valida credenciais listando conectores (com sandbox quando pedido)', async () => {
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    process.env.PLUGGY_WEBHOOK_SECRET = 'whs';
    process.env.PLUGGY_INCLUI_SANDBOX = 'true';
    mockFetchConnectors.mockResolvedValue({ total: 300, results: [] });
    const res = await GET(request());
    expect(await res.json()).toEqual({
      habilitado: true,
      incluiSandbox: true,
      webhookSecretConfigurado: true,
      credenciaisOk: true,
      conectores: 300,
    });
    expect(mockFetchConnectors).toHaveBeenCalledWith({ countries: ['BR'], sandbox: true });
  });

  it('ligado com credenciais erradas: devolve o motivo, sem 500', async () => {
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'errada';
    mockFetchConnectors.mockRejectedValue(new Error('Response code 401 (Unauthorized)'));
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      habilitado: true,
      credenciaisOk: false,
      motivo: 'Response code 401 (Unauthorized)',
    });
  });
});
