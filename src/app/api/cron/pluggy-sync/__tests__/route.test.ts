import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockProcessar = vi.hoisted(() => vi.fn());
const mockReconciliar = vi.hoisted(() => vi.fn());
vi.mock('@/services/pluggy/sync', () => ({
  processarEventosPendentes: mockProcessar,
  reconciliarConexoes: mockReconciliar,
}));

import { GET } from '../route';

const req = (qs = '', auth = 'Bearer cron-secret') =>
  new NextRequest(`http://localhost/api/cron/pluggy-sync${qs}`, {
    method: 'GET',
    headers: { authorization: auth },
  });

describe('GET /api/cron/pluggy-sync', () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret';
    process.env.PLUGGY_HABILITADO = 'true';
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    mockProcessar.mockResolvedValue({ processados: 2, erros: 0, ignorados: 1, adiados: 0 });
    mockReconciliar.mockResolvedValue({ sincronizadas: 3, falhas: 0 });
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('401 sem o segredo do cron', async () => {
    expect((await GET(req('', 'Bearer errado'))).status).toBe(401);
    expect(mockProcessar).not.toHaveBeenCalled();
  });

  it('desligado: responde sem tocar na fila', async () => {
    delete process.env.PLUGGY_HABILITADO;
    const res = await GET(req());
    expect(await res.json()).toEqual({ habilitado: false });
    expect(mockProcessar).not.toHaveBeenCalled();
  });

  it('processa a fila; reconciliação só com ?diario=1', async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({
      habilitado: true,
      fila: { processados: 2, erros: 0, ignorados: 1, adiados: 0 },
      reconciliacao: null,
    });
    expect(mockProcessar).toHaveBeenCalledWith(20);
    expect(mockReconciliar).not.toHaveBeenCalled();

    const res2 = await GET(req('?diario=1'));
    expect((await res2.json()).reconciliacao).toEqual({ sincronizadas: 3, falhas: 0 });
  });
});
