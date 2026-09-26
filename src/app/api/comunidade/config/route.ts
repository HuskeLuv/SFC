import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireSession } from '@/utils/auth';
import { comunidadeHabilitada } from '@/lib/comunidadeConfig';

/**
 * GET /api/comunidade/config — diz ao cliente se a comunidade está ligada
 * (o item "Comunidade" do menu só aparece quando sim).
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireSession(request);
  return NextResponse.json(
    { habilitada: comunidadeHabilitada() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
