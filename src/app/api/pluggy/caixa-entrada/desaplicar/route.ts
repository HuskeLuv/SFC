import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { prisma } from '@/lib/prisma';
import { desaplicar } from '@/services/pluggy/caixaEntrada';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';
import { idsSchema, registrarAcaoBanco } from '../_shared';

/** POST /api/pluggy/caixa-entrada/desaplicar { ids } — tira do fluxo; volta a pendente. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const parsed = idsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed);
  // Guarda o item de cada uma ANTES de soltar: é o que o desfazer reaplica.
  const antes = await prisma.bankTransaction.findMany({
    where: { id: { in: parsed.data.ids }, userId: user.id, cashflowItemId: { not: null } },
    select: { id: true, cashflowItemId: true },
  });
  const r = await desaplicar(user.id, parsed.data.ids);
  await registrarAcaoBanco(
    request,
    user,
    'banco.desaplicar',
    { aplicacoes: antes.map((t) => ({ id: t.id, itemId: t.cashflowItemId })) },
    r.aplicadas,
  );
  return NextResponse.json(r);
});
