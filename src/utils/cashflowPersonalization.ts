import prisma from '@/lib/prisma';
import { CashflowGroup, CashflowItem } from '@prisma/client';

/**
 * Utilitários para gerenciar personalização do fluxo de caixa
 */

/**
 * Verifica se um grupo/item é template (userId = null)
 */
export function isTemplate<T extends { userId: string | null }>(entity: T): boolean {
  return entity.userId === null;
}

/**
 * Cria cópia personalizada de um grupo template
 */
export async function personalizeGroup(
  templateGroupId: string,
  userId: string,
  newParentId?: string | null
): Promise<string> {
  // Verificar se o usuário existe PRIMEIRO (antes de qualquer processamento)
  // Isso evita processamento desnecessário e erros em chamadas recursivas
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!userExists) {
    // Verificar se existem usuários no banco (para debug)
    const userCount = await prisma.user.count();
    console.error(`[personalizeGroup] Usuário não encontrado. ID buscado: ${userId}, Total de usuários no banco: ${userCount}`);
    throw new Error(`Usuário não encontrado no banco de dados. O token JWT pode estar desatualizado. Por favor, faça logout e login novamente.`);
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

  // Determinar parentId correto
  let finalParentId: string | null = newParentId !== undefined ? (newParentId || null) : null;
  
  // Se não foi fornecido explicitamente e grupo tem parent no template, tentar personalizar o parent também
  if (finalParentId === null && templateGroup.parentId) {
    const templateParent = await prisma.cashflowGroup.findUnique({
      where: { id: templateGroup.parentId },
    });
    
    if (templateParent && templateParent.userId === null) {
      // Parent também é template - personalizar parent primeiro
      // Não precisamos verificar o usuário novamente aqui pois já verificamos no início
      const personalizedParentId = await personalizeGroup(templateParent.id, userId);
      finalParentId = personalizedParentId;
    } else if (templateParent && templateParent.userId !== null) {
      // Parent já é personalizado
      finalParentId = templateParent.id;
    }
  }

  // Verificar se já existe personalização com base no nome e contexto hierárquico
  const existingCustom = await prisma.cashflowGroup.findFirst({
    where: {
      userId,
      name: templateGroup.name,
      parentId: finalParentId,
    },
  });

  if (existingCustom) {
    // Se já existe mas precisa atualizar parentId, fazer isso
    if (newParentId !== undefined && existingCustom.parentId !== newParentId) {
      await prisma.cashflowGroup.update({
        where: { id: existingCustom.id },
        data: { parentId: newParentId || null },
      });
    }
    return existingCustom.id; // Já existe personalização
  }

  // Criar cópia do grupo
  const customGroup = await prisma.cashflowGroup.create({
    data: {
      userId,
      name: templateGroup.name,
      type: templateGroup.type,
      orderIndex: templateGroup.orderIndex,
      parentId: finalParentId,
    },
  });

  // Copiar itens
  for (const templateItem of templateGroup.items) {
    await prisma.cashflowItem.create({
      data: {
        userId,
        groupId: customGroup.id,
        name: templateItem.name,
        significado: templateItem.significado,
        rank: templateItem.rank,
      },
    });
  }

  // Copiar filhos recursivamente (com parentId correto)
  for (const child of templateGroup.children) {
    await personalizeGroup(child.id, userId, customGroup.id);
  }

  return customGroup.id;
}

/**
 * Cria cópia personalizada de um item template
 */
export async function personalizeItem(
  templateItemId: string,
  userId: string,
  targetGroupId?: string
): Promise<string> {
  // Verificar se o usuário existe PRIMEIRO (antes de qualquer processamento)
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!userExists) {
    // Verificar se existem usuários no banco (para debug)
    const userCount = await prisma.user.count();
    console.error(`[personalizeItem] Usuário não encontrado. ID buscado: ${userId}, Total de usuários no banco: ${userCount}`);
    throw new Error(`Usuário não encontrado no banco de dados. O token JWT pode estar desatualizado. Por favor, faça logout e login novamente.`);
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

  // Verificar se já existe personalização deste item no mesmo grupo
  const existingCustom = await prisma.cashflowItem.findFirst({
    where: {
      userId,
      name: templateItem.name,
      groupId: targetGroupId || templateItem.groupId,
    },
  });

  if (existingCustom) {
    return existingCustom.id;
  }

  // Determinar grupo de destino
  let finalGroupId = targetGroupId || templateItem.groupId;

  // Se grupo de destino é template, personalizar o grupo também
  const targetGroup = await prisma.cashflowGroup.findUnique({
    where: { id: finalGroupId },
  });

  if (targetGroup && targetGroup.userId === null) {
    // Personalizar o grupo primeiro
    const personalizedGroupId = await personalizeGroup(finalGroupId, userId);
    finalGroupId = personalizedGroupId;
  }

  // Criar cópia do item
  const customItem = await prisma.cashflowItem.create({
    data: {
      userId,
      groupId: finalGroupId,
      name: templateItem.name,
      significado: templateItem.significado,
      rank: templateItem.rank,
    },
  });

  return customItem.id;
}

/**
 * Obtém item personalizado ou template para um usuário
 * Se não existe personalização, retorna template
 */
export async function getItemForUser(
  itemId: string,
  userId: string
): Promise<CashflowItem | null> {
  // Primeiro tentar buscar item personalizado
  const customItem = await prisma.cashflowItem.findFirst({
    where: {
      id: itemId,
      userId,
    },
  });

  if (customItem) {
    return customItem;
  }

  // Se não encontrou personalizado, buscar template original
  const templateItem = await prisma.cashflowItem.findUnique({
    where: { id: itemId },
  });

  return templateItem;
}

/**
 * Obtém grupo personalizado ou template para um usuário
 */
export async function getGroupForUser(
  groupId: string,
  userId: string
): Promise<CashflowGroup | null> {
  // Primeiro tentar buscar grupo personalizado
  const customGroup = await prisma.cashflowGroup.findFirst({
    where: {
      id: groupId,
      userId,
    },
  });

  if (customGroup) {
    return customGroup;
  }

  // Se não encontrou personalizado, buscar template original
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
  type: 'group' | 'item'
): Promise<boolean> {
  if (type === 'group') {
    const template = await prisma.cashflowGroup.findUnique({
      where: { id: templateId },
    });
    if (!template) return false;

    const custom = await prisma.cashflowGroup.findFirst({
      where: {
        userId,
        name: template.name,
      },
    });
    return !!custom;
  } else {
    const template = await prisma.cashflowItem.findUnique({
      where: { id: templateId },
      include: { group: true },
    });
    if (!template) return false;

    const custom = await prisma.cashflowItem.findFirst({
      where: {
        userId,
        name: template.name,
        group: {
          name: template.group.name,
        },
      },
    });
    return !!custom;
  }
}

