import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { aplicar } from '@/services/pluggy/caixaEntrada';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';
import { aplicacoesSchema, registrarAcaoBanco } from '../_shared';

/** POST /api/pluggy/caixa-entrada/aplicar { aplicacoes: [{ id, itemId }] } */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = aplicacoesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed);
  const r = await aplicar(user.id, parsed.data.aplicacoes);
  await registrarAcaoBanco(request, user, 'banco.aplicar', { ids: r.ids }, r.aplicadas);
  return NextResponse.json(r);
});
