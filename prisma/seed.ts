import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...\n');

    // Criar um usuário padrão para os dados de exemplo
    const hashedPassword = await bcrypt.hash('123456', 10);
    const defaultUser = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        password: hashedPassword,
        name: 'Administrador',
      },
    });

    console.log(`✅ Usuário criado: ${defaultUser.name} (${defaultUser.email})`);

    // Grupos principais e subgrupos com type field
    const grupos = [
      { name: 'Entradas', order: 1, parentId: null, type: 'entrada' },
      { name: 'Entradas Fixas', order: 1, parentId: 'Entradas', type: 'entrada' },
      { name: 'Entradas Variáveis', order: 2, parentId: 'Entradas', type: 'entrada' },
      { name: 'Sem Tributação', order: 1, parentId: 'Entradas Variáveis', type: 'entrada' },
      { name: 'Com Tributação', order: 2, parentId: 'Entradas Variáveis', type: 'entrada' },
      { name: 'Despesas', order: 2, parentId: null, type: 'despesa' },
      { name: 'Despesas Fixas', order: 1, parentId: 'Despesas', type: 'despesa' },
      { name: 'Habitação', order: 1, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Transporte', order: 2, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Saúde', order: 3, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Educação', order: 4, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Animais de Estimação', order: 5, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Despesas Pessoais', order: 6, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Lazer', order: 7, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Impostos', order: 8, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Despesas Empresa', order: 9, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Planejamento Financeiro', order: 10, parentId: 'Despesas Fixas', type: 'despesa' },
      { name: 'Despesas Variáveis', order: 2, parentId: 'Despesas', type: 'despesa' },
      { name: 'Investimentos', order: 3, parentId: null, type: 'investimento' },
    ];

    // Itens por grupo com valores mensais realistas
    const itensPorGrupo: Record<string, { 
      descricao: string; 
      significado?: string; 
      rank?: number; 
      percentTotal?: number;
      valoresMensais: number[]; // Array com 12 valores (Jan a Dez)
    }[]> = {
      'Entradas Fixas': [
        { 
          descricao: 'Salário', 
          significado: 'Remuneração mensal', 
          rank: 1, 
          percentTotal: 60,
          valoresMensais: [8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500]
        },
        { 
          descricao: "Receita Proventos FII's", 
          significado: 'Proventos de fundos imobiliários', 
          rank: 2, 
          percentTotal: 10,
          valoresMensais: [120, 135, 110, 125, 140, 130, 115, 145, 120, 135, 125, 140]
        },
        { 
          descricao: 'Receita Renda Fixa (Préfixado)', 
          significado: 'Renda fixa prefixada', 
          rank: 3, 
          percentTotal: 5,
          valoresMensais: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80]
        },
        { 
          descricao: 'Receita Renda Fixa (Pósfixado)', 
          significado: 'Renda fixa pós-fixada', 
          rank: 4, 
          percentTotal: 5,
          valoresMensais: [75, 78, 82, 79, 85, 81, 83, 77, 84, 80, 86, 82]
        },
        { 
          descricao: 'Receita Renda Fixa (Híbridos)', 
          significado: 'Renda fixa híbrida', 
          rank: 5, 
          percentTotal: 5,
          valoresMensais: [60, 62, 65, 63, 68, 64, 66, 61, 67, 63, 69, 65]
        },
        { 
          descricao: 'Aluguéis', 
          significado: 'Recebimento de aluguéis', 
          rank: 6, 
          percentTotal: 10,
          valoresMensais: [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200]
        },
        { 
          descricao: 'Outros', 
          significado: 'Outras receitas fixas', 
          rank: 7, 
          percentTotal: 5,
          valoresMensais: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]
        },
      ],
      'Sem Tributação': [
        { 
          descricao: 'Empréstimos',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Recebimento de Terceiros',
          valoresMensais: [150, 0, 300, 0, 200, 0, 250, 0, 180, 0, 320, 0]
        },
        { 
          descricao: 'Venda de Opções',
          valoresMensais: [0, 450, 0, 380, 0, 520, 0, 410, 0, 480, 0, 390]
        },
        { 
          descricao: 'DayTrade',
          valoresMensais: [800, 650, 920, 750, 680, 890, 720, 850, 780, 920, 650, 880]
        },
        { 
          descricao: 'Cash Back',
          valoresMensais: [45, 52, 38, 61, 49, 55, 42, 58, 47, 53, 40, 56]
        },
        { 
          descricao: '13º Salário',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8500]
        },
        { 
          descricao: 'Pacote Benefícios',
          valoresMensais: [300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300]
        },
        { 
          descricao: 'Ganho de Capital Aplicações com Isenção',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Saldo Caixa Mês anterior',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Saldo em conta corrente',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Férias',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [100, 80, 120, 90, 110, 95, 105, 85, 115, 100, 90, 110]
        },
      ],
      'Com Tributação': [
        { 
          descricao: 'Empresa',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Doações',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Ganho de Capital Aplicações SEM Isenção',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
      ],
      'Habitação': [
        { 
          descricao: 'Aluguel / Prestação',
          valoresMensais: [2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500]
        },
        { 
          descricao: 'Condomínio',
          valoresMensais: [450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450]
        },
        { 
          descricao: 'IPTU + Taxas Municipais',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Conta de energia',
          valoresMensais: [180, 220, 190, 160, 140, 120, 130, 150, 170, 200, 210, 190]
        },
        { 
          descricao: 'Internet',
          valoresMensais: [89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89]
        },
        { 
          descricao: 'Conta de água',
          valoresMensais: [65, 70, 68, 62, 58, 55, 57, 60, 63, 67, 72, 69]
        },
        { 
          descricao: 'Gás',
          valoresMensais: [45, 50, 48, 42, 38, 35, 37, 40, 43, 47, 52, 49]
        },
        { 
          descricao: 'Alarme',
          valoresMensais: [35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35]
        },
        { 
          descricao: 'Telefone fixo',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Telefones celulares',
          valoresMensais: [89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89]
        },
        { 
          descricao: 'Supermercado',
          valoresMensais: [800, 750, 820, 780, 850, 800, 870, 830, 790, 860, 810, 880]
        },
        { 
          descricao: 'Padaria',
          valoresMensais: [120, 110, 125, 115, 130, 120, 135, 125, 118, 128, 122, 132]
        },
        { 
          descricao: 'Empregados/ Diaristas',
          valoresMensais: [300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300]
        },
        { 
          descricao: 'Lavanderia',
          valoresMensais: [80, 75, 85, 78, 88, 82, 90, 85, 77, 86, 80, 89]
        },
        { 
          descricao: 'Seguro Residência',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [100, 90, 110, 95, 105, 100, 115, 105, 98, 108, 102, 112]
        },
      ],
      'Transporte': [
        { 
          descricao: 'Prestação Moto/ Carro',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'IPVA + Seguro Obrigatório Carro',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Licenciamento Carro',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Seguro Carro',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Combustível',
          valoresMensais: [350, 380, 320, 300, 280, 260, 270, 290, 310, 340, 360, 330]
        },
        { 
          descricao: 'Alinhamento e Balanceamento',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Pneu',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Estacionamentos',
          valoresMensais: [120, 110, 130, 115, 125, 120, 135, 125, 118, 128, 122, 132]
        },
        { 
          descricao: 'Lavagens',
          valoresMensais: [60, 55, 65, 58, 62, 60, 68, 64, 57, 66, 61, 69]
        },
        { 
          descricao: 'Manutenção / Revisões',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Multas',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Ônibus (Buser)',
          valoresMensais: [80, 75, 85, 78, 82, 80, 88, 84, 77, 86, 81, 89]
        },
        { 
          descricao: 'Uber',
          valoresMensais: [150, 140, 160, 145, 155, 150, 165, 155, 148, 158, 152, 162]
        },
        { 
          descricao: 'Metro',
          valoresMensais: [60, 55, 65, 58, 62, 60, 68, 64, 57, 66, 61, 69]
        },
        { 
          descricao: 'Pedágio',
          valoresMensais: [40, 38, 42, 37, 41, 39, 43, 40, 36, 42, 38, 44]
        },
        { 
          descricao: 'Pedágio (Sem parar mensalidade)',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Aluguel garagem',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Acessórios',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [50, 45, 55, 48, 52, 50, 58, 54, 47, 56, 51, 59]
        },
      ],
      'Saúde': [
        { 
          descricao: 'Plano de Saúde',
          valoresMensais: [350, 350, 350, 350, 350, 350, 350, 350, 350, 350, 350, 350]
        },
        { 
          descricao: 'Seguro Vida',
          valoresMensais: [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120]
        },
        { 
          descricao: 'Médicos e terapeutas',
          valoresMensais: [200, 180, 220, 190, 210, 200, 230, 210, 185, 225, 195, 235]
        },
        { 
          descricao: 'Dentista',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Medicamentos',
          valoresMensais: [80, 75, 85, 78, 82, 80, 88, 84, 77, 86, 81, 89]
        },
        { 
          descricao: 'Nutricionista',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Exames',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Fisioterapia',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [30, 25, 35, 28, 32, 30, 38, 34, 27, 36, 31, 39]
        },
      ],
      'Educação': [
        { 
          descricao: 'Escola/Faculdade',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Cursos',
          valoresMensais: [150, 0, 200, 0, 180, 0, 220, 0, 160, 0, 190, 0]
        },
        { 
          descricao: 'Material escolar',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Transporte escolar',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [50, 40, 60, 45, 55, 50, 65, 55, 42, 58, 47, 62]
        },
      ],
      'Animais de Estimação': [
        { 
          descricao: 'Ração',
          valoresMensais: [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120]
        },
        { 
          descricao: 'Veterinário',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Banho e tosa',
          valoresMensais: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80]
        },
        { 
          descricao: 'Vacinas',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [30, 25, 35, 28, 32, 30, 38, 34, 27, 36, 31, 39]
        },
      ],
      'Despesas Pessoais': [
        { 
          descricao: 'Roupas',
          valoresMensais: [200, 180, 220, 190, 210, 200, 230, 210, 185, 225, 195, 235]
        },
        { 
          descricao: 'Calçados',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Acessórios',
          valoresMensais: [80, 75, 85, 78, 82, 80, 88, 84, 77, 86, 81, 89]
        },
        { 
          descricao: 'Cuidados pessoais',
          valoresMensais: [120, 110, 130, 115, 125, 120, 135, 125, 118, 128, 122, 132]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [50, 45, 55, 48, 52, 50, 58, 54, 47, 56, 51, 59]
        },
      ],
      'Lazer': [
        { 
          descricao: 'Cinema',
          valoresMensais: [60, 55, 65, 58, 62, 60, 68, 64, 57, 66, 61, 69]
        },
        { 
          descricao: 'Teatro',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Restaurantes',
          valoresMensais: [300, 280, 320, 290, 310, 300, 330, 310, 285, 325, 295, 335]
        },
        { 
          descricao: 'Viagens',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Hobbies',
          valoresMensais: [100, 90, 110, 95, 105, 100, 115, 105, 98, 108, 102, 112]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [80, 75, 85, 78, 82, 80, 88, 84, 77, 86, 81, 89]
        },
      ],
      'Impostos': [
        { 
          descricao: 'IRPF',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'ISS',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros impostos',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
      ],
      'Despesas Empresa': [
        { 
          descricao: 'Administrativas/Operacionais',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Fornecedores',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Taxas, Alvarás, Etc.',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Impostos, Contribuições Diretas',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Salários, Encargos e Benefícios',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Maquinários & Equipamentos',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Despesas com Vendas',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Despesas Financeiras',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [30, 25, 35, 28, 32, 30, 38, 34, 27, 36, 31, 39]
        },
      ],
      'Planejamento Financeiro': [
        { 
          descricao: 'Objetivo 1',
          valoresMensais: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]
        },
        { 
          descricao: 'Objetivo 2',
          valoresMensais: [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800]
        },
        { 
          descricao: 'Objetivo 3',
          valoresMensais: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]
        },
        { 
          descricao: 'Objetivo 4',
          valoresMensais: [100, 90, 110, 95, 105, 100, 115, 105, 98, 108, 102, 112]
        },
      ],
      'Investimentos': [
        { 
          descricao: 'Reserva Emergência',
          significado: 'Reserva para emergências financeiras',
          valoresMensais: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]
        },
        { 
          descricao: 'Reserva Oportunidade',
          significado: 'Reserva para aproveitar oportunidades de investimento',
          valoresMensais: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]
        },
        { 
          descricao: 'Renda Fixa & Fundos Renda Fixa',
          significado: 'Investimentos em renda fixa e fundos de renda fixa',
          valoresMensais: [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500]
        },
        { 
          descricao: 'Fundos (FIM / FIA)',
          significado: 'Fundos de investimento multimercado e fundos de ações',
          valoresMensais: [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800]
        },
        { 
          descricao: 'FII\'s',
          significado: 'Fundos Imobiliários',
          valoresMensais: [600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600]
        },
        { 
          descricao: 'Ações',
          significado: 'Investimentos em ações individuais',
          valoresMensais: [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200]
        },
        { 
          descricao: 'STOCKS',
          significado: 'Investimentos em ações internacionais',
          valoresMensais: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400]
        },
        { 
          descricao: 'REIT\'s',
          significado: 'Real Estate Investment Trusts',
          valoresMensais: [300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300]
        },
        { 
          descricao: 'ETF\'s',
          significado: 'Exchange Traded Funds',
          valoresMensais: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]
        },
        { 
          descricao: 'Moedas, Criptomoedas & Outros',
          significado: 'Investimentos em moedas estrangeiras e criptomoedas',
          valoresMensais: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]
        },
        { 
          descricao: 'Previdência & Seguros',
          significado: 'Investimentos em previdência privada e seguros',
          valoresMensais: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400]
        },
        { 
          descricao: 'Imóveis Físicos',
          significado: 'Investimentos em imóveis físicos',
          valoresMensais: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]
        },
      ],
      'Despesas Variáveis': [
        { 
          descricao: 'Lazer',
          valoresMensais: [150, 140, 160, 145, 155, 150, 165, 155, 148, 158, 152, 162]
        },
        { 
          descricao: 'Compras',
          valoresMensais: [200, 180, 220, 190, 210, 200, 230, 210, 185, 225, 195, 235]
        },
        { 
          descricao: 'Viagem',
          valoresMensais: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        { 
          descricao: 'Outros',
          valoresMensais: [100, 90, 110, 95, 105, 100, 115, 105, 98, 108, 102, 112]
        },
      ],
    };

    // Criar grupos com hierarquia
    const createdGroups: { [key: string]: any } = {};
    
    console.log('📁 Criando grupos...');
    for (const grupo of grupos) {
      const groupData: any = {
        name: grupo.name,
        type: grupo.type,
        orderIndex: grupo.order,
        user: { connect: { id: defaultUser.id } },
      };
      
      if (grupo.parentId && createdGroups[grupo.parentId]) {
        groupData.parent = { connect: { id: createdGroups[grupo.parentId].id } };
      }
      
      const g = await prisma.cashflowGroup.create({
        data: groupData,
      });
      
      createdGroups[grupo.name] = g;
      console.log(`  ✅ ${grupo.name} criado`);
    }

    console.log('\n📝 Criando itens e valores mensais...');
    
    // Criar itens apenas para grupos finais (que não têm filhos)
    for (const grupo of grupos) {
      const hasChildren = grupos.some(g => g.parentId === grupo.name);
      if (!hasChildren) {
        const group = createdGroups[grupo.name];
        if (!group) {
          console.warn(`⚠️  Grupo não encontrado: ${grupo.name}`);
          continue;
        }

        const items = itensPorGrupo[grupo.name] || [];
        console.log(`  📋 ${grupo.name}: ${items.length} itens`);
        
        for (const item of items) {
          const createdItem = await prisma.cashflowItem.create({
            data: {
              group: { connect: { id: group.id } },
              name: item.descricao,
              significado: item.significado || null,
              rank: item.rank || null,
            },
          });

          // Criar valores mensais para cada item
          let valuesCreated = 0;
          const currentYear = new Date().getFullYear();
          for (let month = 0; month < 12; month++) {
            if (item.valoresMensais[month] > 0) {
              await prisma.cashflowValue.create({
                data: {
                  itemId: createdItem.id,
                  userId: defaultUser.id,
                  year: currentYear,
                  month: month,
                  value: item.valoresMensais[month],
                },
              });
              valuesCreated++;
            }
          }
          console.log(`    ✅ ${item.descricao}: ${valuesCreated} valores mensais`);
        }
      }
    }

    console.log('\n🎉 Seed cashflow hierárquico populado com valores mensais realistas!');
    
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 