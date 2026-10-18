/**
 * Cron da Análise de Ativos (Stocks e REITs, fatia B) — job 'criterios-eua': avalia os critérios
 * dos stocks e REITs do universo EUA (fundamentos SEC) nas janelas 3/5/10 e grava criteria_eval SÓ
 * das classes stock/reit (o gravador isolado da fatia 0 nunca apaga acao/fii). Só banco. Ver
 * src/services/analiseAtivos/calculo/executarCriteriosEua.ts.
 *
 * Em produção roda dentro do 'eua-diario' (11:25 UTC, processo separado via myfinance-job.sh); o
 * dry-run de uma versão de params usa o runner (rodar-job.ts criterios-eua --versao-params=N
 * --sem-aplicar). Esta rota fica para disparo manual (curl -m 300), com o gate das outras rotas de
 * cron: segredo do cron e recusa (503) com o RSS do servidor alto (job pesado). Os jobs EUA não
 * dependem de ANALISE_ATIVOS_EUA_HABILITADO (a carga de produção roda com as telas desligadas).
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
  const def = CATALOGO_JOBS['criterios-eua'];
  const recusa = recusaRotaPesada(def);
  if (recusa) {
    logger.warn(`[analise-ativos] ${recusa}`);
    return NextResponse.json({ job: def.nome, status: 'recusado', erro: recusa }, { status: 503 });
  }
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
