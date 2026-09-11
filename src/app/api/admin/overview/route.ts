import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import { getAdminOverview } from '@/services/admin/overview';

/**
 * GET /api/admin/overview — visão consolidada do painel administrativo.
 * Só `role === 'admin'` (403 para os demais). Somente leitura.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireAdmin(request);
  const overview = await getAdminOverview();
  return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } });
});
