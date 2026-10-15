/**
 * Núcleo do runner de linha de comando dos jobs da Análise de Ativos
 * (scripts/analise-ativos/rodar-job.ts): mesmo wrapper (executarJobAnalise ⇒ AnaliseJobRun, lock,
 * prazo, alertas) e mesma função das rotas cron, mas num processo próprio — o pico de memória do job
 * não fica no next-server. Registrado com origem 'cron' (é a execução agendada).
 */
import {
  definicaoJob,
  type DefinicaoJob,
  type OpcoesExecucaoJob,
} from '@/services/analiseAtivos/jobs/catalogoJobs';
import { executarJobAnalise } from '@/services/analiseAtivos/jobs/executarJob';
import type { RelatorioJob } from '@/services/analiseAtivos/tipos';

export interface ArgsRodarJob {
  def: DefinicaoJob;
  prazoMs: number;
  /** false com --sem-aplicar (dry-run: o job calcula e relata, sem gravar; ex.: R1 do 'criterios') */
  aplicar: boolean;
  /** v2.5: --versao-params=N e --fonte=<id> (repassados ao job) */
  opcoes: OpcoesExecucaoJob;
}

export function lerArgsRodarJob(argv: string[]): ArgsRodarJob {
  const posicionais = argv.filter((a) => !a.startsWith('--'));
  if (posicionais.length !== 1) {
    throw new Error(
      'uso: rodar-job.ts <job> [--prazo-s=N] [--sem-aplicar] [--versao-params=N] [--fonte=<id>]' +
        '   (ex.: scores, cvm-cias:dfp)',
    );
  }
  const def = definicaoJob(posicionais[0]);
  const prazoTxt = argv.find((a) => a.startsWith('--prazo-s='))?.split('=', 2)[1];
  const prazoMs = prazoTxt === undefined ? def.prazoMs : Number(prazoTxt) * 1000;
  if (!Number.isFinite(prazoMs) || prazoMs <= 0) throw new Error('--prazo-s inválido');
  const opcoes: OpcoesExecucaoJob = {};
  const versaoTxt = argv.find((a) => a.startsWith('--versao-params='))?.split('=', 2)[1];
  if (versaoTxt !== undefined) {
    const v = Number(versaoTxt);
    if (!Number.isInteger(v) || v <= 0) throw new Error('--versao-params inválido');
    opcoes.versaoParams = v;
  }
  const fonte = argv.find((a) => a.startsWith('--fonte='))?.split('=', 2)[1];
  if (fonte !== undefined) {
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(fonte)) throw new Error('--fonte inválido');
    opcoes.fonte = fonte;
  }
  return { def, prazoMs, aplicar: !argv.includes('--sem-aplicar'), opcoes };
}

/** Código de saída do processo: 0 ok/parcial/pulado, 1 falha (o cron registra no log). */
export function codigoSaida(r: Pick<RelatorioJob, 'status'>): number {
  return r.status === 'falha' ? 1 : 0;
}

export async function rodarJobCli(
  argv: string[],
  executar: typeof executarJobAnalise = executarJobAnalise,
): Promise<{ relatorio: RelatorioJob; codigo: number }> {
  const { def, prazoMs, aplicar, opcoes } = lerArgsRodarJob(argv);
  const comOpcoes = Object.keys(opcoes).length > 0;
  const parametros = comOpcoes ? { ...(def.parametros ?? {}), ...opcoes } : def.parametros;
  const relatorio = await executar(
    def.nome,
    comOpcoes ? (ctx) => def.executar(ctx, opcoes) : def.executar,
    {
      prazoMs,
      origem: 'cron',
      ...(parametros ? { parametros } : {}),
      ...(aplicar ? {} : { aplicar: false }),
    },
  );
  return { relatorio, codigo: codigoSaida(relatorio) };
}
