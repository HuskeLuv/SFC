/**
 * Cron da Análise de Ativos (Stocks e REITs, fatia B) — job 'quadro-eua': materializa as linhas
 * stock/reit de analise_quadro_linhas (o gravador isolado da fatia 0 nunca apaga acao/fii). Só
 * banco. Ver src/services/analiseAtivos/quadro/gerarQuadroEua.ts.
 *
 * Em produção roda dentro do 'eua-diario' (11:25 UTC, processo separado via myfinance-job.sh). Esta
 * rota fica para disparo manual (curl -m 300), com o segredo do cron. Os jobs EUA não dependem de
 * ANALISE_ATIVOS_EUA_HABILITADO (a carga de produção roda com as telas desligadas).
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
  const def = CATALOGO_JOBS['quadro-eua'];
  const recusa = recusaRotaPesada(def);
  if (recusa) {
    logger.warn(`[analise-ativos] ${recusa}`);
    return NextResponse.json({ job: def.nome, status: 'recusado', erro: recusa }, { status: 503 });
  }
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
