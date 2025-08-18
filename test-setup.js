const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testSetup() {
  try {
    console.log('🧪 Testando setup do cashflow...\n');

    // 1. Verificar templates
    const groupTemplates = await prisma.cashflowGroupTemplate.count();
    const itemTemplates = await prisma.cashflowItemTemplate.count();
    console.log(`📊 Templates disponíveis: ${groupTemplates} grupos, ${itemTemplates} itens`);

    // 2. Verificar usuário
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('❌ Nenhum usuário encontrado');
      return;
    }
    console.log(`👤 Usuário: ${user.email} (ID: ${user.id})`);

    // 3. Verificar se já tem estrutura
    const existingGroups = await prisma.cashflowGroup.count({ where: { userId: user.id } });
    const existingItems = await prisma.cashflowItem.count({ where: { userId: user.id } });
    console.log(`📁 Estrutura existente: ${existingGroups} grupos, ${existingItems} itens`);

    if (existingGroups > 0) {
      console.log('⚠️ Usuário já possui estrutura. Limpando...');
      await prisma.cashflowValue.deleteMany({ where: { userId: user.id } });
      await prisma.cashflowItem.deleteMany({ where: { userId: user.id } });
      await prisma.cashflowGroup.deleteMany({ where: { userId: user.id } });
      console.log('✅ Estrutura limpa');
    }

    // 4. Testar criação de grupos
    console.log('\n📁 Criando grupos...');
    const groupTemplatesList = await prisma.cashflowGroupTemplate.findMany({
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
    
    // Função recursiva para criar grupos
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
        console.log(`  ✅ Grupo criado: ${template.name}`);

        if (template.children && template.children.length > 0) {
          await createGroupsRecursively(template.children, group.id);
        }
      }
    };

    await createGroupsRecursively(groupTemplatesList);
    console.log(`\n📁 Grupos criados: ${createdGroups.size}`);

    // 5. Testar criação de itens
    console.log('\n📋 Criando itens...');
    const itemTemplatesList = await prisma.cashflowItemTemplate.findMany({
      where: { isActive: true },
      include: { groupTemplate: true },
      orderBy: [{ order: 'asc' }, { descricao: 'asc' }]
    });

    let itemsCreated = 0;
    for (const template of itemTemplatesList) {
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
        console.log(`  ✅ Item criado: ${template.descricao} em ${template.groupTemplate.name}`);
      } else {
        console.log(`  ⚠️ Grupo não encontrado para: ${template.descricao} (template: ${template.groupTemplate.name})`);
      }
    }

    console.log(`\n📋 Itens criados: ${itemsCreated}`);

    // 6. Verificar resultado final
    const finalGroups = await prisma.cashflowGroup.count({ where: { userId: user.id } });
    const finalItems = await prisma.cashflowItem.count({ where: { userId: user.id } });
    console.log(`\n🎯 Resultado final: ${finalGroups} grupos, ${finalItems} itens`);

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSetup(); 