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
    // v2.4: o job 'criterios' passa de 250 MB no runner (265 MB no DEV)
    expect(CATALOGO_JOBS.criterios).toMatchObject({ pesado: true, prazoMs: 240_000 });
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
    expect(lerArgsRodarJob(['criterios']).aplicar).toBe(true);
    expect(lerArgsRodarJob(['criterios', '--sem-aplicar']).aplicar).toBe(false);
  });

  it('--sem-aplicar passa aplicar=false ao wrapper (dry-run do job, sem gravar)', async () => {
    const executar = vi.fn().mockResolvedValue(relatorio('ok'));
    await rodarJobCli(['criterios', '--sem-aplicar'], executar);
    expect(executar).toHaveBeenCalledWith('criterios', expect.any(Function), {
      prazoMs: 240_000,
      origem: 'cron',
      aplicar: false,
    });
  });

  it('--versao-params=N chega ao job e fica nos parâmetros do run (dry-run de versão não vigente)', async () => {
    expect(lerArgsRodarJob(['criterios']).opcoes).toEqual({});
    expect(lerArgsRodarJob(['criterios', '--versao-params=2']).opcoes).toEqual({ versaoParams: 2 });
    expect(() => lerArgsRodarJob(['criterios', '--versao-params=0'])).toThrow(/versao-params/);
    expect(() => lerArgsRodarJob(['criterios', '--versao-params=x'])).toThrow(/versao-params/);
    expect(lerArgsRodarJob(['fontes-fundamentos', '--fonte=exemplo']).opcoes).toEqual({
      fonte: 'exemplo',
    });
    expect(() => lerArgsRodarJob(['fontes-fundamentos', '--fonte=X;Y'])).toThrow(/fonte/);

    const executar = vi.fn().mockResolvedValue(relatorio('ok'));
    await rodarJobCli(['criterios', '--sem-aplicar', '--versao-params=2'], executar);
    expect(executar).toHaveBeenCalledWith('criterios', expect.any(Function), {
      prazoMs: 240_000,
      origem: 'cron',
      parametros: { versaoParams: 2 },
      aplicar: false,
    });
    // a função passada ao wrapper repassa as opções ao job
    const fn = executar.mock.calls[0][1] as (ctx: unknown) => Promise<unknown>;
    const espiao = vi
      .spyOn(CATALOGO_JOBS.criterios, 'executar')
      .mockResolvedValue({ detalhes: {} });
    await fn({});
    expect(espiao).toHaveBeenCalledWith({}, { versaoParams: 2 });
    espiao.mockRestore();
  });

  it("'fontes-fundamentos' está no catálogo (leve, prazo de 240 s)", () => {
    expect(CATALOGO_JOBS['fontes-fundamentos']).toMatchObject({ pesado: false, prazoMs: 240_000 });
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
