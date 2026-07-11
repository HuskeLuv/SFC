import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { cashflowValuePatchSchema, validationError } from '@/utils/validation-schemas';
import {
  recordChange,
  diffFields,
  CASHFLOW_FIELD_LABELS,
  type ChangeSnapshot,
  type FieldChange,
} from '@/services/changeHistory';

import { withErrorHandler } from '@/utils/apiErrorHandler';

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
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
  const { itemId, field, value, monthIndex, year } = parsed.data;
  const targetYear = year ?? new Date().getFullYear();

  // Ensure item is personalized (creates a copy if it's a template)
  let finalItemId: string;
  // Estado anterior do item (nome/significado/rank) — já carregado pela
  // personalização; usado apenas para o diff do histórico de alterações.
  let itemBefore: { name: string; significado: string | null; rank: string | null };
  try {
    ({ itemId: finalItemId, item: itemBefore } = await ensurePersonalizedItem(
      itemId,
      targetUserId,
    ));
  } catch {
    return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  }

  // Linhas vinculadas a um sonho são somente-leitura aqui: o aporte é definido
  // no Planejamento de Sonhos (fonte da verdade) e sincronizado de lá.
  const linkedItem = await prisma.cashflowItem.findUnique({
    where: { id: finalItemId },
    select: { objetivoId: true },
  });
  if (linkedItem?.objetivoId) {
    return NextResponse.json(
      { error: 'Esta linha é vinculada a um sonho. Edite no Planejamento de Sonhos.' },
      { status: 409 },
    );
  }

  let updatedItem;
  // Histórico de alterações: diffs (quando o estado anterior já está carregado)
  // e referência de período para o rótulo ("mar/2026" ou "2026").
  let changes: FieldChange[] | undefined;
  let periodLabel: string | null = null;
  // Locator da célula (item × ano × mês) + valor anterior — permite desfazer.
  let snapshot: ChangeSnapshot | undefined;

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

    changes = diffFields(itemBefore, updateData, CASHFLOW_FIELD_LABELS);
  } else if (field === 'monthlyValue' && typeof monthIndex === 'number') {
    // Update monthly value
    const existingValue = await prisma.cashflowValue.findFirst({
      where: {
        itemId: finalItemId,
        userId: targetUserId,
        year: targetYear,
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
          year: targetYear,
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

    changes = diffFields(
      { monthlyValue: existingValue?.value ?? null },
      { monthlyValue: numericValue },
      CASHFLOW_FIELD_LABELS,
    );
    periodLabel = `${MESES_ABREV[monthIndex]}/${targetYear}`;
    snapshot = {
      v: 1,
      kind: 'cashflow-valor',
      data: { value: existingValue?.value ?? null },
      meta: { itemId: finalItemId, year: targetYear, month: monthIndex },
    };
  } else if (field === 'annualTotal') {
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
          year: targetYear,
        },
      });

      await tx.cashflowValue.createMany({
        data: Array.from({ length: 12 }, (_, month) => ({
          itemId: finalItemId,
          userId: targetUserId,
          year: targetYear,
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

    // Sem estado anterior carregado (valores antigos são deletados às cegas) —
    // registra a edição sem diff.
    changes = undefined;
    periodLabel = String(targetYear);
  } else {
    return NextResponse.json({ error: 'Campo inválido' }, { status: 400 });
  }

  if (!updatedItem) {
    return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  }

  await recordChange({
    request,
    auth,
    section: 'fluxo-caixa',
    action: 'valor.editar',
    entity: 'item',
    entityId: finalItemId,
    entityLabel: periodLabel ? `${updatedItem.name} · ${periodLabel}` : updatedItem.name,
    changes,
    snapshot,
  });

  return NextResponse.json(updatedItem);
});
