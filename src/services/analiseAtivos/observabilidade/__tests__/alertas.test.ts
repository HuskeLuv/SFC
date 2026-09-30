import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

const m = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: m.logger }));

import {
  notificarResultadoJob,
  TIPO_NOTIFICACAO_ALERTA,
} from '@/services/analiseAtivos/observabilidade/alertas';
import { obterPainelFrescor } from '@/services/analiseAtivos/observabilidade/frescor';

const H = 60 * 60 * 1000;

function prismaCom(execucoes: Array<{ status: string; horasAtras: number }>) {
  const agora = Date.now();
  return {
    analiseJobRun: {
      findMany: vi.fn(async () =>
        execucoes.map((e) => ({
          status: e.status,
          inicio: new Date(agora - e.horasAtras * H),
          fim: null,
          erro: null,
        })),
      ),
    },
    user: { findMany: vi.fn(async () => [{ id: 'admin-1' }, { id: 'admin-2' }]) },
    notification: { createMany: vi.fn(async () => ({ count: 2 })) },
  };
}

const rel = (over: Partial<RelatorioJob> = {}): RelatorioJob => ({
  id: 'run-9',
  job: 'cvm-ipe',
  status: 'falha',
  duracaoMs: 1000,
  linhasLidas: 0,
  linhasGravadas: 0,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
  erro: 'HTTP 503 em https://dados.cvm.gov.br/…',
  ...over,
});

const DUAS_FALHAS = [
  { status: 'falha', horasAtras: 0 },
  { status: 'falha', horasAtras: 24 },
];

const envOriginal = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  process.env = { ...envOriginal };
  vi.unstubAllEnvs();
});

const alertasNoLog = () =>
  m.logger.error.mock.calls.filter((c) => String(c[0]).startsWith('[analise-ativos][ALERTA]'));

describe('notificarResultadoJob', () => {
  it('em test/dev: 2 falhas seguidas ⇒ só logger ([ALERTA]), nunca Notification', async () => {
    const prisma = prismaCom(DUAS_FALHAS);
    vi.stubEnv('ANALISE_ATIVOS_ALERTA_ADMIN', 'true');
    await notificarResultadoJob(prisma as unknown as PrismaClient, rel());
    expect(alertasNoLog()).toHaveLength(1);
    expect(alertasNoLog()[0][0]).toContain('cvm-ipe: 2 falhas seguidas');
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('em production SEM ANALISE_ATIVOS_ALERTA_ADMIN=true: também não escreve Notification', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANALISE_ATIVOS_ALERTA_ADMIN', '');
    const prisma = prismaCom(DUAS_FALHAS);
    await notificarResultadoJob(prisma as unknown as PrismaClient, rel());
    expect(alertasNoLog()).toHaveLength(1);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('em production COM a flag: cria 1 Notification por admin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANALISE_ATIVOS_ALERTA_ADMIN', 'true');
    const prisma = prismaCom(DUAS_FALHAS);
    await notificarResultadoJob(prisma as unknown as PrismaClient, rel());
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'admin' },
      select: { id: true },
    });
    const data = prisma.notification.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(data.map((d: { userId: string }) => d.userId)).toEqual(['admin-1', 'admin-2']);
    expect(data[0]).toMatchObject({
      type: TIPO_NOTIFICACAO_ALERTA,
      metadata: { job: 'cvm-ipe', runId: 'run-9', status: 'falha' },
    });
  });

  it('1ª falha isolada ⇒ sem alerta (só o log de job falhou)', async () => {
    const prisma = prismaCom([
      { status: 'falha', horasAtras: 0 },
      { status: 'ok', horasAtras: 24 },
    ]);
    await notificarResultadoJob(prisma as unknown as PrismaClient, rel());
    expect(alertasNoLog()).toHaveLength(0);
    expect(m.logger.error).toHaveBeenCalledWith('[analise-ativos] job falhou', expect.anything());
  });

  it("ErroLayoutFonte (alerta nível 'erro') alerta já na 1ª ocorrência", async () => {
    const prisma = prismaCom([{ status: 'falha', horasAtras: 0 }]);
    await notificarResultadoJob(
      prisma as unknown as PrismaClient,
      rel({
        alertas: [
          {
            codigo: 'layout_fonte',
            nivel: 'erro',
            mensagem: 'Layout de ipe_cia_aberta_2026.csv mudou: faltando Data_Referencia',
          },
        ],
      }),
    );
    expect(alertasNoLog()).toHaveLength(1);
    expect(alertasNoLog()[0][0]).toContain('faltando Data_Referencia');
    // não precisa consultar o histórico
    expect(prisma.analiseJobRun.findMany).not.toHaveBeenCalled();
  });

  it('run ok ⇒ só logger.info, sem consulta', async () => {
    const prisma = prismaCom([]);
    await notificarResultadoJob(
      prisma as unknown as PrismaClient,
      rel({ status: 'ok', erro: undefined }),
    );
    expect(m.logger.info).toHaveBeenCalledTimes(1);
    expect(prisma.analiseJobRun.findMany).not.toHaveBeenCalled();
    expect(alertasNoLog()).toHaveLength(0);
  });

  it('exceção interna (banco fora) não propaga', async () => {
    const prisma = prismaCom([]);
    prisma.analiseJobRun.findMany.mockRejectedValue(new Error('conexão recusada'));
    await expect(
      notificarResultadoJob(prisma as unknown as PrismaClient, rel()),
    ).resolves.toBeUndefined();
    expect(m.logger.error).toHaveBeenCalledWith(
      '[analise-ativos] falha ao processar alerta do job',
      expect.objectContaining({ erro: 'conexão recusada' }),
    );
  });

  it('falha ao criar Notification em prod também não propaga', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANALISE_ATIVOS_ALERTA_ADMIN', 'true');
    const prisma = prismaCom(DUAS_FALHAS);
    prisma.notification.createMany.mockRejectedValue(new Error('FK'));
    await expect(
      notificarResultadoJob(prisma as unknown as PrismaClient, rel()),
    ).resolves.toBeUndefined();
  });
});

