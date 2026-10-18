/**
 * Rotas de cron dos jobs SEC/EUA da fatia A (sec-cadastro, sec-fundamentos, cotacoes-eua): segredo
 * do cron, job do catálogo com o prazo dele, recusa 503 dos pesados com o RSS alto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ executarJobAnalise: vi.fn() }));

vi.mock('@/services/analiseAtivos/jobs/executarJob', async () => {
  const { NextResponse } = await import('next/server');
  return {
    LOCK_TTL_PADRAO_MS: 600_000,
    executarJobAnalise: mocks.executarJobAnalise,
    respostaCron: (r: { status: string }) =>
      NextResponse.json(r, { status: r.status === 'falha' ? 500 : 200 }),
  };
});

import { GET as getCadastro } from '../route';
import { GET as getFundamentos } from '../../sec-fundamentos/route';
import { GET as getCotacoes } from '../../cotacoes-eua/route';

const req = (rota: string, secret?: string) =>
  new NextRequest(`http://localhost/api/cron/analise-ativos/${rota}`, {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (job: string, status: string) => ({
  id: 'run-1',
  job,
  status,
  duracaoMs: 10,
  linhasLidas: 0,
  linhasGravadas: 0,
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

describe.each([
  ['sec-cadastro', getCadastro, 540_000],
  ['sec-fundamentos', getFundamentos, 240_000],
  ['cotacoes-eua', getCotacoes, 120_000],
] as const)('GET /api/cron/analise-ativos/%s', (job, GET, prazoMs) => {
  it('401 sem o segredo do cron', async () => {
    const r = await GET(req(job, 'errado'));
    expect(r.status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('roda o job do catálogo com o prazo dele', async () => {
    mocks.executarJobAnalise.mockResolvedValue(relatorio(job, 'pulado'));
    const r = await GET(req(job, 'segredo-teste'));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith(job, expect.any(Function), { prazoMs });
  });

  it('falha ⇒ 500', async () => {
    mocks.executarJobAnalise.mockResolvedValue(relatorio(job, 'falha'));
    expect((await GET(req(job, 'segredo-teste'))).status).toBe(500);
  });
});

describe('jobs pesados (sec-cadastro, sec-fundamentos) recusam com o RSS alto', () => {
  it.each([
    ['sec-cadastro', getCadastro],
    ['sec-fundamentos', getFundamentos],
  ] as const)('%s ⇒ 503 sem rodar', async (job, GET) => {
    process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB = '1';
    const r = await GET(req(job, 'segredo-teste'));
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toContain(`rodar-job.ts ${job}`);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });
});
