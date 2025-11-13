import type { PrismaClient } from '@prisma/client';
import { PrismaClient, ConsultantClientStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import path from 'path';

export interface CashflowTemplateStructure {
  grupos: Array<{
    name: string;
    orderIndex: number;
    parentId: string | null;
    type: 'entrada' | 'despesa' | 'investimento';
  }>;
  itensPorGrupo: Record<
    string,
    Array<{
      name: string;
      significado?: string;
      rank?: number;
    }>
  >;
}

export const CASHFLOW_TEMPLATE_STRUCTURE: CashflowTemplateStructure = {
  grupos: [
    { name: 'Entradas', orderIndex: 1, parentId: null, type: 'entrada' },
    { name: 'Entradas Fixas', orderIndex: 1, parentId: 'Entradas', type: 'entrada' },
    { name: 'Entradas Variáveis', orderIndex: 2, parentId: 'Entradas', type: 'entrada' },
    { name: 'Sem Tributação', orderIndex: 1, parentId: 'Entradas Variáveis', type: 'entrada' },
    { name: 'Com Tributação', orderIndex: 2, parentId: 'Entradas Variáveis', type: 'entrada' },
    { name: 'Despesas', orderIndex: 2, parentId: null, type: 'despesa' },
    { name: 'Despesas Fixas', orderIndex: 1, parentId: 'Despesas', type: 'despesa' },
    { name: 'Habitação', orderIndex: 1, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Transporte', orderIndex: 2, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Saúde', orderIndex: 3, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Educação', orderIndex: 4, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Animais de Estimação', orderIndex: 5, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Despesas Pessoais', orderIndex: 6, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Lazer', orderIndex: 7, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Impostos', orderIndex: 8, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Despesas Empresa', orderIndex: 9, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Planejamento Financeiro', orderIndex: 10, parentId: 'Despesas Fixas', type: 'despesa' },
    { name: 'Despesas Variáveis', orderIndex: 2, parentId: 'Despesas', type: 'despesa' },
    { name: 'Investimentos', orderIndex: 3, parentId: null, type: 'investimento' },
  ],
  itensPorGrupo: {
    'Entradas Fixas': [
      { name: 'Salário', significado: 'Remuneração mensal', rank: 1 },
      { name: "Receita Proventos FII's", significado: 'Proventos de fundos imobiliários', rank: 2 },
      { name: 'Receita Renda Fixa (Préfixado)', significado: 'Renda fixa prefixada', rank: 3 },
      { name: 'Receita Renda Fixa (Pósfixado)', significado: 'Renda fixa pós-fixada', rank: 4 },
      { name: 'Receita Renda Fixa (Híbridos)', significado: 'Renda fixa híbrida', rank: 5 },
      { name: 'Aluguéis', significado: 'Recebimento de aluguéis', rank: 6 },
      { name: 'Outros', significado: 'Outras receitas fixas', rank: 7 },
    ],
    'Sem Tributação': [
      { name: 'Empréstimos' },
      { name: 'Recebimento de Terceiros' },
      { name: 'Venda de Opções' },
      { name: 'DayTrade' },
      { name: 'Cash Back' },
      { name: '13º Salário' },
      { name: 'Pacote Benefícios' },
      { name: 'Ganho de Capital Aplicações com Isenção' },
      { name: 'Saldo Caixa Mês anterior' },
      { name: 'Férias' },
      { name: 'Outros' },
    ],
    'Com Tributação': [
      { name: 'Empresa' },
      { name: 'Doações' },
      { name: 'Ganho de Capital Aplicações SEM Isenção' },
      { name: 'Outros' },
    ],
    'Habitação': [
      { name: 'Aluguel / Prestação' },
      { name: 'Condomínio' },
      { name: 'IPTU + Taxas Municipais' },
      { name: 'Conta de energia' },
      { name: 'Internet' },
      { name: 'Conta de água' },
      { name: 'Gás' },
      { name: 'Alarme' },
      { name: 'Telefone fixo' },
      { name: 'Telefones celulares' },
      { name: 'Supermercado' },
      { name: 'Padaria' },
      { name: 'Empregados/ Diaristas' },
      { name: 'Lavanderia' },
      { name: 'Seguro Residência' },
      { name: 'Outros' },
    ],
    'Transporte': [
      { name: 'Prestação Moto/ Carro' },
      { name: 'IPVA + Seguro Obrigatório Carro' },
      { name: 'Licenciamento Carro' },
      { name: 'Seguro Carro' },
      { name: 'Combustível' },
      { name: 'Alinhamento e Balanceamento' },
      { name: 'Pneu' },
      { name: 'Estacionamentos' },
      { name: 'Lavagens' },
      { name: 'Manutenção / Revisões' },
      { name: 'Multas' },
      { name: 'Ônibus (Buser)' },
      { name: 'Uber' },
      { name: 'Metro' },
      { name: 'Pedágio' },
      { name: 'Pedágio (Sem parar mensalidade)' },
      { name: 'Aluguel garagem' },
      { name: 'Acessórios' },
      { name: 'Outros' },
    ],
    'Saúde': [
      { name: 'Plano de Saúde' },
      { name: 'Seguro Vida' },
      { name: 'Médicos e terapeutas' },
      { name: 'Dentista' },
      { name: 'Medicamentos' },
      { name: 'Nutricionista' },
      { name: 'Exames' },
      { name: 'Fisioterapia' },
      { name: 'Outros' },
    ],
    'Educação': [
      { name: 'Escola/Faculdade' },
      { name: 'Cursos' },
      { name: 'Material escolar' },
      { name: 'Transporte escolar' },
      { name: 'Outros' },
    ],
    'Animais de Estimação': [
      { name: 'Ração' },
      { name: 'Veterinário' },
      { name: 'Banho e tosa' },
      { name: 'Vacinas' },
      { name: 'Outros' },
    ],
    'Despesas Pessoais': [
      { name: 'Roupas' },
      { name: 'Calçados' },
      { name: 'Acessórios' },
      { name: 'Cuidados pessoais' },
      { name: 'Outros' },
    ],
    'Lazer': [
      { name: 'Cinema' },
      { name: 'Teatro' },
      { name: 'Restaurantes' },
      { name: 'Viagens' },
      { name: 'Hobbies' },
      { name: 'Outros' },
    ],
    'Impostos': [
      { name: 'IRPF' },
      { name: 'ISS' },
      { name: 'Outros impostos' },
    ],
    'Despesas Empresa': [
      { name: 'Aluguel' },
      { name: 'Funcionários' },
      { name: 'Material de escritório' },
      { name: 'Outros' },
    ],
    'Planejamento Financeiro': [
      { name: 'Reserva de emergência' },
      { name: 'Investimentos' },
      { name: 'Previdência' },
      { name: 'Outros' },
    ],
    'Despesas Variáveis': [
      { name: 'Lazer' },
      { name: 'Compras' },
      { name: 'Viagem' },
      { name: 'Outros' },
    ],
    'Investimentos': [
      { name: 'Reserva Emergência' },
      { name: 'Reserva Oportunidade' },
      { name: 'Renda Fixa & Fundos Renda Fixa' },
      { name: 'Fundos (FIM / FIA)' },
      { name: "FII's" },
      { name: 'Ações' },
      { name: 'STOCKS' },
      { name: "REIT's" },
      { name: "ETF's" },
      { name: 'Moedas, Criptomoedas & Outros' },
      { name: 'Previdência & Seguros' },
      { name: 'Imóveis Físicos' },
    ],
  },
};

export async function seedTemplates(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Criando templates padrão (userId = null)...\n');

  const existingTemplates = await prisma.cashflowGroup.count({
    where: { userId: null, parentId: null },
  });

  if (existingTemplates >= 3) {
    console.log('✅ Templates já existem no banco. Pulando criação.\n');
    return;
  }

  const createdGroups: Record<string, { id: string; name: string }> = {};

  for (const grupo of CASHFLOW_TEMPLATE_STRUCTURE.grupos) {
    const groupData = {
      userId: null as null,
      name: grupo.name,
      type: grupo.type,
      orderIndex: grupo.orderIndex,
      parentId:
        grupo.parentId && createdGroups[grupo.parentId]
          ? createdGroups[grupo.parentId].id
          : null,
    };

    const group = await prisma.cashflowGroup.create({ data: groupData });
    createdGroups[grupo.name] = { id: group.id, name: group.name };
    console.log(`   ✅ ${grupo.name} criado como template`);
  }

  console.log('\n📝 Criando itens padrão (templates)...\n');
  let itemsCount = 0;

  for (const [groupName, items] of Object.entries(
    CASHFLOW_TEMPLATE_STRUCTURE.itensPorGrupo,
  )) {
    const group = createdGroups[groupName];
    if (!group) {
      console.log(`   ⚠️  Grupo não encontrado: ${groupName}`);
      continue;
    }

    if (!items.length) continue;

    await prisma.cashflowItem.createMany({
      data: items.map((item) => ({
        userId: null,
        groupId: group.id,
        name: item.name,
        significado: item.significado ?? null,
        rank: item.rank ?? null,
      })),
    });
    itemsCount += items.length;
    console.log(`   ✅ ${items.length} itens criados para ${groupName}`);
  }

  console.log(
    `\n✅ Estrutura padrão criada: ${Object.keys(createdGroups).length} grupos, ${itemsCount} itens\n`,
  );
}

export default seedTemplates;

async function cloneTemplatesForUser(prisma: PrismaClient, userId: string) {
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

async function seedCashflowValues(
  prisma: PrismaClient,
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

async function seedCashflowMovements(
  prisma: PrismaClient,
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

async function seedDemoUsers(prisma: PrismaClient) {
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

  await cloneTemplatesForUser(prisma, demoUser.id);

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

  await seedCashflowValues(prisma, demoUser.id, incomes, 2025);
  await seedCashflowValues(prisma, demoUser.id, expenses, 2025);
  await seedCashflowMovements(prisma, demoUser.id, 2025, incomes, expenses);

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

async function runSeed() {
  const prisma = new PrismaClient();
  try {
    await seedTemplates(prisma);
    await seedDemoUsers(prisma);
  } catch (error) {
    console.error('❌ Erro durante seed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]) {
  const isDirectExecution =
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

  if (isDirectExecution) {
    void runSeed();
  }
}


