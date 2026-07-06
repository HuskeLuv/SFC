import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { ensureContaCorrenteTemplate } from '@/utils/cashflowTemplates';

import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * GET /api/cashflow
 *
 * Retorna a hierarquia completa de fluxo de caixa:
 * - Grupos → Subgrupos → Itens → Valores
 *
 * Combina templates padrão (userId = null) com personalizações (userId = currentUser.id),
 * dando preferência aos personalizados.
 *
 * Query params:
 * - year (opcional): Filtrar valores por ano. Padrão: ano atual
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  // Registrar acesso se estiver personificado
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow',
    'GET',
    yearParam ? { year: yearParam } : {},
  );

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (isNaN(year)) {
    return NextResponse.json({ error: 'Ano inválido' }, { status: 400 });
  }

  // Upgrade lazy de template: bancos antigos não têm o grupo "Conta Corrente".
  await ensureContaCorrenteTemplate();

  // Templates padrão + personalizações do usuário, mesclados (override layer).
  const mergedGroups = await getMergedCashflowGroups(targetUserId, year);

  return NextResponse.json({
    year,
    groups: mergedGroups,
  });
});

// POST pode ser adaptado depois para criar itens/valores/grupos
