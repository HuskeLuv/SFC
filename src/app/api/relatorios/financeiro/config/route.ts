import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireSession } from '@/utils/auth';
import { relatorioFinanceiroHabilitado } from '@/lib/relatorioFinanceiroConfig';
import type { RelatorioFinanceiroConfig } from '@/types/relatorioFinanceiro';

/**
 * GET /api/relatorios/financeiro/config — diz ao cliente se o Relatório financeiro está ligado
 * (o subitem "Relatório financeiro" do menu só aparece quando sim).
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireSession(request);
  const body: RelatorioFinanceiroConfig = { habilitado: relatorioFinanceiroHabilitado() };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
