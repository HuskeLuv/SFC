import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { ensureDependentesTemplate } from '@/utils/cashflowTemplates';
import { lerPlanilhaImport } from '@/services/cashflow/import/importRequest';
import { mapFlcToCashflow } from '@/services/cashflow/import/mapFlcToCashflow';

/**
 * POST /api/cashflow/import/preview
 *
 * Recebe a planilha FLC (multipart/form-data: `file` = .xlsx, `ano` = ano-alvo)
 * e devolve o plano de importação SEM gravar nada — o commit é outra rota.
 * Arquivo processado só em memória (LGPD: nada é persistido no preview).
 */

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/import/preview',
    'POST',
  );

  const lido = await lerPlanilhaImport(request);
  if (!lido.ok) return lido.response;

  // A seção "Despesas com dependentes" mapeia para grupo template próprio —
  // garante que ele exista antes de montar a árvore (upgrade lazy).
  await ensureDependentesTemplate();
  const arvore = await getMergedCashflowGroups(targetUserId, lido.ano);
  const plan = mapFlcToCashflow(lido.parse, arvore);

  return NextResponse.json({ ano: lido.ano, arquivo: lido.arquivo, plan });
});
