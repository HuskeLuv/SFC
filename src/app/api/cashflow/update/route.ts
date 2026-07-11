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
  hideTemplateGroup,
  hideTemplateItem,
} from '@/utils/cashflowPersonalization';
import { cashflowUpdateSchema, validationError } from '@/utils/validation-schemas';
import {
  recordChange,
  diffFields,
  finalStateChanges,
  CASHFLOW_FIELD_LABELS,
  CASHFLOW_GRUPO_FIELD_LABELS,
  type ChangeSnapshot,
  type FieldChange,
} from '@/services/changeHistory';

import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * O que a operação efetivamente fez — alimenta o histórico de alterações com
 * diff/snapshot fiéis à camada de override (template → override/tombstone),
 * que o payload da requisição sozinho não revela.
 */
interface RecordOutcome {
  entityId?: string;
  entityLabel?: string;
  changes?: FieldChange[];
  snapshot?: ChangeSnapshot;
}
/**
 * PATCH /api/cashflow/update
 *
 * Recebe alterações de grupos, subgrupos ou itens.
 *
 * Override Layer:
 *  - update em template → cria override (linha vinculada via templateId) e
 *    aplica o update sobre ele atomicamente.
 *  - delete em template → cria tombstone (override com hidden=true). O template
 *    permanece intacto, apenas some do tree do usuário.
 *  - delete em override (linha do usuário com templateId) → DELETE simples,
 *    efetivamente "revertendo para o template".
 *  - delete em row puramente do usuário (sem templateId) → DELETE simples.
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
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
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
  let outcome: RecordOutcome = {};
  if (type === 'group') {
    ({ response: result, outcome } = await handleGroupOperation(
      operation,
      id,
      (data || {}) as GroupData,
      targetUserId,
    ));
  } else if (type === 'item') {
    ({ response: result, outcome } = await handleItemOperation(
      operation,
      id,
      (data || {}) as ItemData,
      targetUserId,
    ));
  } else {
    return NextResponse.json({ error: 'Tipo não suportado' }, { status: 400 });
  }

  // Histórico de alterações — só após a mutação ter sucesso, com o outcome
  // real da camada de override (diff, snapshot e id final).
  if (result.status >= 200 && result.status < 300) {
    const verb = { create: 'criar', update: 'editar', delete: 'excluir' }[operation];
    const dataName = data && typeof data.name === 'string' ? data.name : undefined;
    await recordChange({
      request,
      auth,
      section: 'fluxo-caixa',
      action: `${type === 'group' ? 'grupo' : 'item'}.${verb}`,
      entity: type === 'group' ? 'grupo' : 'item',
      entityId: outcome.entityId ?? id,
      entityLabel: outcome.entityLabel ?? dataName,
      changes: outcome.changes,
      snapshot: outcome.snapshot,
    });
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
): Promise<{ response: NextResponse; outcome: RecordOutcome }> {
  if (operation === 'create') {
    // Criar novo grupo personalizado puro (sem templateId)
    if (!data.name || !data.type) {
      return {
        response: NextResponse.json(
          { error: 'name e type são obrigatórios para criar grupo' },
          { status: 400 },
        ),
        outcome: {},
      };
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

    return {
      response: NextResponse.json({ success: true, group: newGroup }),
      outcome: {
        entityId: newGroup.id,
        entityLabel: newGroup.name,
        changes: diffFields({}, newGroup, CASHFLOW_GRUPO_FIELD_LABELS),
      },
    };
  }

  if (operation === 'update') {
    if (!id) {
      return {
        response: NextResponse.json({ error: 'id é obrigatório para atualizar' }, { status: 400 }),
        outcome: {},
      };
    }

    // Buscar grupo (pode ser template ou personalizado)
    const group = await getGroupForUser(id, userId);
    if (!group) {
      return {
        response: NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 }),
        outcome: {},
      };
    }

    // Se é template, criar override (vinculado por templateId) e atualizar de forma atômica.
    const wasTemplate = group.userId === null;
    let finalGroupId = group.id;
    if (wasTemplate) {
      finalGroupId = await personalizeGroup(group.id, userId);
    }

    const updateData: Prisma.CashflowGroupUncheckedUpdateInput = {};
    if (data.name) updateData.name = data.name;
    if (data.type) updateData.type = data.type;
    if (data.orderIndex !== undefined && data.orderIndex !== null)
      updateData.orderIndex = data.orderIndex;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;
    // Update implícito desfaz tombstone: editar uma linha oculta significa que
    // o usuário a quer de volta.
    updateData.hidden = false;

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

    return {
      response: NextResponse.json({ success: true, group: updatedGroup }),
      outcome: {
        entityId: finalGroupId,
        entityLabel: updatedGroup.name,
        changes: diffFields(group, updateData, CASHFLOW_GRUPO_FIELD_LABELS),
        // wasTemplate: a edição CRIOU o override — desfazer = deletar o
        // override (voltar ao template), não restaurar campos.
        snapshot: {
          v: 1,
          kind: 'cashflow-grupo-editar',
          data: { name: group.name, type: group.type },
          meta: { finalGroupId, wasTemplate },
        },
      },
    };
  }

  if (operation === 'delete') {
    if (!id) {
      return {
        response: NextResponse.json({ error: 'id é obrigatório para deletar' }, { status: 400 }),
        outcome: {},
      };
    }

    // Resolver linha alvo: pode ser template, override ou custom puro do usuário.
    const target = await prisma.cashflowGroup.findUnique({
      where: { id },
    });

    if (!target) {
      return {
        response: NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 }),
        outcome: {},
      };
    }

    // Caso A: id aponta para um template (userId=null) → criar tombstone.
    if (target.userId === null) {
      const tombstoneId = await hideTemplateGroup(target.id, userId);
      return {
        response: NextResponse.json({
          success: true,
          message: 'Grupo template ocultado para o usuário',
          tombstoneId,
          hidden: true,
        }),
        outcome: {
          entityId: target.id,
          entityLabel: target.name,
          changes: finalStateChanges(target, CASHFLOW_GRUPO_FIELD_LABELS),
          // Ocultação de template: desfazer = deletar o tombstone.
          snapshot: {
            v: 1,
            kind: 'cashflow-grupo-tombstone',
            data: {},
            meta: { tombstoneId },
          },
        },
      };
    }

    // Caso B/C: id é uma linha do usuário (override ou custom puro).
    if (target.userId !== userId) {
      return {
        response: NextResponse.json(
          { error: 'Grupo não encontrado ou não pertence ao usuário' },
          { status: 404 },
        ),
        outcome: {},
      };
    }

    // Verificar se tem filhos ou itens (recursivo)
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
      return {
        response: NextResponse.json(
          { error: 'Não é possível deletar grupo com subgrupos. Delete os subgrupos primeiro.' },
          { status: 400 },
        ),
        outcome: {},
      };
    }

    const itemsCount = await prisma.cashflowItem.count({
      where: { groupId: id, userId },
    });

    if (itemsCount > 0) {
      return {
        response: NextResponse.json(
          { error: 'Não é possível deletar grupo com itens. Delete os itens primeiro.' },
          { status: 400 },
        ),
        outcome: {},
      };
    }

    // DELETE simples — independentemente de ser custom puro ou override
    // (override: usuário "reverte para template").
    await prisma.cashflowGroup.delete({
      where: { id },
    });

    return {
      response: NextResponse.json({ success: true, message: 'Grupo deletado com sucesso' }),
      outcome: {
        entityId: target.id,
        entityLabel: target.name,
        changes: finalStateChanges(target, CASHFLOW_GRUPO_FIELD_LABELS),
        // Row do usuário apagada (grupo sem itens/subgrupos) — recriável.
        snapshot: {
          v: 1,
          kind: 'cashflow-grupo',
          data: {
            id: target.id,
            name: target.name,
            type: target.type,
            orderIndex: target.orderIndex,
            parentId: target.parentId,
            templateId: target.templateId,
            hidden: target.hidden,
          },
        },
      },
    };
  }

  return {
    response: NextResponse.json({ error: 'Operação não suportada' }, { status: 400 }),
    outcome: {},
  };
}

/**
 * Processa operações com itens
 */
