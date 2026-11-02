/**
 * Linhas padrão do Fluxo de Caixa (itens-template por grupo), puras e isomórficas: o seed e a
 * migração (`cashflowTemplates.ts`, `scripts/cashflow/migrar-linhas-padrao-2026-11.ts`) gravam
 * daqui, e o catálogo do Orçamento v2 (`lib/orcamento/catalogo.ts`) usa as mesmas linhas como
 * subcategorias, para a ativação não criar linhas paralelas no Fluxo.
 *
 * Base: planilha do Pedro de 30/10/2026 ("Planilha com cédulas Padrão"), com nomes genéricos e
 * sem duplicatas (decisões do Wellington em 02/11/2026). A ordem do array é a ordem de exibição
 * (orderIndex 1..n).
 */

export interface LinhaTemplate {
  name: string;
  /** Posição no grupo (1..n), na ordem da planilha-base. */
  orderIndex: number;
}

const linhas = (...nomes: string[]): LinhaTemplate[] =>
  nomes.map((name, i) => ({ name, orderIndex: i + 1 }));

// Linhas do grupo "Despesas Financeiras" (seção homônima da planilha). Também usadas pelo ensure
// de bancos antigos (`ensureDividasTemplate`).
export const DESPESAS_FINANCEIRAS_ITEMS = [
  'Taxas Bancárias',
  'Cheque Especial',
  'Gorjetas / caixinhas',
  'Doações / Dízimos',
  'Taxa de TED',
  'Contribuição Previdência',
  'Anuidade cartão de crédito',
  'Extras diários',
];

export const LINHAS_PADRAO: Readonly<Record<string, readonly LinhaTemplate[]>> = {
  'Entradas Fixas': linhas(
    'Pró-labore / Salário 1',
    'Pró-labore / Salário 2',
    "Proventos FII's",
    'Aluguel 1',
    'Aluguel 2',
    'Aluguel 3',
    'Outros',
  ),
  'Sem Tributação': linhas(
    'Venda de Bens',
    'Empréstimos',
    'Imposto a restituir',
    'Férias',
    '13º Salário',
    'Bônus',
    'Outros',
  ),
  'Com Tributação': linhas('Notas Fiscais Emitidas'),
  Habitação: linhas(
    'Aluguel / Prestação',
    'Condomínio',
    'IPTU + Taxas Municipais',
    'Conta de energia',
    'Internet',
    'Conta de água',
    'Gás',
    'Alarme',
    'Telefone fixo',
    'Supermercado',
    'Padaria',
    'Seguro Residência',
    'Empregados / Diaristas',
    'Lavanderia',
    'Outros',
  ),
  Transporte: linhas(
    'Prestação Moto / Carro',
    'IPVA + Licenciamento',
    'Seguro Carro',
    'Combustível',
    'Estacionamentos',
    'Lavagens',
    'Manutenção / Revisões',
    'Multas',
    'Ônibus',
    'Uber / Táxi',
    'Metrô',
    'Pedágio',
    'Outros',
  ),
  Saúde: linhas(
    'Plano de Saúde',
    'Médicos e terapeutas',
    'Dentista',
    'Medicamentos / Farmácia',
    'Quiropraxia',
    'Seguro de Vida',
    'Nutricionista',
    'Exames',
    'Outros',
  ),
  Educação: linhas('Inglês', 'Cursos', 'Consultoria Finanças Pessoais', 'MBA', 'Outros'),
  'Animais de Estimação': linhas(
    'Veterinário',
    'Ração',
    'Exames e Medicamentos',
    'Hospedagem',
    'Outros',
  ),
  'Despesas Pessoais': linhas(
    'Higiene pessoal',
    'Estética',
    'Cosméticos',
    'Acessórios',
    'Cabeleireiro',
    'Vestuário',
    'Assinaturas / Streaming',
    'Clube de milhas',
    'Celular',
    'Academia',
    'Suplementos',
    'Personal trainer',
    'Outros',
  ),
  Lazer: linhas(
    'Restaurantes',
    'Cafés e bares',
    'Livros, jornais e revistas',
    'Hobbies',
    'Mídias e acessórios',
    'Delivery',
    'Passagens',
    'Hospedagens',
    'Passeios',
    'Outros',
  ),
  Impostos: linhas('IRRF Salário', 'IRRF Bônus', 'ITCMD', 'ITBI', 'Outros'),
  // Itens espelham a seção "Despesas com dependentes" da planilha FLC
  'Despesas com Dependentes': linhas(
    'Escola / Faculdade',
    'Cursos',
    'Pensão',
    'Material escolar',
    'Vestuário',
    'Outros',
  ),
  'Despesas Empresa': linhas(
    'Administrativas / Operacionais',
    'Fornecedores',
    'Taxas e Alvarás',
    'Impostos, Contribuições Diretas',
    'DARF',
    'Salários, Encargos e Benefícios',
    'Maquinários & Equipamentos',
    'Despesas com Vendas',
    'Despesas Financeiras',
    'Outros',
  ),
  // Os itens deste grupo são provisionados por usuário a partir do
  // Planejamento de Sonhos (linhas espelho, vínculo via objetivoId) — ver
  // src/services/planejamento/sonhoCashflowSync.ts. Sem placeholders no template.
  'Planejamento Financeiro': [],
  // Linhas da seção homônima da planilha — além delas, o grupo recebe as
  // linhas-espelho das parcelas de dívidas (dividaCashflowSync), criadas por dívida.
  'Despesas Financeiras': linhas(...DESPESAS_FINANCEIRAS_ITEMS),
  // Seção "Despesas Temporárias / Variáveis" da planilha (o nome do grupo fica "Despesas Variáveis").
  'Despesas Variáveis': linhas(
    'Manutenção e reparos',
    'Conselho Profissional',
    'Móveis e decoração',
    'Médicos e terapeutas esporádicos',
    'Contador IR Pessoa Física',
    'Advogado',
    'Dedetização',
    'Correio',
    'Presentes do mês',
    'Certidões',
    'Papelaria',
    'Outros',
  ),
  'Conta Corrente': linhas('Banco 1', 'Banco 2', 'Banco 3'),
  Investimentos: linhas(
    'Reserva Emergência',
    'Reserva Oportunidade',
    'Renda Fixa & Fundos Renda Fixa',
    'Fundos (FIM / FIA)',
    "FII's",
    'Ações',
    'STOCKS',
    "REIT's",
    "ETF's",
    'Moedas, Criptomoedas & Outros',
    'Previdência e Seguros',
    'Imóveis Físicos',
  ),
};
