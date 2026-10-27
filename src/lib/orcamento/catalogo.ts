/**
 * Catálogo padrão do Orçamento v2 (spec v.8, Anexo A; desenho técnico §4 "Catálogo").
 *
 * Categoria = grupo de despesa do Fluxo, identificado pelo NOME CANÔNICO do template
 * (`canonicalName` de `groupMatchers.ts`). O catálogo dá, por categoria, a abreviação do gráfico,
 * o ícone padrão (quando `CashflowGroup.icone` é nulo), se é de poupança, e as subcategorias do
 * Anexo A com a fixa padrão (quando `CashflowItem.orcamentoFixa` é nulo).
 *
 * NÃO tem nome de exibição (D11): a tela mostra sempre `CashflowGroup.name` mesclado, inclusive
 * quando o Anexo A escreve diferente ("Animais de estimação" × template "Animais de Estimação").
 * Renomear templates é decisão à parte (Q16). Os templates globais não são alterados aqui.
 *
 * Puro e isomórfico (sem Prisma): usado pela ativação, pelo GET v2 e pela UI.
 */

/** Chaves dos ícones de categoria (paths SVG do protótipo v.8; `tag` = genérico). */
export type IconeCategoria =
  | 'casa'
  | 'carro'
  | 'saude'
  | 'edu'
  | 'pet'
  | 'user'
  | 'lazer'
  | 'imp'
  | 'dep'
  | 'emp'
  | 'fin'
  | 'plan'
  | 'var'
  | 'tag';

/** Ícone de categoria criada pelo usuário (sem par no catálogo). Default da coluna na spec. */
export const ICONE_GENERICO: IconeCategoria = 'tag';

export interface SubcategoriaCatalogo {
  /** Nome exatamente como no Anexo A. */
  nome: string;
  /** Fixa padrão: nunca fica "à frente do ritmo", só "estouro" (R-07). */
  fixa: boolean;
}

export interface CategoriaCatalogo {
  /** Nome do grupo-template do Fluxo (`cashflowTemplates.ts`), que é a chave canônica. */
  nomeCanonico: string;
  /** Rótulo do eixo X do gráfico Orçado × Real. */
  abreviacao: string;
  icone: IconeCategoria;
  /** Categoria de poupança (índice de poupança, R$/% da receita): só Planejamento Financeiro. */
  poupanca: boolean;
  /** Subcategorias do Anexo A, na ordem, com a Geral no fim. */
  subcategorias: readonly SubcategoriaCatalogo[];
}

export const NOME_GERAL = 'Geral';
export const NOME_PLANEJAMENTO_FINANCEIRO = 'Planejamento Financeiro';
/** Única sugestão do catálogo em Planejamento Financeiro (ver `SUBCATEGORIAS_SUGERIDAS`). */
export const NOME_RESERVA = 'Reserva de emergência';

const fixa = (nome: string): SubcategoriaCatalogo => ({ nome, fixa: true });
const variavel = (nome: string): SubcategoriaCatalogo => ({ nome, fixa: false });
const GERAL = variavel(NOME_GERAL);

/**
 * As 13 categorias, na ordem do Anexo A (= ordem do template). Investimentos não existe nesta área
 * (D12). Planejamento Financeiro: subcategorias fixas por natureza (aportes planejados), e as do
 * Anexo A são ilustrativas (os itens dali vêm dos Sonhos), por isso não viram sugestão.
 */
