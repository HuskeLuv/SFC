/**
 * Cron da Análise de Ativos: IPE da CVM (diário 09:25 UTC; GET com Authorization: Bearer CRON_SECRET).
 *
 * Baixa ipe_cia_aberta do ano corrente (pula por ETag/sha256), grava assembleias (AGO/AGE) dos
 * emissores do universo e as datas de resultado (real e estimada) em asset_eventos. Anos anteriores
 * só por scripts/analise-ativos/backfill-ipe.ts. Linha de cron no template do Lightsail
 * (infra/modules/lightsail/provision.sh.tftpl); ver docs/analise-ativos/fase0/RUNBOOK.md.
 */
import type { NextRequest } from 'next/server';
import { sincronizarIpe } from '@/services/analiseAtivos/eventos/sincronizarIpe';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** prazo interno do job = 120 s (spec: jobs[cvm-ipe].prazoS) */
const PRAZO_MS = 120_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const r = await executarJobAnalise('cvm-ipe', (ctx) => sincronizarIpe(ctx), {
    prazoMs: PRAZO_MS,
  });
  return respostaCron(r);
});
