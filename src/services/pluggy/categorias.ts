/**
 * Categoria do Pluggy (em inglês, árvore de 3 níveis — docs.pluggy.ai/docs/transaction-categories)
 * → linha do template do Fluxo de Caixa do MyFinance (nomes canônicos do
 * template de produção, set/2026). Sugestão, não decisão: o usuário confirma
 * na Caixa de entrada e pode escolher outra linha.
 *
 * Tipos:
 *  - 'linha'         → sugere um item (caminho de grupos + nome do item)
 *  - 'transferencia' → movimento entre contas próprias / pagamento de fatura:
 *                      não é receita nem despesa; sugestão = ignorar
 *  - 'investimento'  → aporte/resgate: a Carteira é a fonte; sugestão = ignorar
 *  - 'nenhuma'       → sem sugestão (o usuário escolhe)
 *
 * MAPA A VALIDAR COM O PEDRO (decisão 14/09/2026): os nomes do template são
 * os da FLC; itens que não existem no template (ex.: "Assinaturas") caem em
 * "Outros" do subgrupo mais próximo.
 */

export type SugestaoCategoria =
  | { tipo: 'linha'; caminho: readonly string[]; item: string }
  | { tipo: 'transferencia' | 'investimento' | 'nenhuma' };

const ENT_FIXAS = ['Entradas', 'Entradas Fixas'] as const;
const ENT_SEM_TRIB = ['Entradas', 'Entradas Variáveis', 'Sem Tributação'] as const;
const ENT_COM_TRIB = ['Entradas', 'Entradas Variáveis', 'Com Tributação'] as const;
const HABITACAO = ['Despesas', 'Despesas Fixas', 'Habitação'] as const;
const TRANSPORTE = ['Despesas', 'Despesas Fixas', 'Transporte'] as const;
const SAUDE = ['Despesas', 'Despesas Fixas', 'Saúde'] as const;
const EDUCACAO = ['Despesas', 'Despesas Fixas', 'Educação'] as const;
const PETS = ['Despesas', 'Despesas Fixas', 'Animais de Estimação'] as const;
const PESSOAIS = ['Despesas', 'Despesas Fixas', 'Despesas Pessoais'] as const;
const LAZER_FIXO = ['Despesas', 'Despesas Fixas', 'Lazer'] as const;
const IMPOSTOS = ['Despesas', 'Despesas Fixas', 'Impostos'] as const;
const DEPENDENTES = ['Despesas', 'Despesas Fixas', 'Despesas com Dependentes'] as const;
const FINANCEIRAS = ['Despesas', 'Despesas Fixas', 'Despesas Financeiras'] as const;
const VARIAVEIS = ['Despesas', 'Despesas Variáveis'] as const;

const linha = (caminho: readonly string[], item: string): SugestaoCategoria => ({
  tipo: 'linha',
  caminho,
  item,
});
const TRANSFERENCIA: SugestaoCategoria = { tipo: 'transferencia' };
const INVESTIMENTO: SugestaoCategoria = { tipo: 'investimento' };
const NENHUMA: SugestaoCategoria = { tipo: 'nenhuma' };

