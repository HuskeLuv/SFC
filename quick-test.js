const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function quickTest() {
  try {
    console.log('🚀 Teste rápido do setup...\n');

    // 1. Limpar dados existentes
    await prisma.cashflowValue.deleteMany({});
    await prisma.cashflowItem.deleteMany({});
    await prisma.cashflowGroup.deleteMany({});
    console.log('✅ Dados limpos');

    // 2. Pegar usuário
    const user = await prisma.user.findFirst();
    console.log(`👤 Usuário: ${user.email}`);

    // 3. Criar grupos baseados nos templates
    const groupTemplates = await prisma.cashflowGroupTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: { isActive: true },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
          include: {
            children: {
              where: { isActive: true },
              orderBy: [{ order: 'asc' }, { name: 'asc' }],
            }
          }
        }
      }
    });

    const createdGroups = new Map();
    
    const createGroupsRecursively = async (templates, parentId = null) => {
      for (const template of templates) {
        const group = await prisma.cashflowGroup.create({
          data: {
            userId: user.id,
            templateId: template.id,
            name: template.name,
            type: template.type,
            parentId: parentId,
            order: template.order,
            percentTotal: 0,
            observacoes: template.description,
            isCustom: false,
            isActive: true,
          }
        });

        createdGroups.set(template.name, group.id);
        console.log(`  📁 ${template.name}`);

        if (template.children && template.children.length > 0) {
          await createGroupsRecursively(template.children, group.id);
        }
      }
    };

    await createGroupsRecursively(groupTemplates);
    console.log(`\n📁 Grupos criados: ${createdGroups.size}`);

    // 4. Criar itens baseados nos templates
    const itemTemplates = await prisma.cashflowItemTemplate.findMany({
      where: { isActive: true },
      include: { groupTemplate: true }
    });

    let itemsCreated = 0;
    for (const template of itemTemplates) {
      const userGroup = await prisma.cashflowGroup.findFirst({
        where: {
          userId: user.id,
          templateId: template.groupTemplate.id
        }
      });

      if (userGroup) {
        await prisma.cashflowItem.create({
          data: {
            userId: user.id,
            groupId: userGroup.id,
            templateId: template.id,
            descricao: template.descricao,
            significado: template.significado,
            rank: template.rank,
            percentTotal: template.percentTotal,
            order: template.order,
            categoria: template.categoria,
            formaPagamento: template.formaPagamento,
            status: 'PENDENTE',
            isInvestment: template.isInvestment,
            isCustom: false,
            isActive: true,
          }
        });
        itemsCreated++;
      }
    }

    console.log(`📋 Itens criados: ${itemsCreated}`);
    console.log(`\n🎯 Total: ${createdGroups.size} grupos e ${itemsCreated} itens`);

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

quickTest(); 