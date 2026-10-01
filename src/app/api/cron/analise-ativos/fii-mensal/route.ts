import { NextRequest } from 'next/server';
import { sincronizarFiiMensal } from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron HTTP (Análise de Ativos, fatia B): GET com Authorization: Bearer CRON_SECRET.
 * Informe Mensal de FII (CVM) ⇒ FiiMonthly: últimos 3 meses de cada CNPJ do mapa; pula por ETag.
 * Agendado no template do Lightsail (diário 09:35 UTC); prazo interno de 120 s, lock por AnaliseJobRun.
 * 200 para ok/parcial/pulado, 500 para falha (o relatório do job vai no corpo).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRAZO_MS = 120_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('fii-mensal', (ctx) => sincronizarFiiMensal(ctx), {
    prazoMs: PRAZO_MS,
  });
  return respostaCron(r);
});