/** Chave = nome da categoria exatamente como o Pluggy devolve em `category`. */
const MAPA: Record<string, SugestaoCategoria> = {
  // Income
  Income: linha(ENT_SEM_TRIB, 'Outros'),
  Salary: linha(ENT_FIXAS, 'Salário'),
  Retirement: linha(ENT_FIXAS, 'Outros'),
  'Entrepreneurial activities': linha(ENT_COM_TRIB, 'Empresa'),
  'Government aid': linha(ENT_SEM_TRIB, 'Outros'),
  'Non-recurring income': linha(ENT_SEM_TRIB, 'Outros'),
  // Loans and Financing
  'Loans and Financing': linha(FINANCEIRAS, 'Outros'),
  'Late payment and overdraft costs': linha(FINANCEIRAS, 'Cheque Especial'),
  'Interests charged': linha(FINANCEIRAS, 'Outros'),
  Loans: linha(FINANCEIRAS, 'Outros'),
  Financing: linha(FINANCEIRAS, 'Outros'),
  'Real estate financing': linha(HABITACAO, 'Aluguel / Prestação'),
  'Vehicle Financing': linha(TRANSPORTE, 'Prestação Moto/ Carro'),
  'Student loan': linha(EDUCACAO, 'Outros'),
  // Investments — a Carteira é a fonte (aporte/resgate já entram por lá)
  Investments: INVESTIMENTO,
  'Automatic investment': INVESTIMENTO,
  'Fixed income': INVESTIMENTO,
  'Mutual funds': INVESTIMENTO,
  'Variable income': INVESTIMENTO,
  Margin: INVESTIMENTO,
  'Proceeds interests and dividends': INVESTIMENTO,
  Pension: INVESTIMENTO,
  // Transferências entre contas próprias e fatura: não é despesa
  'Same person transfer': TRANSFERENCIA,
  'Same person transfer - Cash': TRANSFERENCIA,
  'Same person transfer - PIX': TRANSFERENCIA,
  'Same person transfer - TED': TRANSFERENCIA,
  'Transfer - Internal': TRANSFERENCIA,
  'Credit card payment': TRANSFERENCIA,
  // Transferências genéricas: pode ser despesa real paga via Pix/boleto — o usuário decide
  Transfers: NENHUMA,
  'Transfer - Bank slip': NENHUMA,
  'Transfer - Bank slip (Boleto)': NENHUMA,
  'Transfer - Cash': NENHUMA,
  'Transfer - Check': NENHUMA,
  'Transfer - DOC': NENHUMA,
  'Transfer - Foreign exchange': NENHUMA,
  'Transfer - PIX': NENHUMA,
  'Transfer - TED': NENHUMA,
  'Third-party transfers': NENHUMA,
  'Bank slip': NENHUMA,
  'Debt card': NENHUMA,
  DOC: NENHUMA,
  PIX: NENHUMA,
  TED: NENHUMA,
  // Legal obligations
  'Legal obligations': NENHUMA,
  'Blocked balances': NENHUMA,
  Alimony: linha(DEPENDENTES, 'Pensão'),
  // Services
  Services: NENHUMA,
  Telecommunications: linha(HABITACAO, 'Telefones celulares'),
  Internet: linha(HABITACAO, 'Internet'),
  Mobile: linha(HABITACAO, 'Telefones celulares'),
  TV: linha(HABITACAO, 'Outros'),
  Education: linha(EDUCACAO, 'Outros'),
  'Online Courses': linha(EDUCACAO, 'Cursos'),
  University: linha(EDUCACAO, 'Escola/Faculdade'),
  School: linha(EDUCACAO, 'Escola/Faculdade'),
  Kindergarten: linha(EDUCACAO, 'Escola/Faculdade'),
  'Wellness and fitness': linha(SAUDE, 'Outros'),
  'Gyms and fitness centers': linha(SAUDE, 'Outros'),
  'Sports practice': linha(LAZER_FIXO, 'Hobbies'),
  Wellness: linha(PESSOAIS, 'Cuidados pessoais'),
  Tickets: linha(LAZER_FIXO, 'Outros'),
  'Stadiums and arenas': linha(LAZER_FIXO, 'Outros'),
  'Landmarks and museums': linha(LAZER_FIXO, 'Outros'),
  'Cinema, theater and concerts': linha(LAZER_FIXO, 'Cinema'),
  // Shopping
  Shopping: linha(VARIAVEIS, 'Compras'),
  'Online shopping': linha(VARIAVEIS, 'Compras'),
  Electronics: linha(VARIAVEIS, 'Compras'),
  'Pet supplies and vet': linha(PETS, 'Outros'),
  Clothing: linha(PESSOAIS, 'Roupas'),
  'Kids and toys': linha(DEPENDENTES, 'Outros'),
  Bookstore: linha(EDUCACAO, 'Material escolar'),
  'Sports goods': linha(PESSOAIS, 'Acessórios'),
  'Office Supplies': linha(VARIAVEIS, 'Compras'),
  Cashback: linha(ENT_SEM_TRIB, 'Cash Back'),
  // Digital services (o template não tem "Assinaturas")
  'Digital services': linha(LAZER_FIXO, 'Outros'),
  Gaming: linha(LAZER_FIXO, 'Hobbies'),
  'Video streaming': linha(LAZER_FIXO, 'Outros'),
  'Music streaming': linha(LAZER_FIXO, 'Outros'),
  // Alimentação
  Groceries: linha(HABITACAO, 'Supermercado'),
  'Food and drinks': linha(LAZER_FIXO, 'Restaurantes'),
  'Eating out': linha(LAZER_FIXO, 'Restaurantes'),
  'Food delivery': linha(LAZER_FIXO, 'Restaurantes'),
  // Travel
  Travel: linha(VARIAVEIS, 'Viagem'),
  'Airport and airlines': linha(VARIAVEIS, 'Viagem'),
  Accommodation: linha(VARIAVEIS, 'Viagem'),
  'Mileage programs': linha(VARIAVEIS, 'Viagem'),
  'Bus tickets': linha(VARIAVEIS, 'Viagem'),
  // Outros
  Donations: linha(FINANCEIRAS, 'Doações / Dízimos'),
  Gambling: linha(LAZER_FIXO, 'Outros'),
  Lottery: linha(LAZER_FIXO, 'Outros'),
  'Online bet': linha(LAZER_FIXO, 'Outros'),
  // Taxes
  Taxes: linha(IMPOSTOS, 'Outros impostos'),
  'Income taxes': linha(IMPOSTOS, 'IRPF'),
  'Taxes on investments': linha(IMPOSTOS, 'Outros impostos'),
  'Tax on financial operations': linha(FINANCEIRAS, 'Taxas Bancárias'),
  // Bank fees
  'Bank fees': linha(FINANCEIRAS, 'Taxas Bancárias'),
  'Account fees': linha(FINANCEIRAS, 'Taxas Bancárias'),
  'Wire transfer fees and ATM fees': linha(FINANCEIRAS, 'Taxa de TED'),
  'Credit card fees': linha(FINANCEIRAS, 'Anuidade cartão de crédito'),
  // Housing
  Housing: linha(HABITACAO, 'Outros'),
  Rent: linha(HABITACAO, 'Aluguel / Prestação'),
  Houseware: linha(HABITACAO, 'Outros'),
  'Urban land and building tax': linha(HABITACAO, 'IPTU + Taxas Municipais'),
  Utilities: linha(HABITACAO, 'Outros'),
  Water: linha(HABITACAO, 'Conta de água'),
  Electricity: linha(HABITACAO, 'Conta de energia'),
  Gas: linha(HABITACAO, 'Gás'),
  // Healthcare
  Healthcare: linha(SAUDE, 'Outros'),
  Dentist: linha(SAUDE, 'Dentista'),
  Pharmacy: linha(SAUDE, 'Medicamentos'),
  Optometry: linha(SAUDE, 'Médicos e terapeutas'),
  'Hospital clinics and labs': linha(SAUDE, 'Exames'),
  // Transportation
  Transportation: linha(TRANSPORTE, 'Outros'),
  'Taxi and ride-hailing': linha(TRANSPORTE, 'Uber'),
  'Public transportation': linha(TRANSPORTE, 'Metro'),
  'Car rental': linha(TRANSPORTE, 'Outros'),
  Bicycle: linha(TRANSPORTE, 'Outros'),
  Automotive: linha(TRANSPORTE, 'Outros'),
  'Gas stations': linha(TRANSPORTE, 'Combustível'),
  Parking: linha(TRANSPORTE, 'Estacionamentos'),
  'Tolls and in-vehicle payment': linha(TRANSPORTE, 'Pedágio'),
  'Vehicle ownership taxes and fees': linha(TRANSPORTE, 'IPVA + Seguro Obrigatório Carro'),
  'Vehicle maintenance': linha(TRANSPORTE, 'Manutenção / Revisões'),
  'Traffic tickets': linha(TRANSPORTE, 'Multas'),
  // Insurance
  Insurance: NENHUMA,
  'Life insurance': linha(SAUDE, 'Seguro Vida'),
  'Home Insurance': linha(HABITACAO, 'Seguro Residência'),
  'Health insurance': linha(SAUDE, 'Plano de Saúde'),
  'Vehicle insurance': linha(TRANSPORTE, 'Seguro Carro'),
  // Genéricas
  Leisure: linha(VARIAVEIS, 'Lazer'),
  Other: NENHUMA,
};

export function sugerirPorCategoria(categoria: string | null | undefined): SugestaoCategoria {
  if (!categoria) return NENHUMA;
  return MAPA[categoria] ?? MAPA[categoria.trim()] ?? NENHUMA;
}

/** Exposto para testes e para a tela de revisão do mapa com o Pedro. */
export const MAPA_CATEGORIAS: Readonly<Record<string, SugestaoCategoria>> = MAPA;
