import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed apenas para templates (userId = null)
 * Esta é a estrutura padrão que será herdada por todos os usuários
 */
async function seedTemplates() {
  try {
    console.log('🌱 Criando templates padrão (userId = null)...\n');

    // Verificar se já existem templates
    const existingTemplates = await prisma.cashflowGroup.count({
      where: { userId: null, parentId: null }
    });

    if (existingTemplates >= 3) {
      console.log('✅ Templates já existem no banco. Pulando criação.\n');
      return;
    }

    // Estrutura padrão
    const defaultStructure = {
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

    // Criar grupos templates
    const createdGroups: Record<string, { id: string; name: string }> = {};

    for (const grupo of defaultStructure.grupos) {
      const groupData: {
        userId: null;
        name: string;
        type: string;
        orderIndex: number;
        parentId: string | null;
      } = {
        userId: null, // Template padrão
        name: grupo.name,
        type: grupo.type,
        orderIndex: grupo.orderIndex,
        parentId: grupo.parentId && createdGroups[grupo.parentId]
          ? createdGroups[grupo.parentId].id
          : null,
      };

      const group = await prisma.cashflowGroup.create({
        data: groupData,
      });

      createdGroups[grupo.name] = { id: group.id, name: group.name };
      console.log(`   ✅ ${grupo.name} criado como template`);
    }

    // Criar itens templates
    console.log('\n📝 Criando itens padrão (templates)...\n');
    let itemsCount = 0;

    for (const [groupName, items] of Object.entries(defaultStructure.itensPorGrupo)) {
      const group = createdGroups[groupName];
      if (!group) {
        console.log(`   ⚠️  Grupo não encontrado: ${groupName}`);
        continue;
      }

      for (const item of items) {
        await prisma.cashflowItem.create({
          data: {
            userId: null, // Template padrão
            groupId: group.id,
            name: item.name,
            significado: item.significado || null,
            rank: item.rank || null,
          },
        });
        itemsCount++;
      }
      console.log(`   ✅ ${items.length} itens criados para ${groupName}`);
    }

    console.log(`\n✅ Estrutura padrão criada: ${Object.keys(createdGroups).length} grupos, ${itemsCount} itens\n`);

  } catch (error) {
    console.error('❌ Erro durante seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTemplates();

