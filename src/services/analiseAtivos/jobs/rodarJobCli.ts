/**
 * Núcleo do runner de linha de comando dos jobs da Análise de Ativos
 * (scripts/analise-ativos/rodar-job.ts): mesmo wrapper (executarJobAnalise ⇒ AnaliseJobRun, lock,
 * prazo, alertas) e mesma função das rotas cron, mas num processo próprio — o pico de memória do job
 * não fica no next-server. Registrado com origem 'cron' (é a execução agendada).
 */
import { definicaoJob, type DefinicaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { executarJobAnalise } from '@/services/analiseAtivos/jobs/executarJob';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

export interface ArgsRodarJob {
  def: DefinicaoJob;
  prazoMs: number;
}

export function lerArgsRodarJob(argv: string[]): ArgsRodarJob {
  const posicionais = argv.filter((a) => !a.startsWith('--'));
  if (posicionais.length !== 1) {
    throw new Error('uso: rodar-job.ts <job> [--prazo-s=N]   (ex.: scores, cvm-cias:dfp)');
  }
  const def = definicaoJob(posicionais[0]);
  const prazoTxt = argv.find((a) => a.startsWith('--prazo-s='))?.split('=', 2)[1];
  const prazoMs = prazoTxt === undefined ? def.prazoMs : Number(prazoTxt) * 1000;
  if (!Number.isFinite(prazoMs) || prazoMs <= 0) throw new Error('--prazo-s inválido');
  return { def, prazoMs };
}

/** Código de saída do processo: 0 ok/parcial/pulado, 1 falha (o cron registra no log). */
export function codigoSaida(r: Pick<RelatorioJob, 'status'>): number {
  return r.status === 'falha' ? 1 : 0;
}

export async function rodarJobCli(
  argv: string[],
  executar: typeof executarJobAnalise = executarJobAnalise,
): Promise<{ relatorio: RelatorioJob; codigo: number }> {
  const { def, prazoMs } = lerArgsRodarJob(argv);
  const relatorio = await executar(def.nome, def.executar, {
    prazoMs,
    origem: 'cron',
    ...(def.parametros ? { parametros: def.parametros } : {}),
  });
  return { relatorio, codigo: codigoSaida(relatorio) };
}
