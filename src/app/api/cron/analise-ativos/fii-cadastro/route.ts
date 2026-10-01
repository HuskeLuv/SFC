import { NextRequest } from 'next/server';
import { sincronizarFiiCadastro } from '@/services/analiseAtivos/fii/sincronizarFiiCadastro';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

/**
 * Cron HTTP (Análise de Ativos, fatia B): GET com Authorization: Bearer CRON_SECRET.
 * Lista pública de FIIs da B3 ⇒ FiiTickerMap (ticker ↔ CNPJ com vigência).
 * Agendado no template do Lightsail (dom 05:40 UTC (semanal)); prazo interno de 120 s, lock por AnaliseJobRun.
 * 200 para ok/parcial/pulado, 500 para falha (o relatório do job vai no corpo).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRAZO_MS = 120_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('fii-cadastro', (ctx) => sincronizarFiiCadastro(ctx), {
    prazoMs: PRAZO_MS,
  });
  return respostaCron(r);
});
