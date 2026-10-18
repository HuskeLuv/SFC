import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  executarJobAnalise: vi.fn(),
  executarCriteriosEua: vi.fn(),
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
vi.mock('@/services/analiseAtivos/calculo/executarCriteriosEua', () => ({
  executarCriteriosEua: mocks.executarCriteriosEua,
}));

import { GET } from '../route';
import { CATALOGO_JOBS } from '@/services/analiseAtivos/jobs/catalogoJobs';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/criterios-eua', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: string) => ({
  id: 'run-1',
  job: 'criterios-eua',
  status,
  duracaoMs: 10,
  linhasLidas: 1,
  linhasGravadas: 3,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
  process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB = '100000';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB;
});

describe('GET /api/cron/analise-ativos/criterios-eua', () => {
  it('401 sem o segredo do cron', async () => {
    const r = await GET(req('errado'));
    expect(r.status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('roda o job "criterios-eua" (prazo 240 s) mesmo com a chave EUA desligada', async () => {
    delete process.env.ANALISE_ATIVOS_EUA_HABILITADO;
    mocks.executarJobAnalise.mockImplementation(
      async (_job: string, fn: (ctx: unknown) => unknown) => {
        await fn({ ctx: true });
        return relatorio('ok');
      },
    );
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith('criterios-eua', expect.any(Function), {
      prazoMs: 240_000,
    });
    expect(mocks.executarCriteriosEua).toHaveBeenCalledWith({ ctx: true });
  });

  it('falha do job ⇒ 500', async () => {
    mocks.executarJobAnalise.mockResolvedValue(relatorio('falha'));
    expect((await GET(req('segredo-teste'))).status).toBe(500);
  });

  it('job pesado com o RSS do servidor acima do limite ⇒ 503 sem rodar', async () => {
    expect(CATALOGO_JOBS['criterios-eua'].pesado).toBe(true);
    process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB = '1';
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toContain('rodar-job.ts criterios-eua');
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });
});
