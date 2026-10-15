/**
 * Cron da Análise de Ativos v2.4 — job 'criterios' (Filtros de Fundamentos): avalia os critérios
 * de cada ação e FII nas janelas 3/5/10 e grava criteria_eval. Só banco. Ver
 * src/services/analiseAtivos/calculo/executarCriterios.ts.
 *
 * Em produção roda pela linha de cron do template do Lightsail às 10:30 UTC (entre o scores e o
 * quadro, em processo separado via myfinance-job.sh). Esta rota fica para disparo manual (curl
 * -m 300), com o mesmo gate das outras rotas de cron: segredo do cron e recusa (503) quando o job
 * estiver marcado como pesado e o RSS do servidor já estiver alto.
 */
import { NextRequest, NextResponse } from 'next/server';
import { CATALOGO_JOBS, recusaRotaPesada } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { logger } from '@/lib/logger';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const def = CATALOGO_JOBS.criterios;
  const recusa = recusaRotaPesada(def);
  if (recusa) {
    logger.warn(`[analise-ativos] ${recusa}`);
    return NextResponse.json({ job: def.nome, status: 'recusado', erro: recusa }, { status: 503 });
  }
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
