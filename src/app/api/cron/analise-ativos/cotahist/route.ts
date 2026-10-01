/**
 * Cron da Análise de Ativos — COTAHIST diário da B3 ⇒ asset_quotes_daily + asset_quote_resumo.
 *
 * Agendado no template do Lightsail (UTC): seg–sex 23:05 e repescagem ter–sáb 09:55 (fora do minuto 0
 * do market-data/refresh). Chamado por curl -m 300: prazo interno de 180 s (spec jobs.prazoS); o que
 * faltar fica para o próximo run (status 'parcial'). Ver
 * src/services/analiseAtivos/b3/sincronizarCotahist.ts.
 */
import { NextRequest } from 'next/server';
import { sincronizarCotahist } from '@/services/analiseAtivos/b3/sincronizarCotahist';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const relatorio = await executarJobAnalise('cotahist', (ctx) => sincronizarCotahist(ctx), {
    prazoMs: 180_000,
  });
  return respostaCron(relatorio);
});
