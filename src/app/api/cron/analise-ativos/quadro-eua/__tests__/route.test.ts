import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  executarJobAnalise: vi.fn(),
  gerarQuadroEua: vi.fn(),
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
vi.mock('@/services/analiseAtivos/quadro/gerarQuadroEua', () => ({
  gerarQuadroEua: mocks.gerarQuadroEua,
}));

import { GET } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/quadro-eua', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
  process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB = '1';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB;
});

describe('GET /api/cron/analise-ativos/quadro-eua', () => {
  it('401 sem o segredo do cron', async () => {
    expect((await GET(req())).status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('roda o job "quadro-eua" (prazo 120 s; não é pesado: roda mesmo com RSS alto)', async () => {
    mocks.executarJobAnalise.mockImplementation(
      async (_job: string, fn: (ctx: unknown) => unknown) => {
        await fn({ ctx: true });
        return { id: 'r', job: 'quadro-eua', status: 'ok', alertas: [] };
      },
    );
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith('quadro-eua', expect.any(Function), {
      prazoMs: 120_000,
    });
    expect(mocks.gerarQuadroEua).toHaveBeenCalledWith({ ctx: true });
  });
});
