/**
 * Cron da Análise de Ativos (Stocks e REITs) — job 'cotacoes-eua': fechamento diário EUA em
 * AssetQuoteDailyUs. Só com ANALISE_ATIVOS_EUA_PRECO_HABILITADO; sem a chave o job termina
 * 'pulado' sem consultar provedor. Ver src/services/analiseAtivos/eua/jobs/cotacoesEua.ts.
 *
 * Linha de cron (seg–sex 22:30 UTC) COMENTADA no template do Lightsail até a licença de exibição.
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
  const def = CATALOGO_JOBS['cotacoes-eua'];
  const r = await executarJobAnalise(def.nome, def.executar, { prazoMs: def.prazoMs });
  return respostaCron(r);
});