describe('obterPainelFrescor', () => {
  it('lê pelo repositório (última execução ok por job + dado mais recente por camada)', async () => {
    const agora = new Date('2026-09-30T12:00:00Z');
    const max = (v: Date | null) => ({
      _max: {
        date: v,
        dtFim: v,
        refMonth: v,
        refQuarter: v,
        atualizadoEm: v,
        fetchedAt: v,
        data: v,
        dataRef: v,
      },
    });
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const prisma = {
      analiseJobRun: {
        groupBy: vi.fn(async () => [
          { job: 'cotahist', _max: { fim: new Date('2026-09-29T23:10:00Z') } },
          { job: 'cvm-ipe', _max: { fim: new Date('2026-09-28T09:26:00Z') } },
        ]),
      },
      assetQuoteDaily: { aggregate: vi.fn(async () => max(d('2026-09-29'))) },
      assetFundamentalsPeriod: { aggregate: vi.fn(async () => max(null)) },
      fiiMonthly: { aggregate: vi.fn(async () => max(null)) },
      fiiQuarterly: { aggregate: vi.fn(async () => max(null)) },
      assetSetorB3: { aggregate: vi.fn(async () => max(null)) },
      fiiTickerMap: { aggregate: vi.fn(async () => max(null)) },
      assetEvento: { aggregate: vi.fn(async () => max(d('2026-09-25'))) },
      assetScore: { aggregate: vi.fn(async () => max(null)) },
    };
    const p = await obterPainelFrescor(prisma as unknown as PrismaClient, agora);
    expect(p.camadas.cotacoes).toMatchObject({ status: 'em_dia', dadoMaisRecente: '2026-09-29' });
    // IPE OK há 50 h (> 26 h) ⇒ atrasado mesmo com dado recente
    expect(p.camadas.eventos.status).toBe('atrasado');
    expect(p.camadas.scores.status).toBe('sem_dado');
    expect(p.atrasadas).toEqual(['eventos']);
  });
});
