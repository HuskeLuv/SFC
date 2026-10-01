import { describe, expect, it, vi } from 'vitest';
import { NOMES_JOBS } from '@/services/analiseAtivos/jobs/nomesJobs';
import {
  CATALOGO_JOBS,
  definicaoJob,
  recusaRotaPesada,
} from '@/services/analiseAtivos/jobs/catalogoJobs';
import {
  codigoSaida,
  lerArgsRodarJob,
  rodarJobCli,
} from '@/services/analiseAtivos/jobs/rodarJobCli';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

const relatorio = (status: RelatorioJob['status']): RelatorioJob => ({
  id: 'run-1',
  job: 'scores',
  status,
  duracaoMs: 1,
  linhasLidas: 0,
  linhasGravadas: 0,
  rejeitadas: 0,
  alertas: [],
  rssPicoMb: 100,
});

describe('catálogo de jobs', () => {
  it('cobre todos os jobs de cron e marca o scores como pesado', () => {
    expect(Object.keys(CATALOGO_JOBS).sort()).toEqual([...NOMES_JOBS].sort());
    for (const [k, d] of Object.entries(CATALOGO_JOBS)) expect(d.nome).toBe(k);
    expect(CATALOGO_JOBS.scores.pesado).toBe(true);
    expect(() => definicaoJob('xpto')).toThrow(/job desconhecido/);
  });

  it('rota de job pesado recusa com RSS acima do limite; leve nunca recusa', () => {
    expect(recusaRotaPesada(CATALOGO_JOBS.scores, 500, 400)).toMatch(/processo separado/);
    expect(recusaRotaPesada(CATALOGO_JOBS.scores, 300, 400)).toBeNull();
    expect(recusaRotaPesada(CATALOGO_JOBS.cotahist, 900, 400)).toBeNull();
  });
});

describe('runner rodar-job', () => {
  it('lê o job e o prazo; sem job ou job inválido ⇒ erro', () => {
    expect(lerArgsRodarJob(['scores']).prazoMs).toBe(240_000);
    expect(lerArgsRodarJob(['cvm-cias:dfp', '--prazo-s=600']).prazoMs).toBe(600_000);
    expect(() => lerArgsRodarJob([])).toThrow(/uso/);
    expect(() => lerArgsRodarJob(['nada'])).toThrow(/job desconhecido/);
    expect(() => lerArgsRodarJob(['scores', '--prazo-s=0'])).toThrow(/prazo/);
  });

  it('roda pelo mesmo wrapper do cron (origem cron, parâmetros do catálogo) e mapeia a saída', async () => {
    const executar = vi.fn().mockResolvedValue(relatorio('falha'));
    const r = await rodarJobCli(['cvm-cias:itr'], executar);
    expect(executar).toHaveBeenCalledWith('cvm-cias:itr', expect.any(Function), {
      prazoMs: 240_000,
      origem: 'cron',
      parametros: { doc: 'itr' },
    });
    expect(r.codigo).toBe(1);
    expect(codigoSaida(relatorio('parcial'))).toBe(0);
    expect(codigoSaida(relatorio('pulado'))).toBe(0);
  });
});
