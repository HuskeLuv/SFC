/**
 * Cron da Análise de Ativos (Stocks e REITs) — job 'sec-fundamentos': fundamentos anuais (FY) da
 * SEC, incremental pelo índice diário da EDGAR. Ver
 * src/services/analiseAtivos/eua/jobs/secFundamentos.ts.
 *
 * Em produção roda dentro do 'eua-diario' (11:25 UTC, myfinance-job.sh, processo separado — job
 * pesado). Esta rota fica para disparo manual, com o segredo do cron e recusa (503) quando o RSS
 * do servidor já estiver alto.
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
  const def = CATALOGO_JOBS['sec-fundamentos'];
  const recusa = recusaRotaPesada(def);
  if (recusa) {
    logger.warn(`[analise-ativos] ${recusa}`);
    return NextResponse.json({ job: def.nome, status: 'recusado', erro: recusa }, { status: 503 });
  }
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
