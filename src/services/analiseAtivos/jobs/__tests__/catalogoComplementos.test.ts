/**
 * A6 (fundamentei-trazer, fatia 0): os 2 jobs novos estão em NOMES_JOBS e no catálogo, apontam para
 * o módulo da fatia dona (C e D), são pesados (processo próprio pelo myfinance-job.sh) e, como stub,
 * terminam 'pulado' sem tocar no banco. As linhas de cron ficam COMENTADAS no template do Lightsail.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CATALOGO_JOBS, definicaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { NOMES_JOBS, ehNomeJob } from '@/services/analiseAtivos/jobs/nomesJobs';
import { lerArgsRodarJob } from '@/services/analiseAtivos/jobs/rodarJobCli';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { JobContexto } from '@/services/analiseAtivos/tipos';
import {
  JOBS_COMPLEMENTOS,
  MOTIVO_JOB_NAO_IMPLEMENTADO,
  NOMES_JOBS_COMPLEMENTOS,
} from '@/types/analiseAtivosComplementos';

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
    hoje: '2026-10-19',
    origem: 'script',
    aplicar: true,
  };
}

describe('jobs da A6 no catálogo (fatia 0)', () => {
  it('os 2 nomes estão em NOMES_JOBS, no catálogo e no runner', () => {
    expect(NOMES_JOBS_COMPLEMENTOS).toEqual(['retornos-cotacao', 'cvm-fre-societario']);
    for (const nome of NOMES_JOBS_COMPLEMENTOS) {
      expect(NOMES_JOBS).toContain(nome);
      expect(ehNomeJob(nome)).toBe(true);
      expect(definicaoJob(nome).nome).toBe(nome);
      expect(lerArgsRodarJob([nome]).def.nome).toBe(nome);
    }
  });

  // só os jobs cujo módulo ainda é o stub da fatia 0 (as fatias donas testam o job real)
  const stubs = NOMES_JOBS_COMPLEMENTOS.filter((nome) =>
    readFileSync(resolve(process.cwd(), JOBS_COMPLEMENTOS[nome].modulo), 'utf8').includes(
      'MOTIVO_JOB_NAO_IMPLEMENTADO',
    ),
  );
  if (stubs.length > 0) {
    it.each(stubs)('%s: stub termina pulado sem tocar no banco', async (nome) => {
      const c = ctx();
      const r = await CATALOGO_JOBS[nome].executar(c);
      expect(r.pulado).toContain(MOTIVO_JOB_NAO_IMPLEMENTADO);
      expect(r.pulado).toContain(nome);
      expect(c.contar).not.toHaveBeenCalled();
    });
  }

  it.each(NOMES_JOBS_COMPLEMENTOS)('%s: módulo da fatia dona existe e é o importado', (nome) => {
    const fonte = readFileSync(resolve(process.cwd(), JOBS_COMPLEMENTOS[nome].modulo), 'utf8');
    expect(fonte).toMatch(/export async function \w+\(/);
    const catalogo = readFileSync(
      resolve(process.cwd(), 'src/services/analiseAtivos/jobs/catalogoJobs.ts'),
      'utf8',
    );
    const importado = JOBS_COMPLEMENTOS[nome].modulo.replace(/^src\//, '@/').replace(/\.ts$/, '');
    expect(catalogo).toContain(`from '${importado}'`);
  });

  it('pesados (myfinance-job.sh) com prazo dentro do timeout de 600 s', () => {
    for (const nome of NOMES_JOBS_COMPLEMENTOS) {
      expect(CATALOGO_JOBS[nome].pesado).toBe(true);
      expect(CATALOGO_JOBS[nome].prazoMs).toBe(JOBS_COMPLEMENTOS[nome].prazoMs);
      expect(CATALOGO_JOBS[nome].prazoMs).toBeLessThan(600_000);
    }
  });

  it('linhas de cron só COMENTADAS no template do Lightsail, com o horário do desenho', () => {
    const tpl = readFileSync(
      resolve(process.cwd(), 'infra/modules/lightsail/provision.sh.tftpl'),
      'utf8',
    );
    expect(JOBS_COMPLEMENTOS['retornos-cotacao'].cron).toBe('40 11 * * 2-6');
    expect(JOBS_COMPLEMENTOS['cvm-fre-societario'].cron).toBe('10 6 * * 0');
    for (const nome of NOMES_JOBS_COMPLEMENTOS) {
      const linha = `${JOBS_COMPLEMENTOS[nome].cron} root /usr/local/bin/myfinance-job.sh ${nome}`;
      const linhas = tpl.split('\n').filter((l) => l.includes(`myfinance-job.sh ${nome}`));
      expect(linhas).toEqual([`#${linha}`]);
    }
  });
});
