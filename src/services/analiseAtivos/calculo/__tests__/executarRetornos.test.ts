/**
 * A6 (fatia C): job 'retornos-cotacao' — trava de concorrência ('pulado' sem gravar), lotes de
 * LOTE_RETORNOS, upsert, dry-run e prazo.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  executarRetornos,
  jobConcorrenteEmExecucao,
  jobsDaTrava,
  type DependenciasRetornos,
  type ItemUniversoRetornos,
} from '@/services/analiseAtivos/calculo/executarRetornos';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';
import type { JobContexto } from '@/services/analiseAtivos/tipos';
import { LOTE_RETORNOS } from '@/types/analiseAtivosComplementos';

const prisma = {} as PrismaClient;

function ctx(over: Partial<JobContexto> = {}): JobContexto {
  return {
    prisma,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: vi.fn(),
    contar: vi.fn(),
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-19',
    origem: 'script',
    aplicar: true,
    ...over,
  };
}

const PREGOES = pregoesEntre('2015-01-02', '2026-10-16').map((date) => ({ date, closeRaw: 10 }));

function deps(universo: ItemUniversoRetornos[], over: Partial<DependenciasRetornos> = {}) {
  const d = {
    jobConcorrente: vi.fn(async () => null),
    carregarUniverso: vi.fn(async () => universo),
    lerSerie: vi.fn(async (_p: PrismaClient, symbols: readonly string[]) => {
      return new Map(symbols.filter((s) => !s.startsWith('SEM')).map((s) => [s, PREGOES]));
    }),
    lerEventos: vi.fn(async () => new Map()),
    gravar: vi.fn(async (_p: PrismaClient, linhas: readonly unknown[]) => linhas.length),
    ...over,
  };
  return d as typeof d & DependenciasRetornos;
}

const universo = (n: number): ItemUniversoRetornos[] =>
  Array.from({ length: n }, (_, i) => ({
    symbol: `T${String(i).padStart(3, '0')}3`,
    classe: i % 2 ? 'fii' : 'acao',
  }));

describe('executarRetornos', () => {
  it('job concorrente em execução ⇒ pulado, sem ler universo nem gravar', async () => {
    const d = deps(universo(3), { jobConcorrente: vi.fn(async () => 'criterios') });
    const c = ctx();
    const r = await executarRetornos(c, undefined, d);
    expect(r.pulado).toContain("'criterios'");
    expect(r.detalhes).toMatchObject({ pulado: 'job_concorrente', concorrente: 'criterios' });
    expect(d.carregarUniverso).not.toHaveBeenCalled();
    expect(d.gravar).not.toHaveBeenCalled();
    expect(c.alertar).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'retornos_job_concorrente' }),
    );
  });

  it(`lotes de ${LOTE_RETORNOS} com upsert por lote; sem cotação fica fora`, async () => {
    const u = [...universo(120), { symbol: 'SEMCOT3', classe: 'acao' as const }];
    const d = deps(u);
    const c = ctx();
    const r = await executarRetornos(c, undefined, d);
    expect(r.pulado).toBeUndefined();
    expect(d.lerSerie).toHaveBeenCalledTimes(3);
    for (const call of d.lerSerie.mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(LOTE_RETORNOS);
      expect(call[2]).toBe('2015-01-01');
    }
    expect(d.gravar).toHaveBeenCalledTimes(3);
    const gravadas = d.gravar.mock.calls.flatMap((c2) => c2[1] as Array<{ symbol: string }>);
    expect(gravadas).toHaveLength(120);
    expect(gravadas.map((g) => g.symbol)).not.toContain('SEMCOT3');
    expect(r.detalhes).toMatchObject({
      universo: 121,
      calculados: 120,
      gravados: 120,
      semCotacao: 1,
    });
    expect(c.contar).toHaveBeenCalledWith('linhasGravadas', 50);
  });

  it('dry-run (aplicar=false) calcula e não grava', async () => {
    const d = deps(universo(5));
    const r = await executarRetornos(ctx({ aplicar: false }), undefined, d);
    expect(d.gravar).not.toHaveBeenCalled();
    expect(r.detalhes).toMatchObject({ calculados: 5, gravados: 0, dryRun: true });
  });

  it('prazo estourado ⇒ parcial com os lotes anteriores gravados', async () => {
    let n = 0;
    const d = deps(universo(120));
    const r = await executarRetornos(ctx({ estourouPrazo: () => n++ >= 1 }), undefined, d);
    expect(r.parcial).toBe(true);
    expect(d.gravar).toHaveBeenCalledTimes(1);
    expect(r.detalhes).toMatchObject({ processados: 50, gravados: 50 });
  });
});

describe('trava de concorrência', () => {
  it('jobs da trava: os pesados do catálogo (sem o próprio) + quadro e alertas-salvos', async () => {
    const jobs = await jobsDaTrava();
    expect(jobs).toEqual(
      expect.arrayContaining(['derivados', 'criterios', 'eua-diario', 'quadro', 'alertas-salvos']),
    );
    expect(jobs).toContain('cvm-fre-societario');
    expect(jobs).not.toContain('retornos-cotacao');
  });

  it('procura run executando mais novo que o lock entre os jobs da trava', async () => {
    const findFirst = vi.fn(async () => ({ job: 'scores' }));
    const p = { analiseJobRun: { findFirst } } as unknown as PrismaClient;
    const desde = new Date('2026-10-19T11:30:00Z');
    expect(await jobConcorrenteEmExecucao(p, desde)).toBe('scores');
    const arg = (findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0];
    expect(arg.where).toMatchObject({ status: 'executando', inicio: { gt: desde } });
    expect((arg.where.job as { in: string[] }).in).toContain('criterios');
    findFirst.mockResolvedValueOnce(null as never);
    expect(await jobConcorrenteEmExecucao(p, desde)).toBeNull();
  });
});
