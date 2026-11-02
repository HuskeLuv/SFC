/**
 * Catálogo padrão do Orçamento v2 (desenho técnico §4 "Catálogo"; spec v.8, Anexo A até 11/2026).
 *
 * Categoria = grupo de despesa do Fluxo, identificado pelo NOME CANÔNICO do template
 * (`canonicalName` de `groupMatchers.ts`). O catálogo dá, por categoria, a abreviação do gráfico,
 * o ícone padrão (quando `CashflowGroup.icone` é nulo), se é de poupança, e as subcategorias com a
 * fixa padrão (quando `CashflowItem.orcamentoFixa` é nulo). Desde 11/2026 as subcategorias são as
 * linhas padrão do Fluxo (planilha-base do Pedro): Fluxo e Orçamento têm as mesmas linhas.
 *
 * NÃO tem nome de exibição (D11): a tela mostra sempre `CashflowGroup.name` mesclado, inclusive
 * quando o Anexo A escreve diferente ("Animais de estimação" × template "Animais de Estimação").
 * Renomear templates é decisão à parte (Q16). Os templates globais não são alterados aqui.
 *
 * Puro e isomórfico (sem Prisma): usado pela ativação, pelo GET v2 e pela UI.
 */

import { LINHAS_PADRAO } from '@/lib/cashflow/linhasPadrao';

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
 * Linhas padrão do Fluxo que são FIXAS no orçamento (nunca ficam "à frente do ritmo", só
 * "estouro", R-07). O resto é variável. Nenhum nome aparece em duas categorias com fixa diferente.
 */
const FIXAS_PADRAO: readonly string[] = [
  // Habitação
  'Aluguel / Prestação',
  'Condomínio',
  'IPTU + Taxas Municipais',
  'Conta de energia',
  'Internet',
  'Conta de água',
  'Gás',
  'Alarme',
  'Telefone fixo',
  'Seguro Residência',
  'Empregados / Diaristas',
  // Transporte
  'Prestação Moto / Carro',
  'IPVA + Licenciamento',
  'Seguro Carro',
  // Saúde
  'Plano de Saúde',
  'Seguro de Vida',
  'Nutricionista',
  // Educação e dependentes
  'Inglês',
  'Cursos',
  'MBA',
  'Escola / Faculdade',
  'Pensão',
  // Despesas pessoais
  'Cabeleireiro',
  'Assinaturas / Streaming',
  'Clube de milhas',
  'Celular',
  'Academia',
  'Personal trainer',
  // Lazer
  'Livros, jornais e revistas',
  // Impostos
  'IRRF Salário',
  // Despesas Empresa
  'Administrativas / Operacionais',
  'Salários, Encargos e Benefícios',
  // Despesas Financeiras
  'Taxas Bancárias',
  'Contribuição Previdência',
  'Anuidade cartão de crédito',
];

/**
 * Fixas do catálogo antigo (Anexo A da spec v.8) e do template antigo sem equivalente nas linhas
 * novas. Usuários que já têm essas linhas (criadas pelas sugestões da ativação ou pelo template de
 * antes de 11/2026) continuam com a mesma fixa padrão.
 */
const FIXAS_LEGADAS: readonly string[] = [
  'Terapeuta',
  'Plano pet',
  'Banho e tosa',
  'Babá',
  'Mesada',
  'Contador',
  'Softwares',
  'IR (provisão do ajuste anual)',
  'IRPF',
];

const sub = (nome: string): SubcategoriaCatalogo => ({
  nome,
  fixa: FIXAS_PADRAO.includes(nome),
});

/** Subcategorias de uma categoria = as linhas padrão do grupo homônimo do Fluxo, com a Geral. */
const doTemplate = (grupo: string): readonly SubcategoriaCatalogo[] => [
  ...(LINHAS_PADRAO[grupo] ?? []).filter((l) => l.name !== NOME_GERAL).map((l) => sub(l.name)),
  GERAL,
];

