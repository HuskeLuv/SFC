import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  executar: vi.fn(),
  sincronizar: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/services/analiseAtivos/jobs/executarJob', async (orig) => ({
  ...(await orig<typeof import('@/services/analiseAtivos/jobs/executarJob')>()),
  executarJobAnalise: m.executar,
}));
vi.mock('@/services/analiseAtivos/fii/sincronizarFiiMensal', () => ({
  sincronizarFiiMensal: m.sincronizar,
}));

import { GET } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/fii-mensal', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: string) => ({
  id: 'run-1',
  job: 'fii-mensal',
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
  process.env.CRON_SECRET = 'test-secret';
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/fii-mensal', () => {
  it('401 sem o secret (não executa o job)', async () => {
    const res = await GET(req('errado'));
    expect(res.status).toBe(401);
    expect(m.executar).not.toHaveBeenCalled();
  });

  it("executa o job 'fii-mensal' com prazo de 120 s e chama sincronizarFiiMensal com o contexto", async () => {
    m.executar.mockImplementation(async (_job: string, fn: (ctx: unknown) => Promise<unknown>) => {
      await fn({ ctx: true });
      return relatorio('ok');
    });
    const res = await GET(req('test-secret'));
    expect(res.status).toBe(200);
    expect(m.executar).toHaveBeenCalledWith('fii-mensal', expect.any(Function), {
      prazoMs: 120_000,
    });
    expect(m.sincronizar).toHaveBeenCalledWith({ ctx: true });
    expect(await res.json()).toMatchObject({ status: 'ok', job: 'fii-mensal' });
  });

  it('falha do job ⇒ 500; pulado (lock) ⇒ 200', async () => {
    m.executar.mockResolvedValueOnce(relatorio('falha'));
    expect((await GET(req('test-secret'))).status).toBe(500);
    m.executar.mockResolvedValueOnce(relatorio('pulado'));
    expect((await GET(req('test-secret'))).status).toBe(200);
  });
});
