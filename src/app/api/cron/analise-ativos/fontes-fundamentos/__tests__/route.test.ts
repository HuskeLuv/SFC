import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  executarJobAnalise: vi.fn(),
  ingerirFontes: vi.fn(),
}));

vi.mock('@/services/analiseAtivos/jobs/executarJob', async () => {
  const { NextResponse } = await import('next/server');
  return {
    LOCK_TTL_PADRAO_MS: 600_000,
    executarJobAnalise: mocks.executarJobAnalise,
    respostaCron: (r: { status: string }) =>
      NextResponse.json(r, { status: r.status === 'falha' ? 500 : 200 }),
  };
});
vi.mock('@/services/analiseAtivos/fontes/fundamentos/ingerirFontes', () => ({
  DEPENDENCIAS_INGESTAO: { marca: 'deps' },
  ingerirFontes: mocks.ingerirFontes,
}));

import { GET } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/fontes-fundamentos', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: string, erro?: string) => ({
  id: 'run-1',
  job: 'fontes-fundamentos',
  status,
  duracaoMs: 10,
  linhasLidas: 0,
  linhasGravadas: 0,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
  ...(erro ? { erro } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/fontes-fundamentos', () => {
  it('401 sem o segredo do cron', async () => {
    const r = await GET(req('errado'));
    expect(r.status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('roda a ingestão pelo wrapper dos jobs (prazo 240 s) sem conector pedido', async () => {
    mocks.executarJobAnalise.mockImplementation(
      async (_job: string, fn: (ctx: unknown) => unknown) => {
        await fn({ ctx: true });
        return relatorio('pulado', 'nenhum conector de fundamentos habilitado');
      },
    );
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith(
      'fontes-fundamentos',
      expect.any(Function),
      { prazoMs: 240_000 },
    );
    expect(mocks.ingerirFontes).toHaveBeenCalledWith({ ctx: true }, { marca: 'deps' }, {});
    expect((await r.json()).status).toBe('pulado');
  });
});
