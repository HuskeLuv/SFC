import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { exigirAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import {
  carregarOrcamentoV2,
  hojeEmSaoPaulo,
} from '@/services/cashflow/orcamentoV2/carregarOrcamento';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/cashflow/orcamento/v2?ano=&mes=1-12&visao=mes|ano&fonte=lancado|consolidado
 *
 * Orçamento v2 do DONO DOS DADOS (targetUserId), já montado no servidor (`OrcamentoV2Response`:
 * referência/ritmo, receita prevista, KPIs, contadores, categorias e subcategorias com status).
 * Flag desligada ou usuário fora do beta → 404 (`exigirAcessoOrcamentoV2`); sem sessão → 401.
 *
 * Padrões: `ano`/`mes` = hoje em America/Sao_Paulo; `visao` = 'mes'; `fonte` = a salva nas prefs.
 * `visao=ano` é o acumulado jan..mês, somente leitura (Q7).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  ano: z.coerce.number().int().min(1900).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  visao: z.enum(['mes', 'ano']).default('mes'),
  fonte: z.enum(['lancado', 'consolidado']).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await exigirAcessoOrcamentoV2(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento/v2',
    'GET',
  );

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) throw new ApiError(400, 'Parâmetros inválidos');
  const q = parsed.data;

  const agora = new Date();
  const hoje = hojeEmSaoPaulo(agora);
  const corpo = await carregarOrcamentoV2(
    targetUserId,
    {
      ano: q.ano ?? hoje.ano,
      mes0: q.mes !== undefined ? q.mes - 1 : hoje.mes0,
      visao: q.visao,
      fonte: q.fonte,
    },
    agora,
  );
  return NextResponse.json(corpo, { headers: { 'Cache-Control': 'no-store' } });
});
