import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { estadoAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/cashflow/orcamento/v2/acesso — `{estado, ativado}` do Orçamento v2 para o DONO DOS DADOS
 * (targetUserId: o cliente quando o consultor age). A página do Fluxo de Caixa mostra o v2 só com
 * `estado === 'liberada' && ativado`; em qualquer outro caso, a tela de hoje.
 *
 * Diferente das demais rotas /v2/*, nunca responde 404 (a página precisa da resposta mesmo com a
 * flag desligada: `{estado: 'desligada', ativado: false}`); sem sessão → 401. Cache-Control: no-store.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento/v2/acesso',
    'GET',
  );
  const corpo = await estadoAcessoOrcamentoV2(targetUserId);
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
});
