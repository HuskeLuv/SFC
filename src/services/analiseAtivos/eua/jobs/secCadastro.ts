/**
 * Job 'sec-cadastro' (semanal, domingo 03:30 UTC pelo myfinance-job.sh; pesado, ≤ 600 s).
 * Baixa company_tickers_exchange.json, os frames dei/EntityPublicFloat dos últimos 6 trimestres e
 * submissions/CIK… (só CIK novo ou com 10-K novo, incremental; a 1ª carga é manual), aplica o
 * universo por CIK com histerese e sanidade de float (universoEuaDe(params) — v3: stocks ≥ US$ 2 bi,
 * saída < US$ 1,6 bi; REITs de patrimônio ≥ US$ 2 bi) e os overrides por CIK, e grava SecCompany e
 * SecCompanyTicker (ticker SEMPRE do arquivo da SEC; symbolNorm = normalizarTickerEua). Alertas:
 * ticker_sem_10k, reit_por_sic_suspeito, float_suspeito.
 *
 * DONO: fatia A (docs/analise-ativos/stocks-reits/desenho.json). Criado na fatia 0 como STUB
 * com a assinatura FINAL — o catálogo (jobs/catalogoJobs.ts) já importa este módulo e não é mais
 * editado pelas fatias A/B. Até a fatia A preencher, termina 'pulado' sem tocar no banco.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const MOTIVO_STUB = 'job sec-cadastro ainda não implementado (fatia A)';

export async function jobSecCadastro(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: MOTIVO_STUB };
}
