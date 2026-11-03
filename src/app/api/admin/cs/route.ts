import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import { getPainelCs } from '@/services/admin/cs';

/**
 * GET /api/admin/cs — painel de CS (clientes, ativação, engajamento).
 * Só `role === 'admin'` (403 para os demais). Somente leitura, sem valores financeiros.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const painel = await getPainelCs();
  return NextResponse.json(painel, { headers: { 'Cache-Control': 'no-store' } });
});
