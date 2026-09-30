import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

const m = vi.hoisted(() => ({
  executar: vi.fn(),
  sincronizar: vi.fn(),
}));

vi.mock('@/services/analiseAtivos/jobs/executarJob', async (orig) => {
  const real = await orig<typeof import('@/services/analiseAtivos/jobs/executarJob')>();
  return { ...real, executarJobAnalise: m.executar };
});
vi.mock('@/services/analiseAtivos/b3/sincronizarCotahist', () => ({
  sincronizarCotahist: m.sincronizar,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { GET } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/cotahist', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: RelatorioJob['status']): RelatorioJob => ({
  id: 'run-1',
  job: 'cotahist',
  status,
  duracaoMs: 10,
  linhasLidas: 600,
  linhasGravadas: 600,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 200,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/cotahist', () => {
  it('401 sem o segredo do cron (não executa o job)', async () => {
    const r = await GET(req('errado'));
    expect(r.status).toBe(401);
    expect(m.executar).not.toHaveBeenCalled();
  });

  it("executa o job 'cotahist' com prazo de 180 s e devolve o relatório", async () => {
    m.executar.mockImplementation(async (_job: string, fn: (ctx: unknown) => Promise<unknown>) => {
      await fn({ ctx: true });
      return relatorio('ok');
    });
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(m.executar).toHaveBeenCalledWith('cotahist', expect.any(Function), { prazoMs: 180_000 });
    expect(m.sincronizar).toHaveBeenCalledWith({ ctx: true });
    expect(await r.json()).toMatchObject({ job: 'cotahist', status: 'ok', linhasGravadas: 600 });
  });

  it('falha do job ⇒ 500 (o cron registra o código)', async () => {
    m.executar.mockResolvedValue(relatorio('falha'));
    expect((await GET(req('segredo-teste'))).status).toBe(500);
  });
});
