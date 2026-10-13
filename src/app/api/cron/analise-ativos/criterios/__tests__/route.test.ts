import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  executarJobAnalise: vi.fn(),
  executarCriterios: vi.fn(),
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
vi.mock('@/services/analiseAtivos/calculo/executarCriterios', () => ({
  executarCriterios: mocks.executarCriterios,
}));

import { GET } from '../route';
import { CATALOGO_JOBS } from '@/services/analiseAtivos/jobs/catalogoJobs';

const req = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/analise-ativos/criterios', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

const relatorio = (status: string, erro?: string) => ({
  id: 'run-1',
  job: 'criterios',
  status,
  duracaoMs: 10,
  linhasLidas: 1,
  linhasGravadas: 3,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
  ...(erro ? { erro } : {}),
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

describe('GET /api/cron/analise-ativos/criterios', () => {
  it('401 sem o segredo do cron', async () => {
    const r = await GET(req('errado'));
    expect(r.status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('roda o job "criterios" com executarCriterios (prazo 240 s) e devolve 200', async () => {
    mocks.executarJobAnalise.mockImplementation(
      async (job: string, fn: (ctx: unknown) => unknown) => {
        await fn({ ctx: true });
        return relatorio('ok');
      },
    );
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith('criterios', expect.any(Function), {
      prazoMs: 240_000,
    });
    expect(mocks.executarCriterios).toHaveBeenCalledWith({ ctx: true });
    expect((await r.json()).status).toBe('ok');
  });

  it("scores ainda rodando ⇒ 'pulado' com 200 (o cron não acusa falha)", async () => {
    mocks.executarJobAnalise.mockResolvedValue(
      relatorio('pulado', "job 'scores' ainda em execução"),
    );
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe('pulado');
  });

  it('falha do job ⇒ 500', async () => {
    mocks.executarJobAnalise.mockResolvedValue(relatorio('falha'));
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(500);
  });

  it('job marcado como pesado e RSS do servidor acima do limite ⇒ 503 sem rodar', async () => {
    process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB = '1';
    const def = CATALOGO_JOBS.criterios as { pesado: boolean };
    const original = def.pesado;
    def.pesado = true;
    try {
      const r = await GET(req('segredo-teste'));
      expect(r.status).toBe(503);
      const corpo = await r.json();
      expect(corpo.status).toBe('recusado');
      expect(corpo.erro).toContain('rodar-job.ts criterios');
      expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
    } finally {
      def.pesado = original;
    }
  });

  it('job não pesado roda mesmo com o RSS alto (o runner é o caminho do cron)', async () => {
    process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB = '1';
    mocks.executarJobAnalise.mockResolvedValue(relatorio('ok'));
    const r = await GET(req('segredo-teste'));
    expect(r.status).toBe(CATALOGO_JOBS.criterios.pesado ? 503 : 200);
  });
});