async function handleItemOperation(
  operation: string,
  id: string | undefined,
  data: ItemData,
  userId: string,
): Promise<{ response: NextResponse; outcome: RecordOutcome }> {
  if (operation === 'create') {
    // Criar novo item personalizado puro (sem templateId)
    if (!data.groupId || !data.name) {
      return {
        response: NextResponse.json(
          { error: 'groupId e name são obrigatórios para criar item' },
          { status: 400 },
        ),
        outcome: {},
      };
    }

    // Verificar se grupo existe (pode ser template ou personalizado)
    const group = await getGroupForUser(data.groupId, userId);
    if (!group) {
      return {
        response: NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 }),
        outcome: {},
      };
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

    return {
      response: NextResponse.json({ success: true, item: newItem }),
      outcome: {
        entityId: newItem.id,
        entityLabel: newItem.name,
        changes: diffFields({}, newItem, CASHFLOW_FIELD_LABELS),
      },
    };
  }

  if (operation === 'update') {
    if (!id) {
      return {
        response: NextResponse.json({ error: 'id é obrigatório para atualizar' }, { status: 400 }),
        outcome: {},
      };
    }

    // Buscar item (pode ser template ou personalizado)
    const item = await getItemForUser(id, userId);
    if (!item) {
      return {
        response: NextResponse.json({ error: 'Item não encontrado' }, { status: 404 }),
        outcome: {},
      };
    }

    // Se é template, criar override (vinculado por templateId) e atualizar.
    const wasTemplate = item.userId === null;
    let finalItemId = item.id;
    if (wasTemplate) {
      finalItemId = await personalizeItem(item.id, userId);
    }

    // Atualizar apenas itens personalizados do usuário. Update implícito
    // desfaz tombstone (editar uma linha oculta a "ressuscita").
    const updatedItem = await prisma.cashflowItem.update({
      where: {
        id: finalItemId,
        userId,
      },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.significado !== undefined && { significado: data.significado }),
        ...(data.rank !== undefined && { rank: data.rank }),
        ...(data.groupId && { groupId: data.groupId }),
        hidden: false,
      },
      include: {
        values: {
          where: { userId },
        },
      },
    });

    return {
      response: NextResponse.json({ success: true, item: updatedItem }),
      outcome: {
        entityId: finalItemId,
        entityLabel: updatedItem.name,
        changes: diffFields(item, data as Record<string, unknown>, CASHFLOW_FIELD_LABELS),
        // wasTemplate: a edição CRIOU o override — desfazer = deletar o
        // override (voltar ao template), não restaurar campos.
        snapshot: {
          v: 1,
          kind: 'cashflow-item-editar',
          data: { name: item.name, significado: item.significado, rank: item.rank },
          meta: { finalItemId, wasTemplate },
        },
      },
    };
  }

  if (operation === 'delete') {
    if (!id) {
      return {
        response: NextResponse.json({ error: 'id é obrigatório para deletar' }, { status: 400 }),
        outcome: {},
      };
    }

    // Resolver linha alvo
    const target = await prisma.cashflowItem.findUnique({
      where: { id },
    });

    if (!target) {
      return {
        response: NextResponse.json({ error: 'Item não encontrado' }, { status: 404 }),
        outcome: {},
      };
    }

    // Caso A: id aponta para um item-template → tombstone.
    if (target.userId === null) {
      const tombstoneId = await hideTemplateItem(target.id, userId);
      return {
        response: NextResponse.json({
          success: true,
          message: 'Item template ocultado para o usuário',
          tombstoneId,
          hidden: true,
        }),
        outcome: {
          entityId: target.id,
          entityLabel: target.name,
          changes: finalStateChanges(target, CASHFLOW_FIELD_LABELS),
          // Ocultação de template: desfazer = deletar o tombstone.
          snapshot: {
            v: 1,
            kind: 'cashflow-item-tombstone',
            data: {},
            meta: { tombstoneId },
          },
        },
      };
    }

    // Caso B/C: linha do usuário (override ou custom puro).
    if (target.userId !== userId) {
      return {
        response: NextResponse.json(
          { error: 'Item não encontrado ou não pertence ao usuário' },
          { status: 404 },
        ),
        outcome: {},
      };
    }

    // Estado completo pré-exclusão (item + valores) — permite desfazer.
    const values = await prisma.cashflowValue.findMany({
      where: { itemId: id, userId },
      select: { year: true, month: true, value: true, comment: true, color: true },
    });

    // Deletar valores e item em uma única transação
    await prisma.$transaction([
      prisma.cashflowValue.deleteMany({ where: { itemId: id } }),
      prisma.cashflowItem.delete({ where: { id } }),
    ]);

    return {
      response: NextResponse.json({ success: true, message: 'Item deletado com sucesso' }),
      outcome: {
        entityId: target.id,
        entityLabel: target.name,
        changes: finalStateChanges(target, CASHFLOW_FIELD_LABELS),
        snapshot: {
          v: 1,
          kind: 'cashflow-item',
          data: {
            id: target.id,
            groupId: target.groupId,
            name: target.name,
            significado: target.significado,
            rank: target.rank,
            templateId: target.templateId,
            hidden: target.hidden,
            objetivoId: target.objetivoId,
          },
          meta: { values: values.length > 480 ? [] : values, valuesTruncated: values.length > 480 },
        },
      },
    };
  }

  return {
    response: NextResponse.json({ error: 'Operação não suportada' }, { status: 400 }),
    outcome: {},
  };
}