export const CATEGORIAS_ORCAMENTO: readonly CategoriaCatalogo[] = [
  {
    nomeCanonico: 'Habitação',
    abreviacao: 'Habitação',
    icone: 'casa',
    poupanca: false,
    subcategorias: [
      fixa('Aluguel / Financiamento'),
      fixa('Condomínio'),
      fixa('Energia'),
      fixa('Água'),
      fixa('Gás'),
      fixa('Internet / TV'),
      variavel('Mercado'),
      fixa('Diarista'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Transporte',
    abreviacao: 'Transporte',
    icone: 'carro',
    poupanca: false,
    subcategorias: [
      fixa('Parcela do carro'),
      variavel('Combustível'),
      fixa('Seguro'),
      fixa('IPVA / Licenciamento'),
      variavel('Manutenção'),
      variavel('Estacionamento / Pedágio'),
      variavel('Uber / 99'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Saúde',
    abreviacao: 'Saúde',
    icone: 'saude',
    poupanca: false,
    subcategorias: [
      fixa('Plano de saúde'),
      variavel('Médicos'),
      fixa('Terapeuta'),
      fixa('Nutricionista'),
      variavel('Exames'),
      variavel('Farmácia'),
      fixa('Academia'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Educação',
    abreviacao: 'Educação',
    icone: 'edu',
    poupanca: false,
    subcategorias: [
      fixa('Inglês'),
      fixa('Cursos'),
      fixa('MBA'),
      variavel('Material'),
      variavel('Consultoria financeira'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Animais de Estimação',
    abreviacao: 'Pets',
    icone: 'pet',
    poupanca: false,
    subcategorias: [
      variavel('Ração'),
      variavel('Veterinário'),
      fixa('Banho e tosa'),
      fixa('Plano pet'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Despesas Pessoais',
    abreviacao: 'Pessoais',
    icone: 'user',
    poupanca: false,
    subcategorias: [
      variavel('Vestuário'),
      fixa('Cabeleireiro / Barbearia'),
      variavel('Cosméticos'),
      fixa('Celular'),
      fixa('Assinaturas (streaming)'),
      variavel('Presentes'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Lazer',
    abreviacao: 'Lazer',
    icone: 'lazer',
    poupanca: false,
    subcategorias: [
      variavel('Restaurantes'),
      variavel('Delivery / iFood'),
      variavel('Bar / Cafés'),
      variavel('Cinema / Shows'),
      variavel('Passeios'),
      fixa('Livros / Revistas'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Impostos',
    abreviacao: 'Impostos',
    icone: 'imp',
    poupanca: false,
    subcategorias: [
      fixa('IPTU'),
      fixa('IR (provisão do ajuste anual)'),
      variavel('Taxas e certidões'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Despesas com Dependentes',
    abreviacao: 'Dependentes',
    icone: 'dep',
    poupanca: false,
    subcategorias: [fixa('Escola'), fixa('Babá'), variavel('Atividades'), fixa('Mesada'), GERAL],
  },
  {
    nomeCanonico: 'Despesas Empresa',
    abreviacao: 'Empresa',
    icone: 'emp',
    poupanca: false,
    subcategorias: [
      fixa('Contador'),
      fixa('Softwares'),
      variavel('Marketing'),
      variavel('Impostos PJ'),
      GERAL,
    ],
  },
  {
    nomeCanonico: 'Despesas Financeiras',
    abreviacao: 'Financeiras',
    icone: 'fin',
    poupanca: false,
    subcategorias: [
      fixa('Tarifas bancárias'),
      fixa('Anuidade do cartão'),
      variavel('Juros / IOF'),
      fixa('Seguro de vida'),
      GERAL,
    ],
  },
  {
    nomeCanonico: NOME_PLANEJAMENTO_FINANCEIRO,
    abreviacao: 'Planejamento',
    icone: 'plan',
    poupanca: true,
    subcategorias: [
      fixa('Viagem Japão 2028'),
      fixa('Entrada apartamento'),
      fixa('Viagem praia dez/26'),
      fixa(NOME_RESERVA),
      fixa(NOME_GERAL),
    ],
  },
  {
    nomeCanonico: 'Despesas Variáveis',
    abreviacao: 'Variáveis',
    icone: 'var',
    poupanca: false,
    subcategorias: [
      variavel('Manutenção e reparos'),
      variavel('Móveis e decoração'),
      variavel('Anuidades (OAB, CRM, CRP…)'),
      variavel('Contador IR PF'),
      variavel('Presentes do mês'),
      variavel('Utilidades domésticas'),
      variavel('Papelaria'),
      GERAL,
    ],
  },
];

/**
 * Normalização para comparar nomes: sem acento, sem caixa, espaços colapsados e barra sempre
 * cercada por um espaço ("Empregados/ Diaristas" ≡ "empregados / diaristas").
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nomes antigos de grupos-template → nome canônico atual. "Dívidas" foi renomeado para
 * "Despesas Financeiras" (ago/2026; `groupLevel.ts` ainda o reconhece).
 */
const ALIASES_CATEGORIA: Record<string, string> = {
  Dívidas: 'Despesas Financeiras',
};

const CATEGORIA_POR_NOME = new Map<string, CategoriaCatalogo>();
for (const categoria of CATEGORIAS_ORCAMENTO) {
  CATEGORIA_POR_NOME.set(normalizarNome(categoria.nomeCanonico), categoria);
}
for (const [antigo, atual] of Object.entries(ALIASES_CATEGORIA)) {
  const categoria = CATEGORIA_POR_NOME.get(normalizarNome(atual));
  if (categoria) CATEGORIA_POR_NOME.set(normalizarNome(antigo), categoria);
}

/**
 * Categoria do catálogo pelo nome canônico do grupo (`canonicalName(group)`). Casa sem acento e
 * sem caixa, então os nomes do Anexo A ("Despesas pessoais") também casam com o template
 * ("Despesas Pessoais"). Grupo criado pelo usuário → null.
 */
export function categoriaDoCatalogo(nomeCanonico: string): CategoriaCatalogo | null {
  return CATEGORIA_POR_NOME.get(normalizarNome(nomeCanonico)) ?? null;
}

/** Planejamento Financeiro: `is_savings` derivado (desenho §2). */
export function ehCategoriaPoupanca(nomeCanonico: string): boolean {
  return categoriaDoCatalogo(nomeCanonico)?.poupanca ?? false;
}

/** Ícone padrão (quando `CashflowGroup.icone` é nulo). Categoria do usuário → `tag`. */
export function iconePadraoCategoria(nomeCanonico: string): IconeCategoria {
  return categoriaDoCatalogo(nomeCanonico)?.icone ?? ICONE_GENERICO;
}

/**
 * Rótulo do gráfico. Sem par no catálogo, usa o nome recebido (o chamador passa o nome exibido
 * para categorias do usuário).
 */
export function abreviacaoCategoria(nomeCanonico: string): string {
  return categoriaDoCatalogo(nomeCanonico)?.abreviacao ?? nomeCanonico;
}

/**
 * Itens-template de despesa do Fluxo (`cashflowTemplates.ts`) → subcategoria equivalente do
 * Anexo A. Só equivalências diretas: servem para não sugerir duplicata ("Supermercado" já cobre
 * "Mercado") e para a fixa padrão. Itens sem equivalente claro ("Pneu", "Teatro") ficam de fora:
 * um alias amplo demais esconderia uma sugestão útil. Nomes iguais a menos de acento/caixa
 * ("Plano de Saúde") já casam pela normalização e não precisam estar aqui.
 */
export const ALIASES_SUBCATEGORIA: Readonly<Record<string, string>> = {
  // Habitação
  'Aluguel / Prestação': 'Aluguel / Financiamento',
  'Conta de energia': 'Energia',
  'Conta de água': 'Água',
  Internet: 'Internet / TV',
  Supermercado: 'Mercado',
  'Empregados/ Diaristas': 'Diarista',
  'Telefones celulares': 'Celular',
  'IPTU + Taxas Municipais': 'IPTU',
  // Transporte
  'Prestação Moto/ Carro': 'Parcela do carro',
  'Seguro Carro': 'Seguro',
  'IPVA + Seguro Obrigatório Carro': 'IPVA / Licenciamento',
  'Licenciamento Carro': 'IPVA / Licenciamento',
  'Manutenção / Revisões': 'Manutenção',
  Estacionamentos: 'Estacionamento / Pedágio',
  Pedágio: 'Estacionamento / Pedágio',
  Uber: 'Uber / 99',
  // Saúde
  'Seguro Vida': 'Seguro de vida',
  'Médicos e terapeutas': 'Médicos',
  Medicamentos: 'Farmácia',
  // Educação e dependentes
  'Material escolar': 'Material',
  'Escola/Faculdade': 'Escola',
  // Despesas pessoais
  Roupas: 'Vestuário',
  'Cuidados pessoais': 'Cosméticos',
  // Lazer
  Cinema: 'Cinema / Shows',
  // Impostos
  IRPF: 'IR (provisão do ajuste anual)',
  // Despesas Empresa
  'Impostos, Contribuições Diretas': 'Impostos PJ',
  // Despesas Financeiras
  'Taxas Bancárias': 'Tarifas bancárias',
  'Anuidade cartão de crédito': 'Anuidade do cartão',
};

const ALIAS_POR_NOME = new Map<string, string>(
  Object.entries(ALIASES_SUBCATEGORIA).map(([de, para]) => [
    normalizarNome(de),
    normalizarNome(para),
  ]),
);

/**
 * Nome canônico normalizado de uma subcategoria: aplica o alias (se houver) sobre o nome
 * normalizado. Dois itens com o mesmo resultado são a "mesma" subcategoria para as sugestões.
 */
export function nomeCanonicoSubcategoria(nome: string): string {
  const normalizado = normalizarNome(nome);
  return ALIAS_POR_NOME.get(normalizado) ?? normalizado;
}

/**
 * Fixas do Anexo A fora de Planejamento (lá todas são fixas por natureza). Nenhum nome aparece
 * em duas categorias com fixa diferente, então um conjunto global basta.
 */
const FIXAS = new Set<string>(
  CATEGORIAS_ORCAMENTO.filter((c) => !c.poupanca).flatMap((c) =>
    c.subcategorias.filter((s) => s.fixa).map((s) => normalizarNome(s.nome)),
  ),
);

/**
 * Fixa padrão, usada quando `CashflowItem.orcamentoFixa` é nulo. Aceita o nome cru (normaliza e
 * aplica os aliases). Em Planejamento Financeiro tudo é fixo (spec §R-07).
 */
export function fixaPadrao(
  nomeSubcategoria: string,
  nomeCanonicoCategoria?: string | null,
): boolean {
  if (nomeCanonicoCategoria && ehCategoriaPoupanca(nomeCanonicoCategoria)) return true;
  return FIXAS.has(nomeCanonicoSubcategoria(nomeSubcategoria));
}

/**
 * Sugestões do catálogo por categoria (P4): o Anexo A sem a Geral (garantida à parte, por
 * `garantirGerais`). Em Planejamento Financeiro, só a Reserva de emergência: os outros itens do
 * Anexo A são objetivos de exemplo (Viagem Japão 2028…), não sugestões, e sem nenhuma sub ali a
 * categoria de poupança nasce só com a Geral (QA 27/10).
 */
export const SUBCATEGORIAS_SUGERIDAS: Readonly<Record<string, readonly SubcategoriaCatalogo[]>> =
  Object.fromEntries(
    CATEGORIAS_ORCAMENTO.map((c) => [
      c.nomeCanonico,
      c.poupanca
        ? c.subcategorias.filter((s) => s.nome === NOME_RESERVA)
        : c.subcategorias.filter((s) => s.nome !== NOME_GERAL),
    ]),
  );

/**
 * Sugestões que ainda faltam numa categoria, dados os nomes dos itens que ela já tem (comparação
 * pelo nome canônico normalizado, com aliases). Categoria fora do catálogo → nenhuma.
 *
 * `nomesEmOutrasCategorias`: itens das demais categorias de despesa do usuário. Alguns aliases
 * cruzam categoria ("IPTU + Taxas Municipais" fica em Habitação e equivale a IPTU, de Impostos).
 * Sem esses nomes a sugestão sai em duplicata, então o chamador deve passá-los.
 */
export function sugestoesFaltantes(
  nomeCanonicoCategoria: string,
  nomesExistentes: readonly string[],
  nomesEmOutrasCategorias: readonly string[] = [],
): SubcategoriaCatalogo[] {
  const categoria = categoriaDoCatalogo(nomeCanonicoCategoria);
  if (!categoria) return [];
  const existentes = new Set(
    [...nomesExistentes, ...nomesEmOutrasCategorias].map(nomeCanonicoSubcategoria),
  );
  return SUBCATEGORIAS_SUGERIDAS[categoria.nomeCanonico].filter(
    (s) => !existentes.has(nomeCanonicoSubcategoria(s.nome)),
  );
}
