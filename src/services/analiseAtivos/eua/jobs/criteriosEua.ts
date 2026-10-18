/**
 * Job 'criterios-eua' (avulso para dry-run com --versao-params=N; no cron roda dentro do
 * 'eua-diario'; pesado). Lê os fundamentos SEC (fonte 'sec'), monta seriesStock/seriesReit,
 * avalia com o MESMO avaliarAtivo (perfis stock/stock_financeira/reit da criteria_params v3;
 * perfilDisponivel antes) e grava criteria_eval pelo gravador da fatia 0 com CLASSES_EUA
 * (gravarCriteriaEval(prisma, linhas, CLASSES_EUA): nunca apaga acao/fii).
 *
 * DONO: fatia B (docs/analise-ativos/stocks-reits/desenho.json). O corpo está em
 * calculo/executarCriteriosEua.ts; este módulo é o ponto de entrada que o catálogo importa.
 */
import { executarCriteriosEua } from '@/services/analiseAtivos/calculo/executarCriteriosEua';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export async function jobCriteriosEua(
  ctx: JobContexto,
  opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return opcoes?.versaoParams !== undefined
    ? executarCriteriosEua(ctx, undefined, { versaoParams: opcoes.versaoParams })
    : executarCriteriosEua(ctx);
}
