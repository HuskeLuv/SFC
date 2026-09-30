import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  executarJobAnalise: vi.fn(),
  executarScores: vi.fn(),
}));

vi.mock('@/services/analiseAtivos/jobs/executarJob', async () => {
  const { NextResponse } = await import('next/server');
  return {
    executarJobAnalise: mocks.executarJobAnalise,
    respostaCron: (r: { status: string }) =>
      NextResponse.json(r, { status: r.status === 'falha' ? 500 : 200 }),
  };
});
vi.mock('@/services/analiseAtivos/calculo/executarScores', () => ({
  executarScores: mocks.executarScores,
}));

import { GET } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/scores', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: string) => ({
  id: 'run-1',
  job: 'scores',
  status,
  duracaoMs: 10,
  linhasLidas: 1,
  linhasGravadas: 1,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/scores', () => {
  it('401 sem o segredo do cron', async () => {
    const r = await GET(req('errado'));
    expect(r.status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('roda o job "scores" com executarScores e devolve 200', async () => {
    mocks.executarJobAnalise.mockImplementation(
      async (job: string, fn: (ctx: unknown) => unknown) => {
        await fn({ ctx: true });
        return relatorio('ok');
      },
    );
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith('scores', expect.any(Function));
    expect(mocks.executarScores).toHaveBeenCalledWith({ ctx: true });
    expect((await r.json()).status).toBe('ok');
  });

  it('falha do job ⇒ 500', async () => {
    mocks.executarJobAnalise.mockResolvedValue(relatorio('falha'));
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(500);
  });
});
