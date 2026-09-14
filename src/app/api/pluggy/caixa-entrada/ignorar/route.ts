import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { ignorar } from '@/services/pluggy/caixaEntrada';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';
import { idsSchema, registrarAcaoBanco } from '../_shared';

/** POST /api/pluggy/caixa-entrada/ignorar { ids } — some da Caixa de entrada sem ir ao fluxo. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = idsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed);
  const ids = await ignorar(user.id, parsed.data.ids, true);
  await registrarAcaoBanco(request, user, 'banco.ignorar', { ids }, ids.length);
  return NextResponse.json({ ignoradas: ids.length, ids });
});
