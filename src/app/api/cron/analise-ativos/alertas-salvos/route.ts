/**
 * Cron da Análise de Ativos — bloco 1: job 'alertas-salvos' (avisos das listas dos Salvos:
 * resultado entregue à CVM, provento anunciado e mudança na contagem de critérios em 5 anos →
 * Notification + push 'analise'). Só banco. Ver
 * src/services/analiseAtivos/alertas/executarAlertasSalvos.ts.
 *
 * Em produção roda pela linha de cron do template do Lightsail às 11:10 UTC (depois da curadoria,
 * em processo separado via myfinance-job.sh). Esta rota fica para disparo manual (curl -m 300).
 * Sem ANALISE_ATIVOS_ALERTAS_HABILITADO o run termina 'pulado'.
 */
import { NextRequest } from 'next/server';
import { CATALOGO_JOBS } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const def = CATALOGO_JOBS['alertas-salvos'];
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
