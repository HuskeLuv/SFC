import prisma from '@/lib/prisma';
import { CashflowGroup, CashflowItem } from '@prisma/client';

/**
 * Utilitários para gerenciar personalização do fluxo de caixa.
 *
 * Override Layer: a partir desta versão, cada override aponta para o template
 * via `templateId` (com `@@unique([userId, templateId])`). Isso elimina a
 * necessidade de matching por nome — embora a busca por nome continue como
 * fallback de back-compat para overrides legados criados antes da migração.
 *
 * Tombstone: para "remover" um item/grupo template, criamos um override com
 * `hidden=true` em vez de tentar deletar a linha do template (compartilhada
 * entre todos os usuários).
 */

/**
 * Verifica se um grupo/item é template (userId = null)
 */
export function isTemplate<T extends { userId: string | null }>(entity: T): boolean {
  return entity.userId === null;
}

/**
 * Cria cópia personalizada de um grupo template.
 *
 * Idempotente: se já existe override para `(userId, templateId)` retorna o id
 * existente. Mantém compatibilidade com overrides legados (sem templateId)
 * via lookup por nome+parentId.
 */
export async function personalizeGroup(
  templateGroupId: string,
  userId: string,
  newParentId?: string | null,
): Promise<string> {
  // Verificar se o usuário existe PRIMEIRO (antes de qualquer processamento)
  // Isso evita processamento desnecessário e erros em chamadas recursivas
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!userExists) {
    throw new Error('Usuário não encontrado. Faça logout e login novamente.');
  }

  // Verificar se já existe personalização
  const templateGroup = await prisma.cashflowGroup.findUnique({
    where: { id: templateGroupId },
    include: {
      items: true,
      children: true,
    },
  });

  if (!templateGroup) {
    throw new Error('Grupo template não encontrado');
  }

  if (templateGroup.userId !== null) {
    throw new Error('Grupo não é um template');
  }

  // 1) Lookup primário: override já existente vinculado por templateId
  const existingByTemplate = await prisma.cashflowGroup.findFirst({
    where: { userId, templateId: templateGroup.id },
  });

  if (existingByTemplate) {
    // Se foi marcado como tombstone e estamos personalizando de novo, "ressuscitar"
    if (existingByTemplate.hidden) {
      await prisma.cashflowGroup.update({
        where: { id: existingByTemplate.id },
        data: { hidden: false },
      });
    }
    if (newParentId !== undefined && existingByTemplate.parentId !== (newParentId || null)) {
      await prisma.cashflowGroup.update({
        where: { id: existingByTemplate.id },
        data: { parentId: newParentId || null },
      });
    }
    return existingByTemplate.id;
  }

  // Determinar parentId correto
  let finalParentId: string | null = newParentId !== undefined ? newParentId || null : null;

  // Se não foi fornecido explicitamente e grupo tem parent no template, tentar personalizar o parent também
  if (finalParentId === null && templateGroup.parentId) {
    const templateParent = await prisma.cashflowGroup.findUnique({
      where: { id: templateGroup.parentId },
    });

    if (templateParent && templateParent.userId === null) {
      // Parent também é template - personalizar parent primeiro
      const personalizedParentId = await personalizeGroup(templateParent.id, userId);
      finalParentId = personalizedParentId;
    } else if (templateParent && templateParent.userId !== null) {
      // Parent já é personalizado
      finalParentId = templateParent.id;
    }
  }

  // 2) Lookup back-compat: override legado criado por nome (sem templateId).
  //    Quando encontrado, atualizamos para apontar para o template, evitando
  //    duplicatas e migrando suavemente para a nova estrutura.
  const existingByName = await prisma.cashflowGroup.findFirst({
    where: {
      userId,
      templateId: null,
      name: templateGroup.name,
      parentId: finalParentId,
    },
  });

  if (existingByName) {
    try {
      await prisma.cashflowGroup.update({
        where: { id: existingByName.id },
        data: { templateId: templateGroup.id },
      });
    } catch {
      // Se atualização falhar (e.g. unique violation por concorrência), usar a row como está
    }
    if (newParentId !== undefined && existingByName.parentId !== (newParentId || null)) {
      await prisma.cashflowGroup.update({
        where: { id: existingByName.id },
        data: { parentId: newParentId || null },
      });
    }
    return existingByName.id;
  }

  // 3) Criar override novo dentro de uma transação para evitar race conditions
  let resultId: string;
  try {
    resultId = await prisma.$transaction(async (tx) => {
      // Double-check dentro da transação (ambos os lookups)
      const existingTpl = await tx.cashflowGroup.findFirst({
        where: { userId, templateId: templateGroup.id },
      });
      if (existingTpl) return existingTpl.id;

      const existingNm = await tx.cashflowGroup.findFirst({
        where: { userId, templateId: null, name: templateGroup.name, parentId: finalParentId },
      });
      if (existingNm) {
        await tx.cashflowGroup.update({
          where: { id: existingNm.id },
          data: { templateId: templateGroup.id },
        });
        return existingNm.id;
      }

      const customGroup = await tx.cashflowGroup.create({
        data: {
          userId,
          name: templateGroup.name,
          type: templateGroup.type,
          orderIndex: templateGroup.orderIndex,
          parentId: finalParentId,
          templateId: templateGroup.id,
        },
      });

      // Copiar itens dentro da mesma transação
      for (const templateItem of templateGroup.items) {
        await tx.cashflowItem.create({
          data: {
            userId,
            groupId: customGroup.id,
            name: templateItem.name,
            significado: templateItem.significado,
            rank: templateItem.rank,
            templateId: templateItem.id,
          },
        });
      }

      return customGroup.id;
    });
  } catch (error) {
    // Race-condition: outra requisição criou o override no meio. Buscar e devolver.
    const existing =
      (await prisma.cashflowGroup.findFirst({
        where: { userId, templateId: templateGroup.id },
      })) ||
      (await prisma.cashflowGroup.findFirst({
        where: { userId, name: templateGroup.name, parentId: finalParentId },
      }));
    if (existing) return existing.id;
    throw error;
  }

  // Copiar filhos FORA da transação (chamam personalizeGroup recursivamente com suas próprias transações)
  for (const child of templateGroup.children) {
    await personalizeGroup(child.id, userId, resultId);
  }

  return resultId;
}

