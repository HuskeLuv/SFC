import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { listarPendentes } from '@/services/pluggy/caixaEntrada';
import { requireProprioUsuarioPluggy } from '../_lib/auth';

/** GET /api/pluggy/caixa-entrada?page&limit — transações importadas ainda não aplicadas, com sugestão. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
  const r = await listarPendentes(user.id, {
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
});
