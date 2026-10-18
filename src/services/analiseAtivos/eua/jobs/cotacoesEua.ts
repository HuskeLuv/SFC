/**
 * Job 'cotacoes-eua' (seg–sex 22:30 UTC, linha de cron COMENTADA). Só com
 * ANALISE_ATIVOS_EUA_PRECO_HABILITADO (sem a chave: 'pulado', nada é chamado): FontePrecoEua
 * (ANALISE_EUA_PRECO_FONTE, BRAPI primeiro), fechamento só ≥ 16h30 ET, grava AssetQuoteDailyUs.
 *
 * DONO: fatia A (docs/analise-ativos/stocks-reits/desenho.json). Criado na fatia 0 como STUB
 * com a assinatura FINAL — o catálogo (jobs/catalogoJobs.ts) já importa este módulo e não é mais
 * editado pelas fatias A/B. Até a fatia A preencher, termina 'pulado' sem tocar no banco.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const MOTIVO_STUB = 'job cotacoes-eua ainda não implementado (fatia A)';

export async function jobCotacoesEua(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: MOTIVO_STUB };
}