/**
 * Cria cópia personalizada de um item template.
 *
 * Idempotente via `(userId, templateId)`. Back-compat: detecta overrides
 * legados criados via match por nome+groupId.
 */
export async function personalizeItem(
  templateItemId: string,
  userId: string,
  targetGroupId?: string,
): Promise<string> {
  // Verificar se o usuário existe PRIMEIRO (antes de qualquer processamento)
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!userExists) {
    throw new Error('Usuário não encontrado. Faça logout e login novamente.');
  }

  const templateItem = await prisma.cashflowItem.findUnique({
    where: { id: templateItemId },
    include: { group: true },
  });

  if (!templateItem) {
    throw new Error('Item template não encontrado');
  }

  if (templateItem.userId !== null) {
    throw new Error('Item não é um template');
  }

  // 1) Lookup primário por templateId
  const existingByTemplate = await prisma.cashflowItem.findFirst({
    where: { userId, templateId: templateItem.id },
  });

  if (existingByTemplate) {
    if (existingByTemplate.hidden) {
      await prisma.cashflowItem.update({
        where: { id: existingByTemplate.id },
        data: { hidden: false },
      });
    }
    return existingByTemplate.id;
  }

  // Determinar grupo de destino
  let finalGroupId = targetGroupId || templateItem.groupId;

  // Se grupo de destino é template, personalizar o grupo também
  const targetGroup = await prisma.cashflowGroup.findUnique({
    where: { id: finalGroupId },
  });

  if (targetGroup && targetGroup.userId === null) {
    const personalizedGroupId = await personalizeGroup(finalGroupId, userId);
    finalGroupId = personalizedGroupId;
  }

  // 2) Lookup back-compat por nome+groupId
  const existingByName = await prisma.cashflowItem.findFirst({
    where: {
      userId,
      templateId: null,
      name: templateItem.name,
      groupId: finalGroupId,
    },
  });

  if (existingByName) {
    try {
      await prisma.cashflowItem.update({
        where: { id: existingByName.id },
        data: { templateId: templateItem.id },
      });
    } catch {
      // Race / unique violation — manter como está
    }
    return existingByName.id;
  }

  // 3) Criar override novo
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingTpl = await tx.cashflowItem.findFirst({
        where: { userId, templateId: templateItem.id },
      });
      if (existingTpl) return existingTpl.id;

      const existingNm = await tx.cashflowItem.findFirst({
        where: { userId, templateId: null, name: templateItem.name, groupId: finalGroupId },
      });
      if (existingNm) {
        await tx.cashflowItem.update({
          where: { id: existingNm.id },
          data: { templateId: templateItem.id },
        });
        return existingNm.id;
      }

      const customItem = await tx.cashflowItem.create({
        data: {
          userId,
          groupId: finalGroupId,
          name: templateItem.name,
          significado: templateItem.significado,
          rank: templateItem.rank,
          templateId: templateItem.id,
        },
      });

      return customItem.id;
    });

    return result;
  } catch (error) {
    const existing =
      (await prisma.cashflowItem.findFirst({
        where: { userId, templateId: templateItem.id },
      })) ||
      (await prisma.cashflowItem.findFirst({
        where: { userId, name: templateItem.name, groupId: finalGroupId },
      }));
    if (existing) return existing.id;
    throw error;
  }
}

