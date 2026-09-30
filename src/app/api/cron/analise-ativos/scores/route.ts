/**
 * Cron da Análise de Ativos (fatia D): proventos auditados, eventos verificados, per-share, múltiplos,
 * Índice MF e semáforo. Só banco. Ver src/services/analiseAtivos/calculo/executarScores.ts.
 *
 * Job PESADO (catalogoJobs): em produção o cron diário roda em processo separado
 * (scripts/analise-ativos/rodar-job.ts scores, via myfinance-job.sh), porque dentro do next-server o
 * pico passa de 300 MB e a memória não volta para o app. Esta rota fica para disparo manual e
 * responde 503 sem rodar quando o RSS do servidor já está acima de ANALISE_ATIVOS_ROTA_RSS_MAX_MB.
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
  const def = CATALOGO_JOBS.scores;
  const recusa = recusaRotaPesada(def);
  if (recusa) {
    logger.warn(`[analise-ativos] ${recusa}`);
    return NextResponse.json({ job: def.nome, status: 'recusado', erro: recusa }, { status: 503 });
  }
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
