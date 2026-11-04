import { NextRequest } from 'next/server';
import { sincronizarFiInfraMensal } from '@/services/analiseAtivos/fii/sincronizarFiInfraMensal';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron HTTP (Análise de Ativos, FI-Infra leve): GET com Authorization: Bearer CRON_SECRET.
 * Informe diário de fundos (CVM) ⇒ FiiMonthly: fechamento dos 3 meses anteriores ao corrente dos
 * FI-Infra do mapa (PL, cota, cotas, cotistas; sem composição); pula por ETag. Linha de cron
 * (diário 09:50 UTC):
 * `50 9 * * * root /usr/local/bin/myfinance-cron.sh /api/cron/analise-ativos/fi-infra-mensal`.
 * Prazo interno de 180 s (3 zips de ~11 MB), lock por AnaliseJobRun. 200 ok/parcial/pulado, 500 falha.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRAZO_MS = 180_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('fi-infra-mensal', (ctx) => sincronizarFiInfraMensal(ctx), {
    prazoMs: PRAZO_MS,
  });
  return respostaCron(r);
});