/**
 * Cria/atualiza um override marcado como tombstone (`hidden=true`) para o
 * grupo template informado. Idempotente.
 *
 * Caso já exista um override (com ou sem templateId), apenas marca `hidden=true`
 * e (quando aplicável) atualiza o `templateId` para fechar o link.
 */
export async function hideTemplateGroup(templateGroupId: string, userId: string): Promise<string> {
  const userExists = await prisma.user.findUnique({ where: { id: userId } });
  if (!userExists) {
    throw new Error('Usuário não encontrado. Faça logout e login novamente.');
  }

  const templateGroup = await prisma.cashflowGroup.findUnique({
    where: { id: templateGroupId },
  });
  if (!templateGroup) {
    throw new Error('Grupo template não encontrado');
  }
  if (templateGroup.userId !== null) {
    throw new Error('Grupo não é um template');
  }

  // 1) Override já vinculado por templateId
  const existingByTemplate = await prisma.cashflowGroup.findFirst({
    where: { userId, templateId: templateGroup.id },
  });
  if (existingByTemplate) {
    if (!existingByTemplate.hidden) {
      await prisma.cashflowGroup.update({
        where: { id: existingByTemplate.id },
        data: { hidden: true },
      });
    }
    return existingByTemplate.id;
  }

  // 2) Override legado (sem templateId) com mesmo nome+parentId
  const existingByName = await prisma.cashflowGroup.findFirst({
    where: {
      userId,
      templateId: null,
      name: templateGroup.name,
      parentId: templateGroup.parentId,
    },
  });
  if (existingByName) {
    await prisma.cashflowGroup.update({
      where: { id: existingByName.id },
      data: { hidden: true, templateId: templateGroup.id },
    });
    return existingByName.id;
  }

  // 3) Criar tombstone novo
  const tombstone = await prisma.cashflowGroup.create({
    data: {
      userId,
      name: templateGroup.name,
      type: templateGroup.type,
      orderIndex: templateGroup.orderIndex,
      parentId: templateGroup.parentId,
      templateId: templateGroup.id,
      hidden: true,
    },
  });
  return tombstone.id;
}

/**
 * Cria/atualiza um override marcado como tombstone para o item template.
 * Idempotente.
 */
export async function hideTemplateItem(templateItemId: string, userId: string): Promise<string> {
  const userExists = await prisma.user.findUnique({ where: { id: userId } });
  if (!userExists) {
    throw new Error('Usuário não encontrado. Faça logout e login novamente.');
  }

  const templateItem = await prisma.cashflowItem.findUnique({
    where: { id: templateItemId },
  });
  if (!templateItem) {
    throw new Error('Item template não encontrado');
  }
  if (templateItem.userId !== null) {
    throw new Error('Item não é um template');
  }

  // 1) Override já vinculado por templateId
  const existingByTemplate = await prisma.cashflowItem.findFirst({
    where: { userId, templateId: templateItem.id },
  });
  if (existingByTemplate) {
    if (!existingByTemplate.hidden) {
      await prisma.cashflowItem.update({
        where: { id: existingByTemplate.id },
        data: { hidden: true },
      });
    }
    return existingByTemplate.id;
  }

  // 2) Resolver groupId em que o tombstone deve viver. Se o grupo do template
  //    é template, usamos o override do grupo (criando-o se necessário) — o
  //    tombstone do item precisa morar no grupo personalizado do usuário.
  let groupIdForTombstone = templateItem.groupId;
  const itemGroup = await prisma.cashflowGroup.findUnique({
    where: { id: templateItem.groupId },
  });
  if (itemGroup && itemGroup.userId === null) {
    groupIdForTombstone = await personalizeGroup(itemGroup.id, userId);
  }

  // 3) Override legado (sem templateId) com mesmo nome no mesmo grupo
  const existingByName = await prisma.cashflowItem.findFirst({
    where: {
      userId,
      templateId: null,
      name: templateItem.name,
      groupId: groupIdForTombstone,
    },
  });
  if (existingByName) {
    await prisma.cashflowItem.update({
      where: { id: existingByName.id },
      data: { hidden: true, templateId: templateItem.id },
    });
    return existingByName.id;
  }

  // 4) Criar tombstone novo
  const tombstone = await prisma.cashflowItem.create({
    data: {
      userId,
      groupId: groupIdForTombstone,
      name: templateItem.name,
      significado: templateItem.significado,
      rank: templateItem.rank,
      templateId: templateItem.id,
      hidden: true,
    },
  });
  return tombstone.id;
}

