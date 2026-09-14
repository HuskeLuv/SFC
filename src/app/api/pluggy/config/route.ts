import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAuth } from '@/utils/auth';
import { pluggyHabilitado, pluggyIncluiSandbox } from '@/lib/pluggyConfig';

/**
 * GET /api/pluggy/config — diz ao cliente se a integração bancária está
 * ligada (menu "Conexões bancárias" só aparece quando sim). Qualquer usuário
 * logado; nada sensível.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  requireAuth(request);
  return NextResponse.json(
    { habilitado: pluggyHabilitado(), incluiSandbox: pluggyIncluiSandbox() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
