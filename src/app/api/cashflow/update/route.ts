import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess, logDataUpdate } from '@/services/impersonationLogger';
import {
  personalizeGroup,
  personalizeItem,
  getItemForUser,
  getGroupForUser,
} from '@/utils/cashflowPersonalization';
import { cashflowUpdateSchema, validationError } from '@/utils/validation-schemas';

import { withErrorHandler } from '@/utils/apiErrorHandler';
/**
 * PATCH /api/cashflow/update
 *
 * Recebe alterações de grupos, subgrupos ou itens.
 *
 * Se o item/grupo for padrão (template), cria uma cópia personalizada.
 * Atualiza ou remove apenas itens/grupos pertencentes ao usuário.
 *
 * Body:
 * {
 *   operation: 'create' | 'update' | 'delete',
 *   type: 'group' | 'item',
 *   id?: string, // ID do template ou personalizado (para update/delete)
 *   data: {
 *     // Para grupos
 *     name?: string,
 *     type?: 'entrada' | 'despesa' | 'investimento',
 *     orderIndex?: number,
 *     parentId?: string | null,
 *
 *     // Para itens
 *     groupId?: string,
 *     name?: string,
 *     significado?: string,
 *     rank?: string,
 *   }
 * }
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/update',
    'PATCH',
  );

  const requestBody = await request.json();
  const parsed = cashflowUpdateSchema.safeParse(requestBody);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { operation, type, id, data } = parsed.data;

  // Operações com grupos
  let result;
  if (type === 'group') {
    result = await handleGroupOperation(operation, id, (data || {}) as GroupData, targetUserId);
  } else if (type === 'item') {
    result = await handleItemOperation(operation, id, (data || {}) as ItemData, targetUserId);
  } else {
    return NextResponse.json({ error: 'Tipo não suportado' }, { status: 400 });
  }

  // Registrar log detalhado se estiver personificado
  if (actingClient) {
    await logDataUpdate(
      request,
      { id: payload.id, role: payload.role },
      targetUserId,
      actingClient,
      '/api/cashflow/update',
      'PATCH',
      { operation, type, id, data },
      { success: result.status === 200 || result.status === 201 },
    );
  }

  return result;
});

/**
 * Processa operações com grupos
 */
interface GroupData {
  name?: string;
  type?: string;
  parentId?: string | null;
  orderIndex?: number | null;
}

interface ItemData {
  name?: string;
  groupId?: string;
  rank?: string | null;
  significado?: string | null;
}

async function handleGroupOperation(
  operation: string,
  id: string | undefined,
  data: GroupData,
  userId: string,
) {
  if (operation === 'create') {
    // Criar novo grupo personalizado
    if (!data.name || !data.type) {
      return NextResponse.json(
        { error: 'name e type são obrigatórios para criar grupo' },
        { status: 400 },
      );
    }

    const newGroup = await prisma.cashflowGroup.create({
      data: {
        userId,
        name: data.name,
        type: data.type,
        orderIndex: data.orderIndex || 0,
        parentId: data.parentId || null,
      },
      include: {
        items: true,
        children: true,
      },
    });

    return NextResponse.json({ success: true, group: newGroup });
  }

  if (operation === 'update') {
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório para atualizar' }, { status: 400 });
    }

    // Buscar grupo (pode ser template ou personalizado)
    const group = await getGroupForUser(id, userId);
    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    // Se é template, criar cópia personalizada
    let finalGroupId = group.id;
    if (group.userId === null) {
      finalGroupId = await personalizeGroup(group.id, userId);
    }

    // Atualizar apenas grupos personalizados do usuário
    const updateData: Prisma.CashflowGroupUncheckedUpdateInput = {};
    if (data.name) updateData.name = data.name;
    if (data.type) updateData.type = data.type;
    if (data.orderIndex !== undefined && data.orderIndex !== null)
      updateData.orderIndex = data.orderIndex;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;

    const updatedGroup = await prisma.cashflowGroup.update({
      where: {
        id: finalGroupId,
        userId, // Garantir que só atualiza grupos do usuário
      },
      data: updateData,
      include: {
        items: true,
        children: true,
      },
    });

    return NextResponse.json({ success: true, group: updatedGroup });
  }

  if (operation === 'delete') {
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório para deletar' }, { status: 400 });
    }

    // Verificar se grupo existe e pertence ao usuário
    const group = await prisma.cashflowGroup.findFirst({
      where: {
        id,
        userId, // Só pode deletar grupos personalizados
      },
      include: {
        items: true,
        children: true,
      },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Grupo não encontrado ou não pertence ao usuário' },
        { status: 404 },
      );
    }

    // Verificar se tem filhos ou itens
    // Buscar filhos e itens recursivamente
    const getAllChildren = async (groupId: string): Promise<string[]> => {
      const children = await prisma.cashflowGroup.findMany({
        where: { parentId: groupId, userId },
        select: { id: true },
      });
      let allChildren = [...children.map((c) => c.id)];
      for (const child of children) {
        const grandChildren = await getAllChildren(child.id);
        allChildren = [...allChildren, ...grandChildren];
      }
      return allChildren;
    };

    const childrenIds = await getAllChildren(id);
    if (childrenIds.length > 0) {
      return NextResponse.json(
        { error: 'Não é possível deletar grupo com subgrupos. Delete os subgrupos primeiro.' },
        { status: 400 },
      );
    }

    const itemsCount = await prisma.cashflowItem.count({
      where: { groupId: id, userId },
    });

    if (itemsCount > 0) {
      return NextResponse.json(
        { error: 'Não é possível deletar grupo com itens. Delete os itens primeiro.' },
        { status: 400 },
      );
    }

    // Deletar grupo
    await prisma.cashflowGroup.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Grupo deletado com sucesso' });
  }

  return NextResponse.json({ error: 'Operação não suportada' }, { status: 400 });
}

