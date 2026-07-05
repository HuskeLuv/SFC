import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { objetivoSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { recordObjetivoClasseDefinido } from '@/services/changeHistory';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;
  const body = await request.json();
  const parsed = objetivoSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { ativoId, objetivo } = parsed.data;

  const updateResult = await prisma.portfolio.updateMany({
    where: { id: ativoId, userId: targetUserId },
    data: { objetivo },
  });

  if (updateResult.count === 0) {
    return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
  }

  await recordObjetivoClasseDefinido(request, auth, { classe: 'Previdência e Seguros', ativoId });

  return NextResponse.json({
    success: true,
    message: 'Objetivo atualizado com sucesso',
  });
});
