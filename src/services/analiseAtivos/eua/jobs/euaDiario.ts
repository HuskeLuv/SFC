/**
 * Job encadeado 'eua-diario' (11:25 UTC pelo myfinance-job.sh; pesado, timeout 600 s): sec-fundamentos
 * (jobSecFundamentos, fatia A) → criterios-eua (jobCriteriosEua) → quadro-eua (jobQuadroEua), um
 * AnaliseJobRun por etapa; falha numa etapa não impede as seguintes (rodam sobre os dados
 * anteriores). Nunca concorre com os jobs BR (scores 10:10, criterios 10:30, quadro 10:40,
 * curadoria 10:55, alertas-salvos 11:10).
 *
 * DONO: fatia B (docs/analise-ativos/stocks-reits/desenho.json). Criado na fatia 0 como STUB
 * com a assinatura FINAL — o catálogo (jobs/catalogoJobs.ts) já importa este módulo e não é mais
 * editado pelas fatias A/B. Até a fatia B preencher, termina 'pulado' sem tocar no banco.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const MOTIVO_STUB = 'job eua-diario ainda não implementado (fatia B)';

export async function jobEuaDiario(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: MOTIVO_STUB };
}
