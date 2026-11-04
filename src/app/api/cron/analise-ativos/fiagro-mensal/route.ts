import { NextRequest } from 'next/server';
import { sincronizarFiagroMensal } from '@/services/analiseAtivos/fii/sincronizarFiagroMensal';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron HTTP (Análise de Ativos, Fiagro): GET com Authorization: Bearer CRON_SECRET.
 * Informe Mensal de Fiagro (CVM) ⇒ FiiMonthly: os 3 meses anteriores ao corrente dos Fiagros do
 * mapa (analisados como FII de papel); pula por ETag. Linha de cron (diário 09:40 UTC, depois do
 * fii-mensal): `40 9 * * * root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/fiagro-mensal`.
 * Prazo interno de 120 s, lock por AnaliseJobRun. 200 para ok/parcial/pulado, 500 para falha.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRAZO_MS = 120_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('fiagro-mensal', (ctx) => sincronizarFiagroMensal(ctx), {
    prazoMs: PRAZO_MS,
  });
  return respostaCron(r);
});
