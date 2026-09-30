/**
 * Cron da Análise de Ativos (fatia D): proventos auditados, eventos verificados, per-share, múltiplos,
 * Índice MF e semáforo. Diário 10:10 UTC (depois de CVM, FII e da repescagem do COTAHIST), só banco.
 * Ver src/services/analiseAtivos/calculo/executarScores.ts.
 */
import { NextRequest } from 'next/server';
import { executarScores } from '@/services/analiseAtivos/calculo/executarScores';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('scores', (ctx) => executarScores(ctx));
  return respostaCron(r);
});
