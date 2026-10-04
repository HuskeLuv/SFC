/**
 * Cron da Análise de Ativos — bloco C: job 'curadoria' (abre/atualiza os casos de regra a partir das
 * flags conf:/rev: das linhas do Quadro, autorresolve só caso de regra pura cujo campo voltou a ok e
 * manda o resumo diário de prazos aos admins). Só banco. Ver
 * src/services/analiseAtivos/curadoria/sincronizarCasos.ts.
 *
 * Em produção roda pela linha de cron do template do Lightsail às 10:55 UTC (depois do quadro, em
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
  const def = CATALOGO_JOBS.curadoria;
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
