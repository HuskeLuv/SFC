/**
 * Job 'sec-fundamentos' (diário, dentro do 'eua-diario'; pesado). Incremental pelo form.AAAAMMDD.idx
 * desde o cursor (10-K, 10-K/A, 10-KT de CIKs do universo): baixa de novo só o companyfacts deles,
 * extrai os FY (350–380 dias, último arquivado vence, ano pelo término; jan/fev = ano anterior) e
 * grava AssetFundamentalsPeriod source 'SEC' (emissorId 'CIK:##########', versao +1 só quando o
 * valor muda; colunas acoesMediaDiluida/dpa/dpaOrigem/recompras). Um CIK por vez, liberando a
 * memória (RSS < 300 MB no rodar-job.ts).
 *
 * DONO: fatia A (docs/analise-ativos/stocks-reits/desenho.json). Criado na fatia 0 como STUB
 * com a assinatura FINAL — o catálogo (jobs/catalogoJobs.ts) já importa este módulo e não é mais
 * editado pelas fatias A/B. Até a fatia A preencher, termina 'pulado' sem tocar no banco.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const MOTIVO_STUB = 'job sec-fundamentos ainda não implementado (fatia A)';

export async function jobSecFundamentos(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: MOTIVO_STUB };
}
