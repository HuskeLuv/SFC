import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { JobContexto, RelatorioJob, ResultadoJob } from '@/services/analiseAtivos/tipos';

const mocks = vi.hoisted(() => ({
  executarJobAnalise: vi.fn(),
  sincronizarCvmCias: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: {}, prisma: {} }));
vi.mock('@/services/analiseAtivos/jobs/executarJob', () => ({
  executarJobAnalise: mocks.executarJobAnalise,
  respostaCron: (r: RelatorioJob) =>
    NextResponse.json(r, { status: r.status === 'falha' ? 500 : 200 }),
}));
vi.mock('@/services/analiseAtivos/acoes/sincronizarCvmCias', () => ({
  sincronizarCvmCias: mocks.sincronizarCvmCias,
}));

import { GET } from '../route';

const relatorio = (status: RelatorioJob['status']): RelatorioJob => ({
  id: 'run-1',
  job: 'cvm-cias:itr',
  status,
  duracaoMs: 10,
  linhasLidas: 0,
  linhasGravadas: 0,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
});

const req = (doc: string | null, secret = 'test-secret') =>
  new NextRequest(
    `http://localhost/api/cron/analise-ativos/cvm-cias${doc === null ? '' : `?doc=${doc}`}`,
    { headers: { authorization: `Bearer ${secret}` } },
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  mocks.executarJobAnalise.mockImplementation(
    async (_job: string, fn: (ctx: JobContexto) => Promise<ResultadoJob>) => {
      await fn({} as JobContexto);
      return relatorio('ok');
    },
  );
  mocks.sincronizarCvmCias.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/analise-ativos/cvm-cias', () => {
  it('401 sem o segredo do cron (não executa nada)', async () => {
    const r = await GET(req('itr', 'errado'));
    expect(r.status).toBe(401);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it('400 com doc ausente ou inválido', async () => {
    expect((await GET(req(null))).status).toBe(400);
    expect((await GET(req('fre'))).status).toBe(400);
    expect(mocks.executarJobAnalise).not.toHaveBeenCalled();
  });

  it.each([
    ['fca', 60_000],
    ['dfp', 240_000],
    ['itr', 240_000],
  ])('doc=%s ⇒ job cvm-cias:%s com prazo %i ms e a função de ingestão', async (doc, prazo) => {
    const r = await GET(req(doc));
    expect(r.status).toBe(200);
    expect(mocks.executarJobAnalise).toHaveBeenCalledWith(`cvm-cias:${doc}`, expect.any(Function), {
      prazoMs: prazo,
      parametros: { doc },
    });
    expect(mocks.sincronizarCvmCias).toHaveBeenCalledWith(expect.anything(), { doc });
  });

  it('falha do job ⇒ 500; parcial ⇒ 200', async () => {
    mocks.executarJobAnalise.mockResolvedValueOnce(relatorio('falha'));
    expect((await GET(req('dfp'))).status).toBe(500);
    mocks.executarJobAnalise.mockResolvedValueOnce(relatorio('parcial'));
    const r = await GET(req('dfp'));
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe('parcial');
  });
});
