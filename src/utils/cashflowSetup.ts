import prisma from '@/lib/prisma';

// Estrutura padrão de cashflow para novos usuários (igual ao seed)
const DEFAULT_CASHFLOW_STRUCTURE = {
  grupos: [
    { name: 'Entradas', order: 1, parentId: null, type: 'Entradas' },
    { name: 'Entradas Fixas', order: 1, parentId: 'Entradas', type: 'Entradas' },
    { name: 'Entradas Variáveis', order: 2, parentId: 'Entradas', type: 'Entradas' },
    { name: 'Sem Tributação', order: 1, parentId: 'Entradas Variáveis', type: 'Entradas' },
    { name: 'Com Tributação', order: 2, parentId: 'Entradas Variáveis', type: 'Entradas' },
    { name: 'Despesas', order: 2, parentId: null, type: 'Despesas' },
    { name: 'Despesas Fixas', order: 1, parentId: 'Despesas', type: 'Despesas' },
    { name: 'Habitação', order: 1, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Transporte', order: 2, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Saúde', order: 3, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Educação', order: 4, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Animais de Estimação', order: 5, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Despesas Pessoais', order: 6, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Lazer', order: 7, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Impostos', order: 8, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Despesas Empresa', order: 9, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Planejamento Financeiro', order: 10, parentId: 'Despesas Fixas', type: 'Despesas' },
    { name: 'Despesas Variáveis', order: 2, parentId: 'Despesas', type: 'Despesas' },
    { name: 'Investimentos', order: 3, parentId: null, type: 'Despesas' },
  ],
  itensPorGrupo: {
    'Entradas Fixas': [
      { descricao: 'Salário', significado: 'Remuneração mensal', rank: 1, percentTotal: 60 },
      { descricao: "Receita Proventos FII's", significado: 'Proventos de fundos imobiliários', rank: 2, percentTotal: 10 },
      { descricao: 'Receita Renda Fixa (Préfixado)', significado: 'Renda fixa prefixada', rank: 3, percentTotal: 5 },
      { descricao: 'Receita Renda Fixa (Pósfixado)', significado: 'Renda fixa pós-fixada', rank: 4, percentTotal: 5 },
      { descricao: 'Receita Renda Fixa (Híbridos)', significado: 'Renda fixa híbrida', rank: 5, percentTotal: 5 },
      { descricao: 'Aluguéis', significado: 'Recebimento de aluguéis', rank: 6, percentTotal: 10 },
      { descricao: 'Outros', significado: 'Outras receitas fixas', rank: 7, percentTotal: 5 },
    ],
    'Sem Tributação': [
      { descricao: 'Empréstimos' },
      { descricao: 'Recebimento de Terceiros' },
      { descricao: 'Venda de Opções' },
      { descricao: 'DayTrade' },
      { descricao: 'Cash Back' },
      { descricao: '13º Salário' },
      { descricao: 'Pacote Benefícios' },
      { descricao: 'Ganho de Capital Aplicações com Isenção' },
      { descricao: 'Saldo Caixa Mês anterior' },
      { descricao: 'Férias' },
      { descricao: 'Outros' },
    ],
    'Com Tributação': [
      { descricao: 'Empresa' },
      { descricao: 'Doações' },
      { descricao: 'Ganho de Capital Aplicações SEM Isenção' },
      { descricao: 'Outros' },
    ],
    'Habitação': [
      { descricao: 'Aluguel / Prestação' },
      { descricao: 'Condomínio' },
      { descricao: 'IPTU + Taxas Municipais' },
      { descricao: 'Conta de energia' },
      { descricao: 'Internet' },
      { descricao: 'Conta de água' },
      { descricao: 'Gás' },
      { descricao: 'Alarme' },
      { descricao: 'Telefone fixo' },
      { descricao: 'Telefones celulares' },
      { descricao: 'Supermercado' },
      { descricao: 'Padaria' },
      { descricao: 'Empregados/ Diaristas' },
      { descricao: 'Lavanderia' },
      { descricao: 'Seguro Residência' },
      { descricao: 'Outros' },
    ],
    'Transporte': [
      { descricao: 'Prestação Moto/ Carro' },
      { descricao: 'IPVA + Seguro Obrigatório Carro' },
      { descricao: 'Licenciamento Carro' },
      { descricao: 'Seguro Carro' },
      { descricao: 'Combustível' },
      { descricao: 'Alinhamento e Balanceamento' },
      { descricao: 'Pneu' },
      { descricao: 'Estacionamentos' },
      { descricao: 'Lavagens' },
      { descricao: 'Manutenção / Revisões' },
      { descricao: 'Multas' },
      { descricao: 'Ônibus (Buser)' },
      { descricao: 'Uber' },
      { descricao: 'Metro' },
      { descricao: 'Pedágio' },
      { descricao: 'Pedágio (Sem parar mensalidade)' },
      { descricao: 'Aluguel garagem' },
      { descricao: 'Acessórios' },
      { descricao: 'Outros' },
    ],
    'Saúde': [
      { descricao: 'Plano de Saúde' },
      { descricao: 'Seguro Vida' },
      { descricao: 'Médicos e terapeutas' },
      { descricao: 'Dentista' },
      { descricao: 'Medicamentos' },
      { descricao: 'Nutricionista' },
      { descricao: 'Exames' },
      { descricao: 'Fisioterapia' },
      { descricao: 'Outros' },
    ],
    'Educação': [
      { descricao: 'Escola/Faculdade' },
      { descricao: 'Cursos' },
      { descricao: 'Material escolar' },
      { descricao: 'Transporte escolar' },
      { descricao: 'Outros' },
    ],
    'Animais de Estimação': [
      { descricao: 'Ração' },
      { descricao: 'Veterinário' },
      { descricao: 'Banho e tosa' },
      { descricao: 'Vacinas' },
      { descricao: 'Outros' },
    ],
    'Despesas Pessoais': [
      { descricao: 'Roupas' },
      { descricao: 'Calçados' },
      { descricao: 'Acessórios' },
      { descricao: 'Cuidados pessoais' },
      { descricao: 'Outros' },
    ],
    'Lazer': [
      { descricao: 'Cinema' },
      { descricao: 'Teatro' },
      { descricao: 'Restaurantes' },
      { descricao: 'Viagens' },
      { descricao: 'Hobbies' },
      { descricao: 'Outros' },
    ],
    'Impostos': [
      { descricao: 'IRPF' },
      { descricao: 'ISS' },
      { descricao: 'Outros impostos' },
    ],
    'Despesas Empresa': [
      { descricao: 'Aluguel' },
      { descricao: 'Funcionários' },
      { descricao: 'Material de escritório' },
      { descricao: 'Outros' },
    ],
    'Planejamento Financeiro': [
      { descricao: 'Reserva de emergência' },
      { descricao: 'Investimentos' },
      { descricao: 'Previdência' },
      { descricao: 'Outros' },
    ],
    'Despesas Variáveis': [
      { descricao: 'Lazer' },
      { descricao: 'Compras' },
      { descricao: 'Viagem' },
      { descricao: 'Outros' },
    ],
    'Investimentos': [
      { descricao: 'Reserva Emergência' },
      { descricao: 'Reserva Oportunidade' },
      { descricao: 'Renda Fixa & Fundos Renda Fixa' },
      { descricao: 'Fundos (FIM / FIA)' },
      { descricao: 'FII\'s' },
      { descricao: 'Ações' },
      { descricao: 'STOCKS' },
      { descricao: 'REIT\'s' },
      { descricao: 'ETF\'s' },
      { descricao: 'Moedas, Criptomoedas & Outros' },
      { descricao: 'Previdência & Seguros' },
      { descricao: 'Imóveis Físicos' },
    ],
  },
};

export async function setupCashflowForUser(userId: string) {
  try {
    // Criar grupos com hierarquia
    const createdGroups: { [key: string]: { id: string; [key: string]: unknown } } = {};
    
    console.log('📁 Criando grupos...');
    for (const grupo of DEFAULT_CASHFLOW_STRUCTURE.grupos) {
      const groupData: {
        userId: string;
        name: string;
        type: string;
        order: number;
        parentId?: string;
      } = {
        userId,
        name: grupo.name,
        type: grupo.type,
        order: grupo.order,
      };
      
      if (grupo.parentId && createdGroups[grupo.parentId]) {
        groupData.parentId = createdGroups[grupo.parentId].id;
      }
      
      const g = await prisma.cashflowGroup.create({
        data: groupData,
      });
      
      createdGroups[grupo.name] = g;
      console.log(`  ✅ ${grupo.name} criado`);
    }

    console.log('\n📝 Criando itens...');
    
    // Criar itens apenas para grupos finais (que não têm filhos)
    for (const grupo of DEFAULT_CASHFLOW_STRUCTURE.grupos) {
      const hasChildren = DEFAULT_CASHFLOW_STRUCTURE.grupos.some(g => g.parentId === grupo.name);
      if (!hasChildren) {
        const group = createdGroups[grupo.name];
        if (!group) {
          console.warn(`⚠️  Grupo não encontrado: ${grupo.name}`);
          continue;
        }

        const items = (DEFAULT_CASHFLOW_STRUCTURE.itensPorGrupo as Record<string, Array<{ descricao: string; significado?: string; rank?: number; percentTotal?: number }>>)[grupo.name] || [];
        console.log(`  📋 ${grupo.name}: ${items.length} itens`);
        
        let itemOrder = 1;
        for (const item of items) {
          await prisma.cashflowItem.create({
            data: {
              groupId: group.id,
              descricao: item.descricao,
              significado: item.significado || null,
              rank: item.rank || null,
              percentTotal: item.percentTotal || null,
              order: itemOrder++,
            },
          });
        }
        console.log(`    ✅ ${items.length} itens criados para ${grupo.name}`);
      }
    }
    
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
          orderBy: { order: 'asc' }
        },
        children: {
          include: {
            items: {
              orderBy: { order: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: { order: 'asc' }
    });

    return groups;
  } catch (error) {
    console.error('Erro ao buscar estrutura do usuário:', error);
    throw error;
  }
} 