/**
 * Obtém item personalizado ou template para um usuário.
 *
 * Ordem de resolução:
 *  1. Override do usuário cujo `id` bate com o argumento (item próprio do usuário).
 *  2. Override do usuário cujo `templateId` aponta para o argumento (override por link).
 *  3. Template original com aquele id.
 */
export async function getItemForUser(itemId: string, userId: string): Promise<CashflowItem | null> {
  // 1) item próprio do usuário (custom puro ou override)
  const ownItem = await prisma.cashflowItem.findFirst({
    where: { id: itemId, userId },
  });
  if (ownItem) return ownItem;

  // 2) override apontando para itemId (caso itemId seja um template)
  const overrideByTemplate = await prisma.cashflowItem.findFirst({
    where: { userId, templateId: itemId },
  });
  if (overrideByTemplate) return overrideByTemplate;

  // 3) template original
  const templateItem = await prisma.cashflowItem.findUnique({
    where: { id: itemId },
  });
  return templateItem;
}

/**
 * Ensures an item is personalized for the user.
 * If the item is a template (userId === null), creates a personalized copy.
 * Returns the ID of the personalized item.
 */
export async function ensurePersonalizedItem(
  itemId: string,
  userId: string,
): Promise<{ itemId: string; item: CashflowItem }> {
  const item = await getItemForUser(itemId, userId);
  if (!item) {
    throw new Error('Item não encontrado');
  }

  const finalItemId = item.userId === null ? await personalizeItem(item.id, userId) : item.id;

  return { itemId: finalItemId, item };
}

/**
 * Obtém grupo personalizado ou template para um usuário.
 */
export async function getGroupForUser(
  groupId: string,
  userId: string,
): Promise<CashflowGroup | null> {
  // 1) grupo próprio do usuário
  const ownGroup = await prisma.cashflowGroup.findFirst({
    where: { id: groupId, userId },
  });
  if (ownGroup) return ownGroup;

  // 2) override apontando para groupId (caso groupId seja um template)
  const overrideByTemplate = await prisma.cashflowGroup.findFirst({
    where: { userId, templateId: groupId },
  });
  if (overrideByTemplate) return overrideByTemplate;

  // 3) template original
  const templateGroup = await prisma.cashflowGroup.findUnique({
    where: { id: groupId },
  });
  return templateGroup;
}

/**
 * Verifica se usuário tem personalização de um template específico
 */
export async function hasPersonalization(
  templateId: string,
  userId: string,
  type: 'group' | 'item',
): Promise<boolean> {
  if (type === 'group') {
    const template = await prisma.cashflowGroup.findUnique({
      where: { id: templateId },
    });
    if (!template) return false;

    // Check both linkage paths: by templateId and by name (legacy)
    const byTemplate = await prisma.cashflowGroup.findFirst({
      where: { userId, templateId: template.id },
    });
    if (byTemplate) return true;

    const byName = await prisma.cashflowGroup.findFirst({
      where: {
        userId,
        name: template.name,
      },
    });
    return !!byName;
  } else {
    const template = await prisma.cashflowItem.findUnique({
      where: { id: templateId },
      include: { group: true },
    });
    if (!template) return false;

    const byTemplate = await prisma.cashflowItem.findFirst({
      where: { userId, templateId: template.id },
    });
    if (byTemplate) return true;

    const byName = await prisma.cashflowItem.findFirst({
      where: {
        userId,
        name: template.name,
        group: {
          name: template.group.name,
        },
      },
    });
    return !!byName;
  }
}
