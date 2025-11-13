import prisma from '@/lib/prisma';
import { seedTemplates } from '../../prisma/seed-templates';

async function cloneTemplatesForUser(userId: string) {
  const templateGroups = await prisma.cashflowGroup.findMany({
    where: { userId: null },
    orderBy: { orderIndex: 'asc' },
    include: {
      items: {
        orderBy: { rank: 'asc' },
      },
    },
  });

  if (!templateGroups.length) {
    throw new Error('Nenhum template de fluxo de caixa encontrado');
  }

  const groupsByParent = new Map<string | null, typeof templateGroups>();
  templateGroups.forEach((group) => {
    const key = group.parentId ?? null;
    const list = groupsByParent.get(key) ?? [];
    list.push(group);
    groupsByParent.set(key, list);
  });

  const createdIdMap = new Map<string, string>();

  const processGroup = async (templateId: string | null) => {
    const groups = groupsByParent.get(templateId) ?? [];
    groups.sort((a, b) => a.orderIndex - b.orderIndex);

    for (const group of groups) {
      const createdGroup = await prisma.cashflowGroup.create({
        data: {
          userId,
          name: group.name,
          type: group.type,
          orderIndex: group.orderIndex,
          parentId: group.parentId ? createdIdMap.get(group.parentId) ?? null : null,
        },
      });

      createdIdMap.set(group.id, createdGroup.id);

      if (group.items.length) {
        await prisma.cashflowItem.createMany({
          data: group.items.map((item) => ({
            userId,
            groupId: createdGroup.id,
            name: item.name,
            significado: item.significado ?? null,
            rank: item.rank ?? null,
          })),
        });
      }

      await processGroup(group.id);
    }
  };

  await processGroup(null);
}

export async function setupCashflowForUser(userId: string) {
  try {
    const templateCount = await prisma.cashflowGroup.count({
      where: { userId: null },
    });

    if (templateCount === 0) {
      await seedTemplates(prisma);
    }

    await cloneTemplatesForUser(userId);
    console.log(`Estrutura de cashflow criada para usuário ${userId}`);
  } catch (error) {
    console.error('Erro ao criar estrutura de cashflow:', error);
    throw error;
  }
}

// Verificar se o usuário já tem estrutura configurada
export async function hasUserCashflowSetup(userId: string): Promise<boolean> {
  try {
    const count = await prisma.cashflowGroup.count({
      where: { userId }
    });
    return count > 0;
  } catch (error) {
    console.error('Erro ao verificar setup do usuário:', error);
    return false;
  }
}

// Configurar estrutura para o usuário
export async function setupUserCashflow({ userId }: { userId: string }) {
  try {
    // Verificar se já existe estrutura
    const hasSetup = await hasUserCashflowSetup(userId);
    if (hasSetup) {
      throw new Error('Usuário já possui estrutura configurada');
    }

    // Criar estrutura básica
    await setupCashflowForUser(userId);

    return { success: true, message: 'Estrutura configurada com sucesso' };
  } catch (error) {
    console.error('Erro ao configurar cashflow do usuário:', error);
    throw error;
  }
}

// Buscar estrutura do cashflow do usuário
export async function getUserCashflowStructure(userId: string) {
  try {
    const groups = await prisma.cashflowGroup.findMany({
      where: { userId },
      include: {
        items: {
          orderBy: { rank: 'asc' }
        },
        children: {
          include: {
            items: {
              orderBy: { rank: 'asc' }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { orderIndex: 'asc' }
    });

    return groups;
  } catch (error) {
    console.error('Erro ao buscar estrutura do usuário:', error);
    throw error;
  }
} 