/**
 * Cron da Análise de Ativos — classificação setorial da B3 (ClassifSetorial.xlsx) ⇒ asset_setores_b3.
 *
 * Agendado no template do Lightsail: domingo 05:30 UTC. Arquivo de ~16 KB; sha256 igual ao último
 * processado ⇒ só confirma o frescor. Ver src/services/analiseAtivos/b3/sincronizarB3Cadastro.ts.
 */
import { NextRequest } from 'next/server';
import { sincronizarB3Cadastro } from '@/services/analiseAtivos/b3/sincronizarB3Cadastro';
import { executarJobAnalise, respostaCron } from '@/services/analiseAtivos/jobs/executarJob';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireCronSecret } from '@/utils/cronAuth';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireCronSecret(request);
  const relatorio = await executarJobAnalise('b3-cadastro', (ctx) => sincronizarB3Cadastro(ctx), {
    prazoMs: 60_000,
  });
  return respostaCron(relatorio);
});