/**
 * As 13 categorias, na ordem do template. Investimentos não existe nesta área (D12). As
 * subcategorias são as linhas padrão do Fluxo (`lib/cashflow/linhasPadrao.ts`, 11/2026): a
 * ativação não cria linha paralela no Fluxo de quem tem o template. Planejamento Financeiro:
 * subcategorias fixas por natureza (aportes planejados), e as listadas são ilustrativas (os itens
 * dali vêm dos Sonhos), por isso não viram sugestão.
 */
export const CATEGORIAS_ORCAMENTO: readonly CategoriaCatalogo[] = [
  {
    nomeCanonico: 'Habitação',
    abreviacao: 'Habitação',
    icone: 'casa',
    poupanca: false,
    subcategorias: doTemplate('Habitação'),
  },
  {
    nomeCanonico: 'Transporte',
    abreviacao: 'Transporte',
    icone: 'carro',
    poupanca: false,
    subcategorias: doTemplate('Transporte'),
  },
  {
    nomeCanonico: 'Saúde',
    abreviacao: 'Saúde',
    icone: 'saude',
    poupanca: false,
    subcategorias: doTemplate('Saúde'),
  },
  {
    nomeCanonico: 'Educação',
    abreviacao: 'Educação',
    icone: 'edu',
    poupanca: false,
    subcategorias: doTemplate('Educação'),
  },
  {
    nomeCanonico: 'Animais de Estimação',
    abreviacao: 'Pets',
    icone: 'pet',
    poupanca: false,
    subcategorias: doTemplate('Animais de Estimação'),
  },
  {
    nomeCanonico: 'Despesas Pessoais',
    abreviacao: 'Pessoais',
    icone: 'user',
    poupanca: false,
    subcategorias: doTemplate('Despesas Pessoais'),
  },
  {
    nomeCanonico: 'Lazer',
    abreviacao: 'Lazer',
    icone: 'lazer',
    poupanca: false,
    subcategorias: doTemplate('Lazer'),
  },
  {
    nomeCanonico: 'Impostos',
    abreviacao: 'Impostos',
    icone: 'imp',
    poupanca: false,
    subcategorias: doTemplate('Impostos'),
  },
  {
    nomeCanonico: 'Despesas com Dependentes',
    abreviacao: 'Dependentes',
    icone: 'dep',
    poupanca: false,
    subcategorias: doTemplate('Despesas com Dependentes'),
  },
  {
    nomeCanonico: 'Despesas Empresa',
    abreviacao: 'Empresa',
    icone: 'emp',
    poupanca: false,
    subcategorias: doTemplate('Despesas Empresa'),
  },
  {
    nomeCanonico: 'Despesas Financeiras',
    abreviacao: 'Financeiras',
    icone: 'fin',
    poupanca: false,
    subcategorias: doTemplate('Despesas Financeiras'),
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
    subcategorias: doTemplate('Despesas Variáveis'),
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
 * Nome antigo → linha padrão equivalente (só equivalências diretas). Cobre o template de antes de
 * 11/2026 (as cópias dos usuários guardam o nome antigo) e o catálogo antigo (Anexo A da spec v.8,
 * cujas sugestões a ativação criou como linhas). Serve para não sugerir duplicata e para a fixa
 * padrão. Nomes iguais a menos de acento/caixa/barra ("Metro" × "Metrô") já casam pela
 * normalização e não precisam estar aqui.
 */
export const ALIASES_SUBCATEGORIA: Readonly<Record<string, string>> = {
  // Habitação
  'Aluguel / Financiamento': 'Aluguel / Prestação',
  Energia: 'Conta de energia',
  Água: 'Conta de água',
  'Internet / TV': 'Internet',
  Mercado: 'Supermercado',
  Diarista: 'Empregados / Diaristas',
  'Telefones celulares': 'Celular',
  IPTU: 'IPTU + Taxas Municipais',
  // Transporte
  'Parcela do carro': 'Prestação Moto / Carro',
  Seguro: 'Seguro Carro',
  'IPVA + Seguro Obrigatório Carro': 'IPVA + Licenciamento',
  'Licenciamento Carro': 'IPVA + Licenciamento',
  'IPVA / Licenciamento': 'IPVA + Licenciamento',
  Manutenção: 'Manutenção / Revisões',
  'Estacionamento / Pedágio': 'Estacionamentos',
  Uber: 'Uber / Táxi',
  'Uber / 99': 'Uber / Táxi',
  'Ônibus (Buser)': 'Ônibus',
  // Saúde
  'Seguro Vida': 'Seguro de Vida',
  Médicos: 'Médicos e terapeutas',
  Medicamentos: 'Medicamentos / Farmácia',
  Farmácia: 'Medicamentos / Farmácia',
  // Educação e dependentes
  Material: 'Material escolar',
  'Consultoria financeira': 'Consultoria Finanças Pessoais',
  Escola: 'Escola / Faculdade',
  // Despesas pessoais
  Roupas: 'Vestuário',
  'Cuidados pessoais': 'Higiene pessoal',
  'Cabeleireiro / Barbearia': 'Cabeleireiro',
  'Assinaturas (streaming)': 'Assinaturas / Streaming',
  // Lazer
  'Delivery / iFood': 'Delivery',
  'Bar / Cafés': 'Cafés e bares',
  'Livros / Revistas': 'Livros, jornais e revistas',
  // Impostos
  'Outros impostos': 'Outros',
  // Despesas Empresa
  'Impostos PJ': 'Impostos, Contribuições Diretas',
  'Taxas, Alvarás, Etc.': 'Taxas e Alvarás',
  // Despesas Financeiras
  'Tarifas bancárias': 'Taxas Bancárias',
  'Anuidade do cartão': 'Anuidade cartão de crédito',
  // Despesas Variáveis
  'Anuidades (OAB, CRM, CRP…)': 'Conselho Profissional',
  'Contador IR PF': 'Contador IR Pessoa Física',
  Presentes: 'Presentes do mês',
  'Taxas e certidões': 'Certidões',
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

/** Fixas fora de Planejamento (lá todas são fixas por natureza), já normalizadas. */
const FIXAS = new Set<string>([...FIXAS_PADRAO, ...FIXAS_LEGADAS].map(normalizarNome));

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

/** Subcategorias (canônicas) presentes em mais de uma categoria do catálogo. */
const EM_VARIAS_CATEGORIAS = (() => {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const c of CATEGORIAS_ORCAMENTO) {
    for (const nome of new Set(c.subcategorias.map((s) => nomeCanonicoSubcategoria(s.nome)))) {
      if (vistos.has(nome)) repetidos.add(nome);
      vistos.add(nome);
    }
  }
  return repetidos;
})();

/**
 * Sugestões que ainda faltam numa categoria, dados os nomes dos itens que ela já tem (comparação
 * pelo nome canônico normalizado, com aliases). Categoria fora do catálogo → nenhuma.
 *
 * `nomesEmOutrasCategorias`: itens das demais categorias de despesa do usuário. Linha que mora
 * em outra categoria também conta ("Escola/Faculdade" na Educação antiga cobre "Escola /
 * Faculdade" de Dependentes; "Telefones celulares" de Habitação cobre "Celular"), menos as que
 * existem em várias categorias do catálogo ("Outros", "Cursos", "Vestuário"): essas faltam de
 * verdade na categoria em que não estão.
 */
export function sugestoesFaltantes(
  nomeCanonicoCategoria: string,
  nomesExistentes: readonly string[],
  nomesEmOutrasCategorias: readonly string[] = [],
): SubcategoriaCatalogo[] {
  const categoria = categoriaDoCatalogo(nomeCanonicoCategoria);
  if (!categoria) return [];
  const deFora = nomesEmOutrasCategorias
    .map(nomeCanonicoSubcategoria)
    .filter((n) => !EM_VARIAS_CATEGORIAS.has(n));
  const existentes = new Set([...nomesExistentes.map(nomeCanonicoSubcategoria), ...deFora]);
  return SUBCATEGORIAS_SUGERIDAS[categoria.nomeCanonico].filter(
    (s) => !existentes.has(nomeCanonicoSubcategoria(s.nome)),
  );
}
