import { PrismaClient, ConsultantClientStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedTemplates } from '../src/utils/cashflowTemplates';

const prisma = new PrismaClient();

// ===== SEED INSTITUTIONS =====

async function seedInstitutions() {
  const institutions = [
    { code: '001', name: 'Banco do Brasil S.A.', cnpj: '00000000000191', status: 'ATIVO' },
    { code: '104', name: 'Caixa Econômica Federal', cnpj: '00360305000104', status: 'ATIVO' },
    { code: '237', name: 'Banco Bradesco S.A.', cnpj: '60746948000112', status: 'ATIVO' },
    { code: '341', name: 'Itaú Unibanco S.A.', cnpj: '60701190000104', status: 'ATIVO' },
    { code: '033', name: 'Banco Santander (Brasil) S.A.', cnpj: '90400888000142', status: 'ATIVO' },
    { code: '208', name: 'Banco BTG Pactual S.A.', cnpj: '30306294000145', status: 'ATIVO' },
    { code: '422', name: 'Banco Safra S.A.', cnpj: '58160789000128', status: 'ATIVO' },
    { code: '077', name: 'Banco Inter S.A.', cnpj: '00416968000101', status: 'ATIVO' },
    { code: '336', name: 'Banco C6 S.A.', cnpj: '31872495000172', status: 'ATIVO' },
    { code: '212', name: 'Banco Original S.A.', cnpj: '92894922000185', status: 'ATIVO' },
    { code: '623', name: 'Banco Pan S.A.', cnpj: '59285411000113', status: 'ATIVO' },
    { code: '746', name: 'Banco Modal S.A.', cnpj: '30723886000130', status: 'ATIVO' },
    { code: '707', name: 'Banco Daycoval S.A.', cnpj: '62232889000190', status: 'ATIVO' },
    { code: '246', name: 'Banco ABC Brasil S.A.', cnpj: '28195667000106', status: 'ATIVO' },
    { code: '655', name: 'Banco Votorantim S.A.', cnpj: '59588111000103', status: 'ATIVO' },
    { code: '318', name: 'Banco BMG S.A.', cnpj: '61186680000174', status: 'ATIVO' },
    { code: '756', name: 'Banco Cooperativo do Brasil S.A. (Sicoob)', cnpj: '02038232000164', status: 'ATIVO' },
    { code: '748', name: 'Banco Cooperativo Sicredi S.A.', cnpj: '01181521000155', status: 'ATIVO' },
  ];

  console.log('🏦 Cadastrando instituições bancárias...\n');

  for (const institution of institutions) {
    const statusEnum = institution.status === 'ATIVO' ? 'ATIVA' : 'INATIVA';
    
    await prisma.institution.upsert({
      where: { codigo: institution.code },
      update: {
        nome: institution.name,
        cnpj: institution.cnpj,
        status: statusEnum,
      },
      create: {
        codigo: institution.code,
        nome: institution.name,
        cnpj: institution.cnpj,
        status: statusEnum,
      },
    });

    console.log(`  ✅ ${institution.name} (${institution.code}) cadastrado`);
  }

  console.log(`\n✅ ${institutions.length} instituições bancárias cadastradas!\n`);
}


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

// ===== SEED CASHFLOW VALUES =====

