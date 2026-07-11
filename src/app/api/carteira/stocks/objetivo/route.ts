import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { objetivoSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { assetEntityLabel, recordObjetivoClasseDefinido } from '@/services/changeHistory';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;
  const body = await request.json();
  const parsed = objetivoSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { ativoId, objetivo } = parsed.data;

  // Carrega o estado anterior + ticker: alimenta o diff e o rótulo do histórico.
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: ativoId, userId: targetUserId },
    include: { asset: { select: { symbol: true, name: true, source: true } } },
  });

  if (!portfolio) {
    return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
  }

  await prisma.portfolio.update({ where: { id: portfolio.id }, data: { objetivo } });

  await recordObjetivoClasseDefinido(request, auth, {
    classe: 'Stocks',
    ativoId,
    ticker: assetEntityLabel(portfolio.asset),
    objetivoAnterior: portfolio.objetivo,
    objetivo,
  });

  return NextResponse.json({
    success: true,
    message: 'Objetivo atualizado com sucesso',
  });
});
