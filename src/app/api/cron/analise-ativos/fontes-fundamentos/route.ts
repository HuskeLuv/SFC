/**
 * Cron da Análise de Ativos v2.5 — job 'fontes-fundamentos': ingestão point-in-time dos conectores
 * de fundamentos habilitados em ANALISE_FONTES_INGESTAO (provedor pago). Sem conector habilitado (o
 * padrão), termina 'pulado'. Ver src/services/analiseAtivos/fontes/fundamentos/ingerirFontes.ts.
 *
 * A linha de cron (10:20 UTC, antes do 'criterios') fica COMENTADA no template do Lightsail até
 * haver contrato. Esta rota serve ao disparo manual (curl -m 300), com o segredo do cron. A rota
 * nunca é chamada pela tela: a renderização só lê o banco.
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
  const def = CATALOGO_JOBS['fontes-fundamentos'];
  const recusa = recusaRotaPesada(def);
  if (recusa) {
    logger.warn(`[analise-ativos] ${recusa}`);
    return NextResponse.json({ job: def.nome, status: 'recusado', erro: recusa }, { status: 503 });
  }
  const r = await executarJobAnalise(def.nome, (ctx) => def.executar(ctx), {
    prazoMs: def.prazoMs,
  });
  return respostaCron(r);
});
