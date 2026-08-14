/**
 * POST /api/cashflow/item/reorder — reordena as linhas de um grupo do fluxo
 * de caixa (pedido ago/2026).
 *
 * Recebe a lista COMPLETA de itemIds do grupo na nova ordem (como exibida —
 * ids do merge template+overrides). Itens de template são personalizados
 * (override via personalizeItem, que preserva demais campos) para que a
 * posição seja por usuário; cada linha recebe orderIndex = posição.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError, zString } from '@/utils/validation-schemas';
import { personalizeItem } from '@/utils/cashflowPersonalization';
import { recordChange } from '@/services/changeHistory';

const reorderSchema = z.object({
  groupId: zString(255),
  itemIds: z.array(zString(255)).min(2).max(300),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const parsed = reorderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { groupId, itemIds } = parsed.data;

  // O grupo precisa ser visível pelo usuário (template global ou dele).
  const group = await prisma.cashflowGroup.findFirst({
    where: { id: groupId, OR: [{ userId: targetUserId }, { userId: null }] },
    select: { id: true, name: true, userId: true, templateId: true },
  });
  if (!group) {
    return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
  }

  // Grupos aceitos por item: o próprio, o template dele ou overrides dele —
  // o merge normaliza groupId pro id final, mas as ROWS moram nas 2 camadas.
  const gruposDoPar = await prisma.cashflowGroup.findMany({
    where: {
      OR: [
        { id: groupId },
        ...(group.templateId ? [{ id: group.templateId }] : []),
        ...(group.userId === null ? [{ userId: targetUserId, templateId: groupId }] : []),
      ],
    },
    select: { id: true },
  });
  const groupIdsAceitos = new Set(gruposDoPar.map((g) => g.id));

  const rows = await prisma.cashflowItem.findMany({
    where: { id: { in: itemIds }, OR: [{ userId: targetUserId }, { userId: null }] },
    select: { id: true, userId: true, groupId: true, name: true },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  for (const id of itemIds) {
    const row = rowById.get(id);
    if (!row || !groupIdsAceitos.has(row.groupId)) {
      return NextResponse.json({ error: 'Item não pertence ao grupo informado' }, { status: 400 });
    }
  }

  // Personaliza templates fora da $transaction (personalizeItem tem a própria);
  // depois grava as posições de uma vez.
  const finalIds: string[] = [];
  for (const id of itemIds) {
    const row = rowById.get(id)!;
    finalIds.push(row.userId === null ? await personalizeItem(id, targetUserId) : id);
  }

  await prisma.$transaction(
    finalIds.map((id, index) =>
      prisma.cashflowItem.update({ where: { id }, data: { orderIndex: index + 1 } }),
    ),
  );

  await recordChange({
    request,
    auth,
    section: 'fluxo-caixa',
    action: 'itens.reordenar',
    entity: 'grupo',
    entityId: group.id,
    entityLabel: group.name,
    changes: [],
  });

  return NextResponse.json({ success: true, itemIds: finalIds });
});
