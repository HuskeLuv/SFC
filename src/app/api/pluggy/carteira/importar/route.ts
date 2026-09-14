import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { importarPendentes } from '@/services/pluggy/importarCarteira';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';

/** POST /api/pluggy/carteira/importar — importa o que estiver pendente (normalmente já foi no sync). */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const r = await importarPendentes(user.id);
  return NextResponse.json(r);
});
