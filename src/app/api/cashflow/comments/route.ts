import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { getItemForUser, ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { cashflowCommentSchema, validationError } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
/**
 * GET /api/cashflow/comments
 * Busca comentário de uma célula específica
 * Query params: itemId, month, year
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/comments',
    'GET',
  );

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  const month = searchParams.get('month');
  const year = searchParams.get('year');

  if (!itemId || month === null || year === null) {
    return NextResponse.json(
      { error: 'Parâmetros obrigatórios: itemId, month, year' },
      { status: 400 },
    );
  }

  // Buscar item (pode ser template ou personalizado)
  const item = await getItemForUser(itemId, targetUserId);
  if (!item) {
    return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  }

  // Se é template, usar item personalizado se existir
  let finalItemId = item.id;
  if (item.userId === null) {
    // Tentar encontrar item personalizado
    const personalizedItem = await prisma.cashflowItem.findFirst({
      where: {
        name: item.name,
        groupId: item.groupId,
        userId: targetUserId,
      },
    });
    if (personalizedItem) {
      finalItemId = personalizedItem.id;
    }
  }

  const monthIndex = parseInt(month, 10);
  const yearInt = parseInt(year, 10);

  if (isNaN(monthIndex) || isNaN(yearInt) || monthIndex < 0 || monthIndex > 11) {
    return NextResponse.json(
      { error: 'Parâmetros inválidos: month deve ser 0-11, year deve ser um número' },
      { status: 400 },
    );
  }

  // Buscar valor mensal e seu comentário
  const cashflowValue = await prisma.cashflowValue.findFirst({
    where: {
      itemId: finalItemId,
      userId: targetUserId,
      year: yearInt,
      month: monthIndex,
    },
    select: {
      id: true,
      comment: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    comment: cashflowValue?.comment || null,
    updatedAt: cashflowValue?.updatedAt || null,
  });
});

/**
 * PATCH /api/cashflow/comments
 * Salva ou atualiza comentário de uma célula específica
 * Body: { itemId, month, year, comment }
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/comments',
    'PATCH',
  );

  const body = await request.json();
  const parsed = cashflowCommentSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { itemId, month, year, comment } = parsed.data;

  // Ensure item is personalized (creates a copy if it's a template)
  let finalItemId: string;
  try {
    ({ itemId: finalItemId } = await ensurePersonalizedItem(itemId, targetUserId));
  } catch (error: unknown) {
    console.error('Erro ao personalizar item:', error);
    if (error instanceof Error && error.message.includes('Usuário não encontrado')) {
      return NextResponse.json(
        { error: 'Sessão inválida. Por favor, faça login novamente.' },
        { status: 401 },
      );
    }
    if (error instanceof Error && error.message === 'Item não encontrado') {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao personalizar item.' },
      { status: 500 },
    );
  }

  // Normalizar comment (null se string vazia, trim se não vazio)
  const normalizedComment =
    typeof comment === 'string' && comment.trim() === '' ? null : comment || null;

  // Buscar ou criar CashflowValue
  const existingValue = await prisma.cashflowValue.findFirst({
    where: {
      itemId: finalItemId,
      userId: targetUserId,
      year: year,
      month: month,
    },
  });

  if (existingValue) {
    // Atualizar comentário existente
    const updatedValue = await prisma.cashflowValue.update({
      where: { id: existingValue.id },
      data: { comment: normalizedComment },
      select: {
        id: true,
        comment: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      comment: updatedValue.comment,
      updatedAt: updatedValue.updatedAt,
    });
  } else {
    // Se não existe valor, criar um com valor 0 e o comentário
    // Primeiro buscar o valor original do item para usar como padrão
    const defaultValue = 0;

    const newValue = await prisma.cashflowValue.create({
      data: {
        itemId: finalItemId,
        userId: targetUserId,
        year: year,
        month: month,
        value: defaultValue,
        comment: normalizedComment,
      },
      select: {
        id: true,
        comment: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      comment: newValue.comment,
      updatedAt: newValue.updatedAt,
    });
  }
});
