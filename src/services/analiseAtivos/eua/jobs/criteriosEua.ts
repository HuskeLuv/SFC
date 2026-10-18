/**
 * Job 'criterios-eua' (avulso para dry-run com --versao-params=N; no cron roda dentro do
 * 'eua-diario'; pesado). Lê os fundamentos SEC (fonte 'sec'), monta seriesStock/seriesReit,
 * avalia com o MESMO avaliarAtivo (perfis stock/stock_financeira/reit da criteria_params v3;
 * perfilDisponivel antes) e grava criteria_eval pelo gravador da fatia 0 com CLASSES_EUA
 * (gravarCriteriaEval(prisma, linhas, CLASSES_EUA): nunca apaga acao/fii).
 *
 * DONO: fatia B (docs/analise-ativos/stocks-reits/desenho.json). Criado na fatia 0 como STUB
 * com a assinatura FINAL — o catálogo (jobs/catalogoJobs.ts) já importa este módulo e não é mais
 * editado pelas fatias A/B. Até a fatia B preencher, termina 'pulado' sem tocar no banco.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const MOTIVO_STUB = 'job criterios-eua ainda não implementado (fatia B)';

export async function jobCriteriosEua(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: MOTIVO_STUB };
}
