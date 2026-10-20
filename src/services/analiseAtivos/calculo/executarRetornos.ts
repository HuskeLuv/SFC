/**
 * Job 'retornos-cotacao' (A6, item 5): variação acumulada da cotação por símbolo, só preço (sem
 * proventos), gravada em asset_retornos_cotacao (upsert por símbolo).
 *
 * DONO: fatia C (docs/analise-ativos/fundamentei-trazer/desenho.json). Na fatia 0 é STUB: termina
 * 'pulado' sem tocar no banco. A fatia C troca o corpo mantendo a assinatura:
 *  - lotes de LOTE_RETORNOS símbolos; preço na data-alvo = último pregão ≤ alvo com tolerância de
 *    TOLERANCIA_PREGOES_RETORNO pregões; ajuste por fatorEventosEntre (ação) ou ajustarSerieCotaFii
 *    (FII); máxima de fechamento ajustada desde INICIO_MAXIMA_RETORNOS; função pura
 *    regras/calculo/retornosCotacao.ts → RetornosCalculados;
 *  - trava de concorrência do criterios (outro job pesado rodando ⇒ 'pulado');
 *  - não usa asset_price_history.
 * Cron proposto: JOBS_COMPLEMENTOS['retornos-cotacao'] (11:40 UTC, terça a sábado, myfinance-job.sh).
 * O job NÃO depende de ANALISE_ATIVOS_RETORNOS_HABILITADO (a carga roda com a tela desligada).
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import { MOTIVO_JOB_NAO_IMPLEMENTADO } from '@/types/analiseAtivosComplementos';

export async function executarRetornos(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: `retornos-cotacao: ${MOTIVO_JOB_NAO_IMPLEMENTADO}` };
}
