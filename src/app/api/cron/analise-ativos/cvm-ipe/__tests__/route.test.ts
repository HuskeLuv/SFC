import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContexto, RelatorioJob } from '@/services/analiseAtivos/tipos';

const m = vi.hoisted(() => ({ executar: vi.fn(), sincronizar: vi.fn() }));

vi.mock('@/services/analiseAtivos/jobs/executarJob', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/analiseAtivos/jobs/executarJob')>();
  return { ...orig, executarJobAnalise: m.executar };
});
vi.mock('@/services/analiseAtivos/eventos/sincronizarIpe', () => ({
  sincronizarIpe: m.sincronizar,
}));
vi.mock('@/lib/prisma', () => ({ default: {}, prisma: {} }));

import { GET, dynamic, runtime } from '../route';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/cvm-ipe', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: RelatorioJob['status']): RelatorioJob => ({
  id: 'run-1',
  job: 'cvm-ipe',
  status,
  duracaoMs: 10,
  linhasLidas: 6762,
  linhasGravadas: 300,
  rejeitadas: 5,
  alertas: [],
  rssPicoMb: 120,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'segredo-teste';
  m.sincronizar.mockResolvedValue({ detalhes: {} });
  m.executar.mockImplementation(
    async (_job: string, fn: (ctx: JobContexto) => Promise<unknown>) => {
      await fn({} as JobContexto);
      return relatorio('ok');
    },
  );
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/cvm-ipe', () => {
  it('Node runtime e sem cache', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });

  it('401 sem o segredo do cron (e não roda o job)', async () => {
    const res = await GET(req('errado'));
    expect(res.status).toBe(401);
    expect(m.executar).not.toHaveBeenCalled();
  });

  it("roda o job 'cvm-ipe' com prazo de 120 s chamando sincronizarIpe; 200 com o relatório", async () => {
    const res = await GET(req('segredo-teste'));
    expect(res.status).toBe(200);
    expect(m.executar).toHaveBeenCalledTimes(1);
    expect(m.executar.mock.calls[0][0]).toBe('cvm-ipe');
    expect(m.executar.mock.calls[0][2]).toEqual({ prazoMs: 120_000 });
    expect(m.sincronizar).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ job: 'cvm-ipe', status: 'ok', linhasGravadas: 300 });
  });

  it('falha do job ⇒ 500 (o cron registra o código no log)', async () => {
    m.executar.mockResolvedValue(relatorio('falha'));
    const res = await GET(req('segredo-teste'));
    expect(res.status).toBe(500);
  });
});