/**
 * Processa operações com itens
 */
async function handleItemOperation(
  operation: string,
  id: string | undefined,
  data: ItemData,
  userId: string,
) {
  if (operation === 'create') {
    // Criar novo item personalizado
    if (!data.groupId || !data.name) {
      return NextResponse.json(
        { error: 'groupId e name são obrigatórios para criar item' },
        { status: 400 },
      );
    }

    // Verificar se grupo existe (pode ser template ou personalizado)
    const group = await getGroupForUser(data.groupId, userId);
    if (!group) {
      return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
    }

    // Se grupo é template, personalizar primeiro
    let finalGroupId = group.id;
    if (group.userId === null) {
      finalGroupId = await personalizeGroup(group.id, userId);
    }

    // Rank agora é texto, não precisa calcular
    const newRank = null;

    // Criar novo item (sempre personalizado quando criado pelo usuário)
    const newItem = await prisma.cashflowItem.create({
      data: {
        userId,
        groupId: finalGroupId,
        name: data.name,
        significado: data.significado || null,
        rank: data.rank || newRank,
      },
      include: {
        values: {
          where: { userId },
        },
      },
    });

    return NextResponse.json({ success: true, item: newItem });
  }

  if (operation === 'update') {
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório para atualizar' }, { status: 400 });
    }

    // Buscar item (pode ser template ou personalizado)
    const item = await getItemForUser(id, userId);
    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    // Se é template, criar cópia personalizada
    let finalItemId = item.id;
    if (item.userId === null) {
      finalItemId = await personalizeItem(item.id, userId);
    }

    // Atualizar apenas itens personalizados do usuário
    const updatedItem = await prisma.cashflowItem.update({
      where: {
        id: finalItemId,
        userId, // Garantir que só atualiza itens do usuário
      },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.significado !== undefined && { significado: data.significado }),
        ...(data.rank !== undefined && { rank: data.rank }),
        ...(data.groupId && { groupId: data.groupId }),
      },
      include: {
        values: {
          where: { userId },
        },
      },
    });

    return NextResponse.json({ success: true, item: updatedItem });
  }

  if (operation === 'delete') {
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório para deletar' }, { status: 400 });
    }

    // Verificar se item existe e pertence ao usuário
    const item = await prisma.cashflowItem.findFirst({
      where: {
        id,
        userId, // Só pode deletar itens personalizados
      },
      include: {
        values: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Item não encontrado ou não pertence ao usuário' },
        { status: 404 },
      );
    }

    // Deletar valores e item em uma única transação
    await prisma.$transaction([
      prisma.cashflowValue.deleteMany({ where: { itemId: id } }),
      prisma.cashflowItem.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true, message: 'Item deletado com sucesso' });
  }

  return NextResponse.json({ error: 'Operação não suportada' }, { status: 400 });
}
