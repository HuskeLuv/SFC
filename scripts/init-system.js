const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function initSystem() {
  try {
    console.log('🚀 Inicializando templates padrão do sistema...\n');

    // Verificar se já existem templates
    const existingTemplates = await prisma.cashflowGroupTemplate.count();
    
    if (existingTemplates > 0) {
      console.log(`⚠️ Sistema já possui ${existingTemplates} templates`);
      console.log('💡 Para recriar, delete os templates existentes primeiro');
      return;
    }

    // Definir estrutura hierárquica padrão - APENAS grupos principais e subgrupos
    const grupos = [
      // Grupos principais (nível 1)
      { name: 'Entradas', order: 1, parentId: null, type: 'ENTRADA' },
      { name: 'Despesas', order: 2, parentId: null, type: 'DESPESA' },
      { name: 'Investimentos', order: 3, parentId: null, type: 'DESPESA' },
      
      // Subgrupos de Entradas (nível 2)
      { name: 'Entradas Fixas', order: 1, parentId: 'Entradas', type: 'ENTRADA' },
      { name: 'Entradas Variáveis', order: 2, parentId: 'Entradas', type: 'ENTRADA' },
      
      // Subgrupos de Despesas (nível 2)
      { name: 'Despesas Fixas', order: 1, parentId: 'Despesas', type: 'DESPESA' },
      { name: 'Despesas Variáveis', order: 2, parentId: 'Despesas', type: 'DESPESA' },
      
      // Sub-subgrupos de Entradas Variáveis (nível 3)
      { name: 'Sem Tributação', order: 1, parentId: 'Entradas Variáveis', type: 'ENTRADA' },
      { name: 'Com Tributação', order: 2, parentId: 'Entradas Variáveis', type: 'ENTRADA' },
      
      // Sub-subgrupos de Despesas Fixas (nível 3)
      { name: 'Habitação', order: 1, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Transporte', order: 2, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Saúde', order: 3, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Educação', order: 4, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Animais de Estimação', order: 5, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Despesas Pessoais', order: 6, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Lazer', order: 7, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Impostos', order: 8, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Despesas Empresa', order: 9, parentId: 'Despesas Fixas', type: 'DESPESA' },
      { name: 'Planejamento Financeiro', order: 10, parentId: 'Despesas Fixas', type: 'DESPESA' },
    ];

    console.log('📁 Criando grupos...');
    
    // Criar grupos em ordem hierárquica
    const createdTemplates = {};
    
    // Primeiro criar grupos principais (sem parentId)
    for (const grupo of grupos.filter(g => !g.parentId)) {
      const created = await prisma.cashflowGroupTemplate.create({
        data: {
          name: grupo.name,
          type: grupo.type,
          order: grupo.order,
          description: `Grupo principal: ${grupo.name}`,
          isSystem: true,
          isActive: true,
        }
      });
      
      createdTemplates[grupo.name] = created;
      console.log(`  ✅ ${grupo.name} (${grupo.type}) criado`);
    }

    // Depois criar subgrupos (com parentId)
    for (const grupo of grupos.filter(g => g.parentId)) {
      const parentTemplate = createdTemplates[grupo.parentId];
      if (parentTemplate) {
        const created = await prisma.cashflowGroupTemplate.create({
          data: {
            name: grupo.name,
            type: grupo.type,
            order: grupo.order,
            description: `Subgrupo de ${grupo.parentId}: ${grupo.name}`,
            parentId: parentTemplate.id,
            isSystem: true,
            isActive: true,
          }
        });
        
        createdTemplates[grupo.name] = created;
        console.log(`  ✅ ${grupo.name} criado sob ${grupo.parentId}`);
      }
    }

    // Definir itens para cada grupo
    const itens = {
      'Entradas Fixas': [
        { descricao: 'Salário', significado: 'Remuneração mensal' },
        { descricao: "Receita Proventos FII's", significado: 'Proventos de fundos imobiliários' },
        { descricao: 'Receita Renda Fixa (Préfixado)', significado: 'Renda fixa prefixada' },
        { descricao: 'Receita Renda Fixa (Pósfixado)', significado: 'Renda fixa pós-fixada' },
        { descricao: 'Receita Renda Fixa (Híbridos)', significado: 'Renda fixa híbrida' },
        { descricao: 'Aluguéis', significado: 'Recebimento de aluguéis' },
        { descricao: 'Outros', significado: 'Outras receitas fixas' },
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
      'Investimentos': [
        { descricao: 'Reserva Emergência', significado: 'Reserva para emergências financeiras' },
        { descricao: 'Reserva Oportunidade', significado: 'Reserva para aproveitar oportunidades de investimento' },
        { descricao: 'Renda Fixa & Fundos Renda Fixa', significado: 'Investimentos em renda fixa e fundos de renda fixa' },
        { descricao: 'Fundos (FIM / FIA)', significado: 'Fundos de investimento multimercado e fundos de ações' },
        { descricao: 'FII\'s', significado: 'Fundos Imobiliários' },
        { descricao: 'Ações', significado: 'Investimentos em ações individuais' },
        { descricao: 'STOCKS', significado: 'Investimentos em ações internacionais' },
        { descricao: 'REIT\'s', significado: 'Real Estate Investment Trusts' },
        { descricao: 'ETF\'s', significado: 'Exchange Traded Funds' },
        { descricao: 'Moedas, Criptomoedas & Outros', significado: 'Investimentos em moedas estrangeiras e criptomoedas' },
        { descricao: 'Previdência & Seguros', significado: 'Investimentos em previdência privada e seguros' },
        { descricao: 'Imóveis Físicos', significado: 'Investimentos em imóveis físicos' },
      ],
      'Despesas Variáveis': [
        { descricao: 'Lazer' },
        { descricao: 'Compras' },
        { descricao: 'Viagem' },
        { descricao: 'Outros' },
      ],
    };

    console.log('\n📋 Criando templates dos itens...');
    
    let totalItems = 0;
    
    for (const [groupName, groupItems] of Object.entries(itens)) {
      const groupTemplate = createdTemplates[groupName];
      if (groupTemplate) {
        console.log(`  📁 ${groupName}: ${groupItems.length} itens`);
        
        for (let i = 0; i < groupItems.length; i++) {
          const item = groupItems[i];
          await prisma.cashflowItemTemplate.create({
            data: {
              groupTemplateId: groupTemplate.id,
              descricao: item.descricao,
              significado: item.significado || '',
              rank: i + 1,
              percentTotal: 0,
              order: i + 1,
              categoria: groupName === 'Investimentos' ? 'Investimento' : 'Geral',
              formaPagamento: 'PIX',
              isInvestment: groupName === 'Investimentos',
              isActive: true,
              isSystem: true,
            }
          });
          totalItems++;
        }
      }
    }

    console.log('\n✅ Templates padrão do sistema criados com sucesso!');
    console.log(`📊 Estrutura criada: ${Object.keys(createdTemplates).length} grupos e ${totalItems} itens`);
    console.log('\n💡 Agora cada usuário terá sua estrutura criada automaticamente!');

  } catch (error) {
    console.error('❌ Erro durante a inicialização:', error);
    throw error;
  }
}

initSystem()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  }); 