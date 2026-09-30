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
vi.mock('@/services/analiseAtivos/b3/sincronizarB3Cadastro', () => ({
  sincronizarB3Cadastro: m.sincronizar,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { GET } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/b3-cadastro', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: RelatorioJob['status']): RelatorioJob => ({
  id: 'run-1',
  job: 'b3-cadastro',
  status,
  duracaoMs: 10,
  linhasLidas: 358,
  linhasGravadas: 0,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 150,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/b3-cadastro', () => {
  it('401 sem o segredo do cron', async () => {
    expect((await GET(req())).status).toBe(401);
    expect(m.executar).not.toHaveBeenCalled();
  });

  it("executa o job 'b3-cadastro' (prazo 60 s) e devolve 200", async () => {
    m.executar.mockImplementation(async (_job: string, fn: (ctx: unknown) => Promise<unknown>) => {
      await fn({ ctx: true });
      return relatorio('ok');
    });
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(m.executar).toHaveBeenCalledWith('b3-cadastro', expect.any(Function), {
      prazoMs: 60_000,
    });
    expect(m.sincronizar).toHaveBeenCalledWith({ ctx: true });
  });

  it("run 'pulado' (outro em execução) ⇒ 200; 'falha' ⇒ 500", async () => {
    m.executar.mockResolvedValueOnce(relatorio('pulado'));
    expect((await GET(req('segredo-teste'))).status).toBe(200);
    m.executar.mockResolvedValueOnce(relatorio('falha'));
    expect((await GET(req('segredo-teste'))).status).toBe(500);
  });
});
