/**
 * Fatia 0 da feature Stocks e REITs: o catálogo tem os 6 jobs EUA, cada um importando o SEU módulo
 * (eua/jobs/*), e todos terminam 'pulado' enquanto as fatias A/B não preenchem — sem tocar no banco.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CATALOGO_JOBS, definicaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { NOMES_JOBS, ehNomeJob } from '@/services/analiseAtivos/jobs/nomesJobs';
import { lerArgsRodarJob } from '@/services/analiseAtivos/jobs/rodarJobCli';
import type { JobContexto } from '@/services/analiseAtivos/tipos';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { MODULOS_JOBS_EUA, NOMES_JOBS_EUA, CRON_PROPOSTO_EUA } from '@/types/analiseAtivosEua';

/** Prisma que explode em qualquer acesso: o stub não pode tocar no banco. */
const prismaProibido = new Proxy(
  {},
  {
    get(_alvo, prop) {
      throw new Error(`stub acessou prisma.${String(prop)}`);
    },
  },
) as unknown as PrismaClient;

function ctx(): JobContexto {
  return {
    prisma: prismaProibido,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: vi.fn(),
    contar: vi.fn(),
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-17',
    origem: 'script',
    aplicar: true,
  };
}

describe('jobs EUA no catálogo (fatia 0)', () => {
  it('os 6 nomes estão em NOMES_JOBS e no catálogo', () => {
    expect(NOMES_JOBS_EUA).toEqual([
      'sec-cadastro',
      'sec-fundamentos',
      'cotacoes-eua',
      'criterios-eua',
      'quadro-eua',
      'eua-diario',
    ]);
    for (const nome of NOMES_JOBS_EUA) {
      expect(NOMES_JOBS).toContain(nome);
      expect(ehNomeJob(nome)).toBe(true);
      expect(definicaoJob(nome).nome).toBe(nome);
    }
  });

  // fatia A preencheu sec-cadastro/sec-fundamentos/cotacoes-eua (testes em eua/__tests__) e a
  // fatia B o criterios-eua; os stubs que restam são os outros da fatia B
  it.each(NOMES_JOBS_EUA.filter((n) => MODULOS_JOBS_EUA[n].fatia === 'B' && n !== 'criterios-eua'))(
    '%s: stub termina pulado (com o motivo da fatia dona), sem tocar no banco',
    async (nome) => {
      const r = await CATALOGO_JOBS[nome].executar(ctx(), { versaoParams: 3 });
      expect(r).toEqual({
        pulado: `job ${nome} ainda não implementado (fatia ${MODULOS_JOBS_EUA[nome].fatia})`,
      });
    },
  );

  it('cotacoes-eua (fatia A) sem ANALISE_ATIVOS_EUA_PRECO_HABILITADO: pulado, sem tocar no banco', async () => {
    const antes = process.env.ANALISE_ATIVOS_EUA_PRECO_HABILITADO;
    delete process.env.ANALISE_ATIVOS_EUA_PRECO_HABILITADO;
    try {
      const r = await CATALOGO_JOBS['cotacoes-eua'].executar(ctx());
      expect(r.pulado).toContain('ANALISE_ATIVOS_EUA_PRECO_HABILITADO');
    } finally {
      if (antes !== undefined) process.env.ANALISE_ATIVOS_EUA_PRECO_HABILITADO = antes;
    }
  });

  it('pesados = processo próprio (myfinance-job.sh); prazos cabem no timeout de 600 s', () => {
    expect(CATALOGO_JOBS['sec-cadastro']).toMatchObject({ pesado: true, prazoMs: 540_000 });
    expect(CATALOGO_JOBS['sec-fundamentos'].pesado).toBe(true);
    expect(CATALOGO_JOBS['criterios-eua'].pesado).toBe(true);
    expect(CATALOGO_JOBS['eua-diario']).toMatchObject({ pesado: true, prazoMs: 540_000 });
    for (const nome of NOMES_JOBS_EUA) expect(CATALOGO_JOBS[nome].prazoMs).toBeLessThan(600_000);
  });

  it('o runner aceita os jobs EUA com --versao-params (dry-run da v3)', () => {
    const a = lerArgsRodarJob(['criterios-eua', '--versao-params=3', '--sem-aplicar']);
    expect(a.def.nome).toBe('criterios-eua');
    expect(a.opcoes).toEqual({ versaoParams: 3 });
    expect(a.aplicar).toBe(false);
  });

  it('cron proposto: eua-diario 11:25 UTC (depois do alertas-salvos das 11:10), sec-cadastro domingo', () => {
    expect(CRON_PROPOSTO_EUA).toEqual({
      'eua-diario': '25 11 * * *',
      'sec-cadastro': '30 3 * * 0',
      'cotacoes-eua': '30 22 * * 1-5',
    });
  });
});
