/**
 * Cron da Análise de Ativos — Fase 1: job 'quadro' (materializa analise_quadro_linhas para o
 * Quadro, a busca e a página do ativo). Só banco. Ver src/services/analiseAtivos/quadro/gerarQuadro.ts.
 *
 * Em produção roda pela linha de cron do template do Lightsail às 10:40 UTC (depois do scores, em
 * processo separado via myfinance-job.sh). Esta rota fica para disparo manual (curl -m 300).
 */
import { NextRequest } from 'next/server';
import { CATALOGO_JOBS } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const def = CATALOGO_JOBS.quadro;
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
