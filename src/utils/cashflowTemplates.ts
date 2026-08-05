import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

// ===== CASHFLOW TEMPLATES STRUCTURE =====

const CASHFLOW_TEMPLATE_STRUCTURE = {
  grupos: [
    { name: 'Entradas', orderIndex: 1, parentId: null, type: 'entrada' as const },
    { name: 'Entradas Fixas', orderIndex: 1, parentId: 'Entradas', type: 'entrada' as const },
    { name: 'Entradas Variáveis', orderIndex: 2, parentId: 'Entradas', type: 'entrada' as const },
    {
      name: 'Sem Tributação',
      orderIndex: 1,
      parentId: 'Entradas Variáveis',
      type: 'entrada' as const,
    },
    {
      name: 'Com Tributação',
      orderIndex: 2,
      parentId: 'Entradas Variáveis',
      type: 'entrada' as const,
    },
    { name: 'Despesas', orderIndex: 2, parentId: null, type: 'despesa' as const },
    { name: 'Despesas Fixas', orderIndex: 1, parentId: 'Despesas', type: 'despesa' as const },
    { name: 'Habitação', orderIndex: 1, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Transporte', orderIndex: 2, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Saúde', orderIndex: 3, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Educação', orderIndex: 4, parentId: 'Despesas Fixas', type: 'despesa' as const },
    {
      name: 'Animais de Estimação',
      orderIndex: 5,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    {
      name: 'Despesas Pessoais',
      orderIndex: 6,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    { name: 'Lazer', orderIndex: 7, parentId: 'Despesas Fixas', type: 'despesa' as const },
    { name: 'Impostos', orderIndex: 8, parentId: 'Despesas Fixas', type: 'despesa' as const },
    {
      name: 'Despesas com Dependentes',
      orderIndex: 9,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    {
      name: 'Despesas Empresa',
      orderIndex: 10,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    {
      name: 'Planejamento Financeiro',
      orderIndex: 11,
      parentId: 'Despesas Fixas',
      type: 'despesa' as const,
    },
    { name: 'Despesas Variáveis', orderIndex: 2, parentId: 'Despesas', type: 'despesa' as const },
    { name: 'Investimentos', orderIndex: 3, parentId: null, type: 'investimento' as const },
    // Bloco de SALDO (não é entrada nem despesa): o cliente informa manualmente
    // quanto ficou parado em cada banco no fim do mês. Alimenta o carry-over
    // "Saldo Conta Corrente Mês Anterior" e o Fluxo de Caixa livre.
    { name: 'Conta Corrente', orderIndex: 4, parentId: null, type: 'saldo' as const },
  ],
  itensPorGrupo: {
    'Entradas Fixas': [
      { name: 'Salário', significado: 'Remuneração mensal', rank: 'essencial' },
      {
        name: "Receita Proventos FII's",
        significado: 'Proventos de fundos imobiliários',
        rank: 'normal',
      },
      {
        name: 'Receita Renda Fixa (Préfixado)',
        significado: 'Renda fixa prefixada',
        rank: 'essencial',
      },
      {
        name: 'Receita Renda Fixa (Pósfixado)',
        significado: 'Renda fixa pós-fixada',
        rank: 'normal',
      },
      {
        name: 'Receita Renda Fixa (Híbridos)',
        significado: 'Renda fixa híbrida',
        rank: 'essencial',
      },
      { name: 'Aluguéis', significado: 'Recebimento de aluguéis', rank: 'normal' },
      { name: 'Outros', significado: 'Outras receitas fixas', rank: 'essencial' },
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
      { name: 'Férias' },
      { name: 'Outros' },
    ],
    'Com Tributação': [
      { name: 'Empresa' },
      { name: 'Doações' },
      { name: 'Ganho de Capital Aplicações SEM Isenção' },
      { name: 'Outros' },
    ],
    Habitação: [
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
    Transporte: [
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
    Saúde: [
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
    Educação: [
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
    Lazer: [
      { name: 'Cinema' },
      { name: 'Teatro' },
      { name: 'Restaurantes' },
      { name: 'Viagens' },
      { name: 'Hobbies' },
      { name: 'Outros' },
    ],
    Impostos: [{ name: 'IRPF' }, { name: 'ISS' }, { name: 'Outros impostos' }],
    // Itens espelham a seção "Despesas com dependentes" da planilha FLC
    'Despesas com Dependentes': [
      { name: 'Escola / Faculdade' },
      { name: 'Cursos' },
      { name: 'Pensão' },
      { name: 'Material escolar' },
      { name: 'Vestuário' },
      { name: 'Outros' },
    ],
    'Despesas Empresa': [
      { name: 'Administrativas/Operacionais' },
      { name: 'Fornecedores' },
      { name: 'Taxas, Alvarás, Etc.' },
      { name: 'Impostos, Contribuições Diretas' },
      { name: 'Salários, Encargos e Benefícios' },
      { name: 'Maquinários & Equipamentos' },
      { name: 'Despesas com Vendas' },
      { name: 'Despesas Financeiras' },
      { name: 'Outros' },
    ],
    // Os itens deste grupo são provisionados por usuário a partir do
    // Planejamento de Sonhos (linhas espelho, vínculo via objetivoId) — ver
    // src/services/planejamento/sonhoCashflowSync.ts. Sem placeholders no template.
    'Planejamento Financeiro': [],
    'Despesas Variáveis': [
      { name: 'Lazer' },
      { name: 'Compras' },
      { name: 'Viagem' },
      { name: 'Outros' },
    ],
    'Conta Corrente': [{ name: 'Banco 1' }, { name: 'Banco 2' }, { name: 'Banco 3' }],
    Investimentos: [
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
      { name: 'Previdência e Seguros' },
      { name: 'Imóveis Físicos' },
    ],
  },
};

// ===== ENSURE: CONTA CORRENTE (upgrade de template para bancos existentes) =====

// Cache de processo: uma vez confirmado que o template existe, não consulta de novo.
let contaCorrenteEnsured = false;

/**
 * Garante que o grupo template "Conta Corrente" (type='saldo') exista.
 * Bancos criados antes desta feature têm o seed completo mas não este grupo —
 * o seedTemplates() pula quando já há templates. Idempotente e barato
 * (1 findFirst por processo).
 */
export async function ensureContaCorrenteTemplate(): Promise<void> {
  if (contaCorrenteEnsured) return;

  const existing = await prisma.cashflowGroup.findFirst({
    where: { userId: null, parentId: null, type: 'saldo' },
    select: { id: true },
  });

  if (!existing) {
    const group = await prisma.cashflowGroup.create({
      data: {
        userId: null,
        name: 'Conta Corrente',
        type: 'saldo',
        orderIndex: 4,
        parentId: null,
      },
    });
    await prisma.cashflowItem.createMany({
      data: ['Banco 1', 'Banco 2', 'Banco 3'].map((name) => ({
        userId: null,
        groupId: group.id,
        name,
      })),
    });
    logger.info('✅ Template "Conta Corrente" criado (upgrade de template)');
  }

  contaCorrenteEnsured = true;
}

// ===== ENSURE: DESPESAS COM DEPENDENTES (upgrade de template para bancos existentes) =====

let dependentesEnsured = false;

const DEPENDENTES_GROUP_NAME = 'Despesas com Dependentes';
const DEPENDENTES_ITEMS = [
  'Escola / Faculdade',
  'Cursos',
  'Pensão',
  'Material escolar',
  'Vestuário',
  'Outros',
];

/**
 * Garante que o grupo template "Despesas com Dependentes" exista sob
 * "Despesas Fixas", entre Impostos (8) e Despesas Empresa (posição da seção na
 * planilha FLC). Bancos criados antes desta feature têm o seed completo mas não
 * este grupo. Rebaixa orderIndex >= 9 dos templates irmãos E dos overrides
 * personalizados (que copiam o orderIndex do template na personalização) para
 * o grupo novo não empatar com "Despesas Empresa" na árvore mesclada.
 * Idempotente e barato (1 findFirst por processo).
 */
export async function ensureDependentesTemplate(): Promise<void> {
  if (dependentesEnsured) return;

  const existing = await prisma.cashflowGroup.findFirst({
    where: { userId: null, name: DEPENDENTES_GROUP_NAME },
    select: { id: true },
  });

  if (!existing) {
    const despesasFixas = await prisma.cashflowGroup.findFirst({
      where: { userId: null, name: 'Despesas Fixas' },
      select: { id: true },
    });
    if (!despesasFixas) {
      // banco sem seed (seedTemplates ainda não rodou) — o seed novo já cria o grupo
      dependentesEnsured = true;
      return;
    }

    await prisma.$transaction(async (tx) => {
      const irmaosDepois = await tx.cashflowGroup.findMany({
        where: { userId: null, parentId: despesasFixas.id, orderIndex: { gte: 9 } },
        select: { id: true },
      });
      const idsDepois = irmaosDepois.map((g) => g.id);
      await tx.cashflowGroup.updateMany({
        where: { id: { in: idsDepois } },
        data: { orderIndex: { increment: 1 } },
      });
      await tx.cashflowGroup.updateMany({
        where: { templateId: { in: idsDepois } },
        data: { orderIndex: { increment: 1 } },
      });

      const group = await tx.cashflowGroup.create({
        data: {
          userId: null,
          name: DEPENDENTES_GROUP_NAME,
          type: 'despesa',
          orderIndex: 9,
          parentId: despesasFixas.id,
        },
      });
      await tx.cashflowItem.createMany({
        data: DEPENDENTES_ITEMS.map((name) => ({ userId: null, groupId: group.id, name })),
      });
    });
    logger.info('✅ Template "Despesas com Dependentes" criado (upgrade de template)');
  }

  dependentesEnsured = true;
}

// ===== SEED TEMPLATES =====

export async function seedTemplates() {
  logger.info('🌱 Criando templates padrão (userId = null)...\n');

  const existingTemplates = await prisma.cashflowGroup.count({
    where: { userId: null, parentId: null },
  });

  if (existingTemplates >= 3) {
    logger.info('✅ Templates já existem no banco. Pulando criação.\n');
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
        grupo.parentId && createdGroups[grupo.parentId] ? createdGroups[grupo.parentId].id : null,
    };

    const group = await prisma.cashflowGroup.create({ data: groupData });
    createdGroups[grupo.name] = { id: group.id, name: group.name };
    logger.info(`   ✅ ${grupo.name} criado como template`);
  }

  logger.info('\n📝 Criando itens padrão (templates)...\n');
  let itemsCount = 0;

  for (const [groupName, items] of Object.entries(CASHFLOW_TEMPLATE_STRUCTURE.itensPorGrupo)) {
    const group = createdGroups[groupName];
    if (!group) {
      logger.info(`   ⚠️  Grupo não encontrado: ${groupName}`);
      continue;
    }

    if (!items.length) continue;

    await prisma.cashflowItem.createMany({
      data: items.map((item) => ({
        userId: null,
        groupId: group.id,
        name: item.name,
        significado: 'significado' in item ? (item.significado ?? null) : null,
        rank: 'rank' in item ? (item.rank ?? null) : null,
      })),
    });
    itemsCount += items.length;
    logger.info(`   ✅ ${items.length} itens criados para ${groupName}`);
  }

  logger.info(
    `\n✅ Estrutura padrão criada: ${Object.keys(createdGroups).length} grupos, ${itemsCount} itens\n`,
  );
}
