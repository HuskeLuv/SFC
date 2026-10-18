/**
 * Job encadeado 'eua-diario' (fatia B): ordem sec-fundamentos → criterios-eua → quadro-eua, um
 * AnaliseJobRun por etapa (cada uma pelo executarJobAnalise) e continuação depois de uma falha.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ETAPAS_EUA_DIARIO,
  jobEuaDiario,
  type DependenciasEuaDiario,
  type EtapaEuaDiario,
} from '@/services/analiseAtivos/eua/jobs/euaDiario';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto, RelatorioJob } from '@/services/analiseAtivos/tipos';

const PRISMA = { marca: 'prisma-do-run' } as unknown as PrismaClient;

function ctx(restanteMs = 500_000): JobContexto & { alertas: AlertaJob[] } {
  const alertas: AlertaJob[] = [];
  return {
    prisma: PRISMA,
    prazo: Date.now() + restanteMs,
    restanteMs: () => restanteMs,
    estourouPrazo: () => restanteMs <= 0,
    alertar: (a) => alertas.push(a),
    contar: vi.fn(),
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-17',
    origem: 'cron',
    aplicar: false,
    alertas,
  };
}

function relatorio(job: string, status: RelatorioJob['status'], erro?: string): RelatorioJob {
  return {
    id: `run-${job}`,
    job: job as RelatorioJob['job'],
    status,
    duracaoMs: 5,
    linhasLidas: 1,
    linhasGravadas: 2,
    rejeitadas: 0,
    alertas: [],
    rssPicoMb: 120,
    ...(erro ? { erro } : {}),
  };
}

function etapas(): EtapaEuaDiario[] {
  return ETAPAS_EUA_DIARIO.map((e) => ({ ...e, executar: vi.fn(async () => ({})) }));
}

describe('jobEuaDiario', () => {
  it('ordem fixa sec-fundamentos → criterios-eua → quadro-eua', () => {
    expect(ETAPAS_EUA_DIARIO.map((e) => e.nome)).toEqual([
      'sec-fundamentos',
      'criterios-eua',
      'quadro-eua',
    ]);
  });

  it('um run por etapa, com o prisma/origem/aplicar do eua-diario e as opções repassadas', async () => {
    const chamadas: string[] = [];
    const lista = etapas();
    const deps: DependenciasEuaDiario = {
      etapas: lista,
      executar: vi.fn(async (job, fn, opts) => {
        chamadas.push(job);
        expect(opts).toMatchObject({ prisma: PRISMA, origem: 'cron', aplicar: false });
        await fn(ctx());
        return relatorio(job, 'ok');
      }),
    };
    const c = ctx();
    const r = await jobEuaDiario(c, { versaoParams: 3 }, deps);
    expect(chamadas).toEqual(['sec-fundamentos', 'criterios-eua', 'quadro-eua']);
    for (const e of lista) {
      expect(e.executar).toHaveBeenCalledWith(expect.anything(), { versaoParams: 3 });
    }
    expect(r.parcial).toBeUndefined();
    expect((r.detalhes?.etapas as Array<{ runId: string }>).map((e) => e.runId)).toEqual([
      'run-sec-fundamentos',
      'run-criterios-eua',
      'run-quadro-eua',
    ]);
    expect(deps.executar).toHaveBeenNthCalledWith(
      2,
      'criterios-eua',
      expect.any(Function),
      expect.objectContaining({ parametros: { versaoParams: 3, encadeadoEm: 'eua-diario' } }),
    );
  });

  it('falha numa etapa não impede as seguintes; o eua-diario termina parcial com alerta', async () => {
    const chamadas: string[] = [];
    const deps: DependenciasEuaDiario = {
      etapas: etapas(),
      executar: vi.fn(async (job) => {
        chamadas.push(job);
        return job === 'sec-fundamentos'
          ? relatorio(job, 'falha', 'SEC fora do ar')
          : relatorio(job, 'ok');
      }),
    };
    const c = ctx();
    const r = await jobEuaDiario(c, undefined, deps);
    expect(chamadas).toEqual(['sec-fundamentos', 'criterios-eua', 'quadro-eua']);
    expect(r.parcial).toBe(true);
    expect(c.alertas).toEqual([
      expect.objectContaining({
        codigo: 'eua_diario_etapa_falhou',
        nivel: 'erro',
        ref: 'run-sec-fundamentos',
      }),
    ]);
    expect((r.detalhes?.etapas as Array<{ status: string }>).map((e) => e.status)).toEqual([
      'falha',
      'ok',
      'ok',
    ]);
  });

  it('etapa que lança também não para as seguintes', async () => {
    const chamadas: string[] = [];
    const deps: DependenciasEuaDiario = {
      etapas: etapas(),
      executar: vi.fn(async (job) => {
        chamadas.push(job);
        if (job === 'criterios-eua') throw new Error('explodiu');
        return relatorio(job, 'ok');
      }),
    };
    const r = await jobEuaDiario(ctx(), undefined, deps);
    expect(chamadas).toEqual(['sec-fundamentos', 'criterios-eua', 'quadro-eua']);
    expect(r.parcial).toBe(true);
  });

  it("'pulado' (stub da fatia A, params sem perfis) não é falha", async () => {
    const deps: DependenciasEuaDiario = {
      etapas: etapas(),
      executar: vi.fn(async (job) =>
        relatorio(job, job === 'sec-fundamentos' ? 'pulado' : 'ok', 'stub'),
      ),
    };
    const c = ctx();
    const r = await jobEuaDiario(c, undefined, deps);
    expect(r.parcial).toBeUndefined();
    expect(c.alertas).toEqual([]);
  });

  it('prazo de cada etapa limitado ao que resta; sem prazo, a etapa fica registrada e não roda', async () => {
    const prazos: number[] = [];
    const deps: DependenciasEuaDiario = {
      etapas: etapas(),
      executar: vi.fn(async (job, _fn, opts) => {
        prazos.push(opts?.prazoMs ?? 0);
        return relatorio(job, 'ok');
      }),
    };
    await jobEuaDiario(ctx(100_000), undefined, deps);
    expect(prazos).toEqual([100_000, 100_000, 100_000]);

    const c = ctx(1_000);
    const r = await jobEuaDiario(c, undefined, { ...deps, executar: vi.fn() });
    expect((r.detalhes?.etapas as Array<{ status: string }>).map((e) => e.status)).toEqual([
      'sem_prazo',
      'sem_prazo',
      'sem_prazo',
    ]);
    expect(r.parcial).toBe(true);
  });
});
