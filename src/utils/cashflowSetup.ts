import prisma from '@/lib/prisma';

// Estrutura padrão de cashflow para novos usuários
const DEFAULT_CASHFLOW_STRUCTURE = {
  grupos: [
    { name: 'Entradas Fixas', order: 1 },
    { name: 'Entradas Variáveis', order: 2 },
    { name: 'Despesas Fixas', order: 3 },
    { name: 'Despesas Variáveis', order: 4 },
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
    'Entradas Variáveis': [
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
    'Despesas Fixas': [
      { descricao: 'Moradia' },
      { descricao: 'Alimentação' },
      { descricao: 'Transporte' },
      { descricao: 'Saúde' },
      { descricao: 'Educação' },
      { descricao: 'Serviços' },
      { descricao: 'Outros' },
    ],
    'Despesas Variáveis': [
      { descricao: 'Lazer' },
      { descricao: 'Compras' },
      { descricao: 'Viagem' },
      { descricao: 'Outros' },
    ],
  },
};

export async function setupCashflowForUser(userId: string) {
  try {
    for (const grupo of DEFAULT_CASHFLOW_STRUCTURE.grupos) {
      const g = await prisma.cashflowGroup.create({
        data: {
          userId,
          name: grupo.name,
          order: grupo.order,
        },
      });
      
      let itemOrder = 1;
      for (const item of DEFAULT_CASHFLOW_STRUCTURE.itensPorGrupo[grupo.name] || []) {
        await prisma.cashflowItem.create({
          data: {
            groupId: g.id,
            descricao: item.descricao,
            significado: item.significado,
            rank: item.rank,
            percentTotal: item.percentTotal,
            order: itemOrder++,
          },
        });
      }
    }
    
    console.log(`Estrutura de cashflow criada para usuário ${userId}`);
  } catch (error) {
    console.error('Erro ao criar estrutura de cashflow:', error);
    throw error;
  }
} 