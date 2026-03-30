import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';
import { valorAtualizadoReservaSchema, validationError } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  const body = await request.json();
  const parsed = valorAtualizadoReservaSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { portfolioId, valorAtualizado } = parsed.data;

  // Buscar o portfolio
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    include: { asset: true },
  });

  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio não encontrado' }, { status: 404 });
  }

  // Verificar se é do usuário correto
  if (portfolio.userId !== targetUserId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  // Verificar se é uma reserva (emergency ou opportunity)
  const isReserva =
    portfolio.asset?.type === 'emergency' ||
    portfolio.asset?.type === 'opportunity' ||
    portfolio.asset?.symbol === 'RESERVA-EMERG' ||
    portfolio.asset?.symbol === 'RESERVA-OPORT';

  if (!isReserva) {
    return NextResponse.json(
      { error: 'Esta API é apenas para reservas de emergência e oportunidade' },
      { status: 400 },
    );
  }

  // Atualizar avgPrice e totalInvested para manter consistência entre resumo e tabs
  // Para reservas, quantity geralmente é 1, então avgPrice = totalInvested = valorAtualizado
  const quantity = portfolio.quantity || 1;
  await prisma.portfolio.update({
    where: { id: portfolioId },
    data: {
      avgPrice: quantity > 0 ? valorAtualizado / quantity : valorAtualizado,
      totalInvested: valorAtualizado,
      lastUpdate: new Date(),
    },
  });

  const result = NextResponse.json({
    success: true,
    message: 'Valor atualizado com sucesso',
  });

  // Registrar log se estiver personificado
  if (actingClient) {
    await logDataUpdate(
      request,
      { id: payload.id, role: payload.role },
      targetUserId,
      actingClient,
      '/api/carteira/reserva/valor-atualizado',
      'PATCH',
      body,
      { success: true },
    );
  }

  return result;
});
