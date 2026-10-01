import { NextRequest } from 'next/server';
import { sincronizarFiiTrimestral } from '@/services/analiseAtivos/fii/sincronizarFiiTrimestral';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron HTTP (Análise de Ativos, fatia B): GET com Authorization: Bearer CRON_SECRET.
 * Informe Trimestral de FII (CVM) ⇒ FiiQuarterly; pula por ETag (efetivo ~60 dias após cada trimestre).
 * Agendado no template do Lightsail (diário 09:45 UTC); prazo interno de 120 s, lock por AnaliseJobRun.
 * 200 para ok/parcial/pulado, 500 para falha (o relatório do job vai no corpo).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRAZO_MS = 120_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('fii-trimestral', (ctx) => sincronizarFiiTrimestral(ctx), {
    prazoMs: PRAZO_MS,
  });
  return respostaCron(r);
});
