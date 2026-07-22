import { PrismaClient, ConsultantClientStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedTemplates } from '../src/utils/cashflowTemplates';
import { seedInstitutions } from './referenceData';

const prisma = new PrismaClient();

// ===== CLONE TEMPLATES FOR USER =====

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
    throw new Error('Nenhum template encontrado para clonar.');
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
          parentId: group.parentId ? (createdIdMap.get(group.parentId) ?? null) : null,
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

// ===== SEED CASHFLOW VALUES =====

async function seedCashflowValues(userId: string, entries: Record<string, number[]>, year: number) {
  for (const [itemName, values] of Object.entries(entries)) {
    const item = await prisma.cashflowItem.findFirst({
      where: { userId, name: itemName },
    });

    if (!item) {
      console.warn(`⚠️  Item não encontrado para o usuário: ${itemName}`);
      continue;
    }

    const data = values.map((value, index) => ({
      itemId: item.id,
      userId,
      year,
      month: index,
      value,
    }));

    await prisma.cashflowValue.createMany({
      data,
      skipDuplicates: true,
    });
  }
}

// ===== SEED DEMO USERS =====

async function seedDemoUsers() {
  console.log('\n👤 Criando usuários de demonstração...');

  const hashedPassword = await bcrypt.hash('123456', 10);

  const demoUser = await prisma.user.upsert({
    where: { email: 'usuario.demo@finapp.local' },
    update: {
      password: hashedPassword,
      name: 'Usuário Demo',
      role: UserRole.user,
    },
    create: {
      email: 'usuario.demo@finapp.local',
      password: hashedPassword,
      name: 'Usuário Demo',
      role: UserRole.user,
    },
  });

  await prisma.cashflowValue.deleteMany({ where: { userId: demoUser.id } });
  await prisma.cashflowItem.deleteMany({ where: { userId: demoUser.id } });
  await prisma.cashflowGroup.deleteMany({ where: { userId: demoUser.id } });
  await prisma.portfolio.deleteMany({ where: { userId: demoUser.id } });
  await prisma.stockTransaction.deleteMany({ where: { userId: demoUser.id } });

  await cloneTemplatesForUser(demoUser.id);

  // Dados demo relativos ao ano corrente: a planilha abre no ano atual e o
  // grupo Aporte/Resgate só mostra transações do ano exibido. O ano anterior
  // também recebe dados — serve de fixture para o seletor de anos dinâmico.
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const incomes: Record<string, number[]> = {
    Salário: Array(12).fill(9000),
    "Receita Proventos FII's": [420, 430, 440, 450, 460, 470, 480, 490, 500, 510, 520, 530],
    Aluguéis: Array(12).fill(1200),
  };

  const expenses: Record<string, number[]> = {
    'Aluguel / Prestação': Array(12).fill(2500),
    Supermercado: [900, 920, 940, 950, 960, 980, 1000, 1010, 1020, 1030, 1040, 1050],
    'Conta de energia': [180, 175, 190, 185, 200, 195, 210, 205, 195, 190, 185, 180],
    Internet: Array(12).fill(120),
    'Plano de Saúde': Array(12).fill(680),
    Restaurantes: [400, 420, 380, 450, 470, 430, 460, 480, 420, 410, 430, 440],
    Uber: [100, 120, 110, 130, 125, 140, 135, 145, 120, 110, 115, 130],
    'Escola/Faculdade': Array(12).fill(1500),
    Cinema: [80, 60, 70, 90, 85, 75, 95, 80, 70, 65, 60, 75],
    Roupas: [250, 0, 180, 0, 220, 0, 210, 0, 230, 0, 190, 0],
  };

  for (const year of [previousYear, currentYear]) {
    await seedCashflowValues(demoUser.id, incomes, year);
    await seedCashflowValues(demoUser.id, expenses, year);
  }

  const itsa4 = await prisma.asset.upsert({
    where: { symbol: 'ITSA4' },
    update: {
      name: 'Itaúsa PN',
      type: 'stock',
      currency: 'BRL',
    },
    create: {
      symbol: 'ITSA4',
      name: 'Itaúsa PN',
      type: 'stock',
      currency: 'BRL',
    },
  });

  const mxrf11 = await prisma.asset.upsert({
    where: { symbol: 'MXRF11' },
    update: {
      name: 'Maxi Renda FII',
      type: 'fii',
      currency: 'BRL',
    },
    create: {
      symbol: 'MXRF11',
      name: 'Maxi Renda FII',
      type: 'fii',
      currency: 'BRL',
    },
  });

  // Aportes (compra) e resgates (venda) espalhados pelo ano anterior inteiro e
  // pelo ano corrente até o mês atual — verde/vermelho no bloco Aporte/Resgate
  // em duas categorias (Ações e FII's).
  const currentMonth = new Date().getMonth();
  const transactions: Array<{
    userId: string;
    assetId: string;
    type: 'compra' | 'venda';
    quantity: number;
    price: number;
    total: number;
    date: Date;
    fees: number;
    notes: string;
  }> = [];

  const pushMonthly = (year: number, lastMonth: number) => {
    for (let month = 0; month <= lastMonth; month++) {
      // ITSA4: compra mensal; em junho, um resgate parcial.
      const isVenda = month === 5;
      const quantity = isVenda ? 30 : 10 + month;
      const price = 10.5 + month * 0.2;
      transactions.push({
        userId: demoUser.id,
        assetId: itsa4.id,
        type: isVenda ? 'venda' : 'compra',
        quantity,
        price,
        total: Math.round(quantity * price * 100) / 100,
        date: new Date(year, month, 12),
        fees: 2.5,
        notes: `${isVenda ? 'Venda' : 'Compra'} mensal ${month + 1}/${year}`,
      });

      // MXRF11: aporte trimestral.
      if (month % 3 === 0) {
        const fiiQuantity = 50;
        const fiiPrice = 10.05 + month * 0.01;
        transactions.push({
          userId: demoUser.id,
          assetId: mxrf11.id,
          type: 'compra',
          quantity: fiiQuantity,
          price: fiiPrice,
          total: Math.round(fiiQuantity * fiiPrice * 100) / 100,
          date: new Date(year, month, 15),
          fees: 1.5,
          notes: `Aporte FII ${month + 1}/${year}`,
        });
      }
    }
  };

  pushMonthly(previousYear, 11);
  pushMonthly(currentYear, currentMonth);

  await prisma.stockTransaction.createMany({ data: transactions });

  const totals = new Map<string, { quantity: number; invested: number }>();
  for (const tx of transactions) {
    const acc = totals.get(tx.assetId) ?? { quantity: 0, invested: 0 };
    const sign = tx.type === 'venda' ? -1 : 1;
    acc.quantity += sign * tx.quantity;
    acc.invested += sign * tx.total;
    totals.set(tx.assetId, acc);
  }

  for (const [assetId, { quantity, invested }] of totals) {
    await prisma.portfolio.create({
      data: {
        userId: demoUser.id,
        assetId,
        quantity,
        avgPrice: quantity > 0 ? Math.round((invested / quantity) * 100) / 100 : 0,
        totalInvested: Math.round(invested * 100) / 100,
        lastUpdate: new Date(),
      },
    });
  }

  console.log('👥 Configurando usuário consultor...');

  const consultantPassword = await bcrypt.hash('123456', 10);

  const consultantUser = await prisma.user.upsert({
    where: { email: 'consultor.demo@finapp.local' },
    update: {
      password: consultantPassword,
      name: 'Consultor Demo',
      role: UserRole.consultant,
    },
    create: {
      email: 'consultor.demo@finapp.local',
      password: consultantPassword,
      name: 'Consultor Demo',
      role: UserRole.consultant,
    },
  });

  const consultantProfile = await prisma.consultant.upsert({
    where: { userId: consultantUser.id },
    update: {},
    create: { userId: consultantUser.id },
  });

  await prisma.clientConsultant.upsert({
    where: {
      consultantId_clientId: {
        consultantId: consultantProfile.id,
        clientId: demoUser.id,
      },
    },
    update: {
      status: ConsultantClientStatus.active,
    },
    create: {
      consultantId: consultantProfile.id,
      clientId: demoUser.id,
      status: ConsultantClientStatus.active,
    },
  });

  console.log('✅ Usuários de demonstração criados.\n');
}

// ===== MAIN SEED FUNCTION =====

async function main() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...\n');

    // Cadastrar instituições bancárias
    console.log('🏦 Cadastrando instituições bancárias...');
    const totalInst = await seedInstitutions(prisma);
    console.log(`✅ ${totalInst} instituições bancárias cadastradas!\n`);

    // Executar seed de templates (cashflow)
    await seedTemplates();

    // Executar seed de usuários de demonstração
    await seedDemoUsers();

    // Nota: Ações (stocks) e moedas são adicionadas pelo cron de sincronização (brapiSync)

    console.log('\n🎉 Seed concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
