import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { cashflowValuePatchSchema, validationError } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/values',
    'PATCH',
  );

  const body = await request.json();
  const parsed = cashflowValuePatchSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { itemId, field, value, monthIndex } = parsed.data;

  // Ensure item is personalized (creates a copy if it's a template)
  let finalItemId: string;
  try {
    ({ itemId: finalItemId } = await ensurePersonalizedItem(itemId, targetUserId));
  } catch {
    return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  }

  let updatedItem;

  if (field === 'name' || field === 'descricao' || field === 'significado' || field === 'rank') {
    // Update item fields
    const updateData: {
      name?: string;
      significado?: string;
      rank?: string | null;
    } = {};
    if (field === 'name' || field === 'descricao') updateData.name = value as string;
    if (field === 'significado') updateData.significado = value as string;
    if (field === 'rank') {
      updateData.rank = value === '' || value === null ? null : String(value);
    }

    updatedItem = await prisma.cashflowItem.update({
      where: {
        id: finalItemId,
      },
      data: updateData,
      include: {
        values: {
          where: { userId: targetUserId },
        },
      },
    });
  } else if (field === 'monthlyValue' && typeof monthIndex === 'number') {
    const currentYear = new Date().getFullYear();

    // Update monthly value
    const existingValue = await prisma.cashflowValue.findFirst({
      where: {
        itemId: finalItemId,
        userId: targetUserId,
        year: currentYear,
        month: monthIndex,
      },
    });

    const numericValue = parseFloat(String(value));
    if (!Number.isFinite(numericValue)) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    if (existingValue) {
      // Update existing value
      await prisma.cashflowValue.update({
        where: { id: existingValue.id },
        data: { value: numericValue },
      });
    } else {
      // Create new value
      await prisma.cashflowValue.create({
        data: {
          itemId: finalItemId,
          userId: targetUserId,
          year: currentYear,
          month: monthIndex,
          value: numericValue,
        },
      });
    }

    updatedItem = await prisma.cashflowItem.findUnique({
      where: { id: finalItemId },
      include: {
        values: {
          where: { userId: targetUserId },
        },
      },
    });
  } else if (field === 'annualTotal') {
    const currentYear = new Date().getFullYear();
    const annualTotal = parseFloat(String(value));
    if (!Number.isFinite(annualTotal)) {
      return NextResponse.json({ error: 'Valor anual inválido' }, { status: 400 });
    }
    const monthlyValue = annualTotal / 12;

    // Deletar valores existentes e criar novos em uma única transação
    await prisma.$transaction(async (tx) => {
      await tx.cashflowValue.deleteMany({
        where: {
          itemId: finalItemId,
          userId: targetUserId,
          year: currentYear,
        },
      });

      await tx.cashflowValue.createMany({
        data: Array.from({ length: 12 }, (_, month) => ({
          itemId: finalItemId,
          userId: targetUserId,
          year: currentYear,
          month,
          value: monthlyValue,
        })),
      });
    });

    updatedItem = await prisma.cashflowItem.findUnique({
      where: { id: finalItemId },
      include: {
        values: {
          where: { userId: targetUserId },
        },
      },
    });
  } else {
    return NextResponse.json({ error: 'Campo inválido' }, { status: 400 });
  }

  if (!updatedItem) {
    return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  }

  return NextResponse.json(updatedItem);
});
