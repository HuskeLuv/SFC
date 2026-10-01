import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { JobContexto } from '@/services/analiseAtivos/tipos';

const m = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    analiseJobRun: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    analiseJobRun: { update: vi.fn() },
    scoringParams: { findFirst: vi.fn(), findUnique: vi.fn() },
  };
  return { tx, prisma, notificar: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma, default: m.prisma }));
vi.mock('@/services/analiseAtivos/observabilidade/alertas', () => ({
  notificarResultadoJob: m.notificar,
}));

import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';

const MIN = 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  m.tx.analiseJobRun.findFirst.mockResolvedValue(null);
  m.tx.analiseJobRun.create.mockImplementation(async ({ data }: { data: { status: string } }) => ({
    id: data.status === 'pulado' ? 'run-pulado' : 'run-1',
  }));
  m.tx.analiseJobRun.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.analiseJobRun.update.mockResolvedValue({});
  m.prisma.scoringParams.findFirst.mockResolvedValue({ version: 1, params: SCORING_PARAMS_V1 });
});

const dadosUpdate = () => m.prisma.analiseJobRun.update.mock.calls[0][0].data;

describe('executarJobAnalise', () => {
  it("cria o run 'executando' dentro da transação com pg_advisory_xact_lock e fecha 'ok' com contadores", async () => {
    const r = await executarJobAnalise('cvm-cias:dfp', async (ctx) => {
      ctx.contar('linhasLidas', 10);
      ctx.contar('linhasGravadas', 7);
      ctx.contar('rejeitadas');
      expect(ctx.paramsVersion).toBe(1);
      expect(ctx.hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      return { detalhes: { arquivos: 1 } };
    });

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    const [strings, job] = m.tx.$executeRaw.mock.calls[0];
    expect((strings as string[]).join('?')).toContain('pg_advisory_xact_lock(hashtext(');
    expect(job).toBe('cvm-cias:dfp');
    expect(m.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      m.tx.analiseJobRun.create.mock.invocationCallOrder[0],
    );
    expect(m.tx.analiseJobRun.create.mock.calls[0][0].data).toMatchObject({
      job: 'cvm-cias:dfp',
      status: 'executando',
      origem: 'cron',
    });

    expect(r).toMatchObject({
      id: 'run-1',
      status: 'ok',
      linhasLidas: 10,
      linhasGravadas: 7,
      rejeitadas: 1,
    });
    expect(m.prisma.analiseJobRun.update.mock.calls[0][0].where).toEqual({ id: 'run-1' });
    expect(dadosUpdate()).toMatchObject({
      status: 'ok',
      linhasLidas: 10,
      linhasGravadas: 7,
      rejeitadas: 1,
      erro: null,
      detalhes: { arquivos: 1 },
    });
    expect(dadosUpdate().fim).toBeInstanceOf(Date);
    expect(typeof dadosUpdate().rssPicoMb).toBe('number');
  });

  it("RSS subindo > 300 MB ⇒ alerta 'rss_acima_limite' nível erro (notifica)", async () => {
    const real = process.memoryUsage;
    let mb = 300;
    const spy = vi
      .spyOn(process, 'memoryUsage')
      .mockImplementation(
        () => ({ ...real.call(process), rss: mb * 1024 * 1024 }) as NodeJS.MemoryUsage,
      );
    try {
      const r = await executarJobAnalise('scores', async () => {
        mb = 700;
        return {};
      });
      expect(r.alertas).toContainEqual(
        expect.objectContaining({ codigo: 'rss_acima_limite', nivel: 'erro' }),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("resultado parcial ⇒ 'parcial'", async () => {
    const r = await executarJobAnalise('fii-mensal', async () => ({ parcial: true }));
    expect(r.status).toBe('parcial');
    expect(dadosUpdate().status).toBe('parcial');
  });

  it("exceção ⇒ 'falha' + erro, sem lançar", async () => {
    const r = await executarJobAnalise('cotahist', async () => {
      throw new Error('deu ruim');
    });
    expect(r).toMatchObject({ status: 'falha', erro: 'deu ruim' });
    expect(dadosUpdate()).toMatchObject({ status: 'falha', erro: 'deu ruim' });
  });

  it("ErroLayoutFonte ⇒ 'falha' + alerta nível erro", async () => {
    const r = await executarJobAnalise('cvm-cias:itr', async () => {
      throw new ErroLayoutFonte('itr_cia_aberta_DRE_con_2026.csv', ['VL_CONTA']);
    });
    expect(r.status).toBe('falha');
    expect(r.alertas).toContainEqual(
      expect.objectContaining({
        codigo: 'layout_fonte',
        nivel: 'erro',
        ref: 'itr_cia_aberta_DRE_con_2026.csv',
      }),
    );
    expect(dadosUpdate().alertas).toEqual(r.alertas);
  });

  it("run 'executando' recente ⇒ 'pulado' sem executar o job", async () => {
    m.tx.analiseJobRun.findFirst.mockResolvedValue({
      id: 'run-0',
      inicio: new Date(Date.now() - MIN),
    });
    const fn = vi.fn();
    const r = await executarJobAnalise('scores', fn);
    expect(r).toMatchObject({ id: 'run-pulado', status: 'pulado' });
    expect(fn).not.toHaveBeenCalled();
    expect(m.tx.analiseJobRun.create.mock.calls[0][0].data.status).toBe('pulado');
    expect(m.prisma.analiseJobRun.update).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledTimes(1);
  });

  it("run 'executando' velho (> lockTtl) ⇒ marcado 'abandonado' e o job roda", async () => {
    m.tx.analiseJobRun.findFirst.mockResolvedValue({
      id: 'run-0',
      inicio: new Date(Date.now() - 11 * MIN),
    });
    const r = await executarJobAnalise('fii-trimestral', async () => ({}));
    expect(m.tx.analiseJobRun.updateMany).toHaveBeenCalledTimes(1);
    expect(m.tx.analiseJobRun.updateMany.mock.calls[0][0].data.status).toBe('abandonado');
    expect(r.status).toBe('ok');
  });

  it('sem ScoringParams no banco: ingestão roda com v1 do código + alerta params_fallback_codigo', async () => {
    m.prisma.scoringParams.findFirst.mockResolvedValue(null);
    let ctxVisto: JobContexto | null = null;
    const r = await executarJobAnalise('b3-cadastro', async (ctx) => {
      ctxVisto = ctx;
      return {};
    });
    expect(r.status).toBe('ok');
    expect(ctxVisto!.paramsVersion).toBe(1);
    expect(ctxVisto!.params).toBe(SCORING_PARAMS_V1);
    expect(r.alertas.map((a) => a.codigo)).toContain('params_fallback_codigo');
  });

  it("sem ScoringParams no banco: 'scores' ⇒ 'falha' sem executar", async () => {
    m.prisma.scoringParams.findFirst.mockResolvedValue(null);
    const fn = vi.fn();
    const r = await executarJobAnalise('scores', fn);
    expect(r.status).toBe('falha');
    expect(r.erro).toMatch(/ScoringParams/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('estourouPrazo() só depois do prazo; restanteMs decresce', async () => {
    await executarJobAnalise(
      'cotahist',
      async (ctx) => {
        expect(ctx.estourouPrazo()).toBe(false);
        expect(ctx.restanteMs()).toBeGreaterThan(0);
        return {};
      },
      { prazoMs: MIN },
    );
    await executarJobAnalise(
      'cotahist',
      async (ctx) => {
        await new Promise((r) => setTimeout(r, 20));
        expect(ctx.estourouPrazo()).toBe(true);
        expect(ctx.restanteMs()).toBe(0);
        return { parcial: true };
      },
      { prazoMs: 5 },
    );
  });

  it('notificarResultadoJob chamado 1× por execução, com o relatório', async () => {
    const r = await executarJobAnalise('cvm-ipe', async () => ({}));
    expect(m.notificar).toHaveBeenCalledTimes(1);
    expect(m.notificar.mock.calls[0][1]).toEqual(r);
  });

  it('nunca lança: falha do banco no lock, no fechamento e na notificação', async () => {
    m.prisma.$transaction.mockRejectedValueOnce(new Error('conexão caiu'));
    const r1 = await executarJobAnalise('cotahist', async () => ({}));
    expect(r1).toMatchObject({ id: '', status: 'falha' });
    expect(r1.erro).toMatch(/conexão caiu/);

    m.prisma.analiseJobRun.update.mockRejectedValueOnce(new Error('update falhou'));
    m.notificar.mockRejectedValueOnce(new Error('notificação falhou'));
    const r2 = await executarJobAnalise('cotahist', async () => ({}));
    expect(r2.status).toBe('ok');
  });

  it('alertas acima de 200 são truncados com contador no run', async () => {
    const r = await executarJobAnalise('fii-mensal', async (ctx) => {
      for (let i = 0; i < 250; i++)
        ctx.alertar({ codigo: 'x', nivel: 'info', mensagem: String(i) });
      return {};
    });
    expect(r.alertas).toHaveLength(200);
    const gravados = dadosUpdate().alertas as Array<{ codigo: string; mensagem: string }>;
    expect(gravados).toHaveLength(201);
    expect(gravados[200]).toMatchObject({ codigo: 'alertas_truncados' });
  });

  it('origem/aplicar/parametros de script chegam ao ctx e ao run', async () => {
    await executarJobAnalise(
      'backfill:dfp',
      async (ctx) => {
        expect(ctx.origem).toBe('script');
        expect(ctx.aplicar).toBe(false);
        return {};
      },
      { origem: 'script', aplicar: false, parametros: { anos: [2016] } },
    );
    expect(m.tx.analiseJobRun.create.mock.calls[0][0].data).toMatchObject({
      origem: 'script',
      parametros: { anos: [2016] },
    });
  });
});

describe('respostaCron', () => {
  it('200 para ok/parcial/pulado e 500 para falha', () => {
    const base = {
      id: 'x',
      job: 'cotahist' as const,
      duracaoMs: 1,
      linhasLidas: 0,
      linhasGravadas: 0,
      rejeitadas: 0,
      alertas: [],
      rssPicoMb: 100,
    };
    expect(respostaCron({ ...base, status: 'ok' }).status).toBe(200);
    expect(respostaCron({ ...base, status: 'parcial' }).status).toBe(200);
    expect(respostaCron({ ...base, status: 'pulado' }).status).toBe(200);
    expect(respostaCron({ ...base, status: 'falha', erro: 'x' }).status).toBe(500);
  });
});