async function seedCashflowValues(
  userId: string,
  entries: Record<string, number[]>,
  year: number,
) {
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

// ===== SEED CASHFLOW MOVEMENTS =====

async function seedCashflowMovements(
  userId: string,
  year: number,
  incomes: Record<string, number[]>,
  expenses: Record<string, number[]>,
) {
  await prisma.cashflow.deleteMany({ where: { userId } });

  const monthLabels = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  const entries: Array<{
    userId: string;
    data: Date;
    tipo: string;
    categoria: string;
    descricao: string;
    valor: number;
    forma_pagamento: string;
    pago: boolean;
  }> = [];

  const appendEntries = (
    registry: Record<string, number[]>,
    tipo: "receita" | "despesa",
    paymentMethod: string,
  ) => {
    for (const [category, values] of Object.entries(registry)) {
      values.forEach((value, monthIndex) => {
        if (!value || Math.abs(value) < 0.01) {
          return;
        }
        const referenceDay = tipo === "receita" ? 1 : 5;
        entries.push({
          userId,
          data: new Date(year, monthIndex, referenceDay),
          tipo,
          categoria: category,
          descricao: `${category} - ${monthLabels[monthIndex]}/${year}`,
          valor: Math.round(value * 100) / 100,
          forma_pagamento: paymentMethod,
          pago: true,
        });
      });
    }
  };

  appendEntries(incomes, "receita", "transferencia");
  appendEntries(expenses, "despesa", "cartao_credito");

  if (entries.length === 0) {
    console.warn("⚠️  Nenhum lançamento de fluxo de caixa foi gerado.");
    return;
  }

  await prisma.cashflow.createMany({
    data: entries,
  });
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
  await prisma.cashflow.deleteMany({ where: { userId: demoUser.id } });
  await prisma.cashflowItem.deleteMany({ where: { userId: demoUser.id } });
  await prisma.cashflowGroup.deleteMany({ where: { userId: demoUser.id } });
  await prisma.portfolio.deleteMany({ where: { userId: demoUser.id } });
  await prisma.stockTransaction.deleteMany({ where: { userId: demoUser.id } });

  await cloneTemplatesForUser(demoUser.id);

  const incomes: Record<string, number[]> = {
    'Salário': Array(12).fill(9000),
    "Receita Proventos FII's": [420, 430, 440, 450, 460, 470, 480, 490, 500, 510, 520, 530],
    'Aluguéis': Array(12).fill(1200),
  };

  const expenses: Record<string, number[]> = {
    'Aluguel / Prestação': Array(12).fill(2500),
    'Supermercado': [900, 920, 940, 950, 960, 980, 1000, 1010, 1020, 1030, 1040, 1050],
    'Conta de energia': [180, 175, 190, 185, 200, 195, 210, 205, 195, 190, 185, 180],
    'Internet': Array(12).fill(120),
    'Plano de Saúde': Array(12).fill(680),
    'Restaurantes': [400, 420, 380, 450, 470, 430, 460, 480, 420, 410, 430, 440],
    'Uber': [100, 120, 110, 130, 125, 140, 135, 145, 120, 110, 115, 130],
    'Escola/Faculdade': Array(12).fill(1500),
    'Cinema': [80, 60, 70, 90, 85, 75, 95, 80, 70, 65, 60, 75],
    'Roupas': [250, 0, 180, 0, 220, 0, 210, 0, 230, 0, 190, 0],
    'Reserva Emergência': Array(12).fill(500),
  };

  await seedCashflowValues(demoUser.id, incomes, 2025);
  await seedCashflowValues(demoUser.id, expenses, 2025);
  await seedCashflowMovements(demoUser.id, 2025, incomes, expenses);

  const asset = await prisma.asset.upsert({
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

  await prisma.portfolio.create({
    data: {
      userId: demoUser.id,
      assetId: asset.id,
      quantity: 250,
      avgPrice: 10.75,
      totalInvested: 2687.5,
      lastUpdate: new Date(2025, 10, 1),
    },
  });

  const stockTransactionsData = Array.from({ length: 12 }, (_, month) => {
    const quantity = 10 + month;
    const price = 10.5 + month * 0.2;
    const total = Math.round(quantity * price * 100) / 100;
    return {
      userId: demoUser.id,
      assetId: asset.id,
      stockId: null as string | null,
      type: 'compra' as const,
      quantity,
      price,
      total,
      date: new Date(2025, month, 12),
      fees: 2.5,
      notes: `Compra mensal ${month + 1}/2025`,
    };
  });

  await prisma.stockTransaction.createMany({
    data: stockTransactionsData,
  });

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

// ===== SEED STOCKS =====

async function seedStocks() {
  try {
    console.log('🌱 Iniciando seed de ativos da B3...\n');

    // Nota: Esta função requer fetchB3Stocks de '../src/utils/stockData'
    // Se não estiver disponível, esta etapa será pulada
    try {
      // Tentar importar dinamicamente
      const { fetchB3Stocks } = await import('../src/utils/stockData');
      
      console.log('📡 Buscando dados da API da B3...');
      const stocksData = await fetchB3Stocks();
      
      console.log(`✅ ${stocksData.length} ativos encontrados`);

      // Limpar dados existentes apenas se houver dados para inserir
      if (stocksData.length > 0) {
        console.log('🧹 Limpando dados existentes...');
        await prisma.stockTransaction.deleteMany({});
        await prisma.portfolio.deleteMany({});
        await prisma.watchlist.deleteMany({});
        await prisma.stock.deleteMany({});

        // Inserir ativos no banco
        console.log('📝 Inserindo ativos no banco...');
        const createdStocks: Array<{
          id: string;
          ticker: string;
          companyName: string;
          sector: string | null;
          subsector: string | null;
          segment: string | null;
          isActive: boolean;
          lastUpdate: Date;
        }> = [];
        
        for (const stockData of stocksData) {
          try {
            const stock = await prisma.stock.create({
              data: {
                ticker: stockData.ticker,
                companyName: stockData.companyName,
                sector: stockData.sector || null,
                subsector: stockData.subsector || null,
                segment: stockData.segment || null,
                isActive: true,
                lastUpdate: new Date(),
              },
            });
            
            createdStocks.push(stock);
            console.log(`  ✅ ${stock.ticker} - ${stock.companyName}`);
            
          } catch (error) {
            console.warn(`  ⚠️  Erro ao criar ${stockData.ticker}:`, error);
          }
        }

        console.log(`\n🎉 Seed concluído! ${createdStocks.length} ativos inseridos no banco.`);
        
        // Mostrar alguns exemplos
        if (createdStocks.length > 0) {
          console.log('\n📊 Exemplos de ativos inseridos:');
          createdStocks.slice(0, 5).forEach(stock => {
            console.log(`  - ${stock.ticker}: ${stock.companyName} (${stock.sector || 'N/A'})`);
          });
        }
      }
    } catch (importError) {
      console.log('⚠️  Função fetchB3Stocks não disponível. Pulando seed de stocks da B3.\n');
    }

  } catch (error) {
    console.error('❌ Erro durante o seed de stocks:', error);
    // Não lançar erro para não interromper o seed completo
  }
}

// ===== MAIN SEED FUNCTION =====

async function main() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...\n');

    // Cadastrar instituições bancárias
    await seedInstitutions();

    // Executar seed de templates (cashflow)
    await seedTemplates();

    // Executar seed de usuários de demonstração
    await seedDemoUsers();

    // Executar seed de stocks (ativos da B3)
    await seedStocks();

    console.log('\n🎉 Seed concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
