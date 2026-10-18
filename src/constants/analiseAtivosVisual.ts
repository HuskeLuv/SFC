/**
 * Constantes VISUAIS da Análise de Ativos — Fase 1 (decisão 1 do Wellington, 02/10/2026).
 *
 * Só a paleta My Finance (brandColors.ts) + cinzas do app + negativos #D92D20 (claro) / #F97066
 * (escuro). Nada de verde/âmbar: verde lê como "compre" e não está na paleta.
 * - v2.4 (Filtros de Fundamentos): marcas de critério ✓/— NEUTRAS, nunca verde/vermelho; o
 *   vermelho fica só para erro e prejuízo nas barras. #0079F2 só em elemento NÃO textual.
 * - Exceção à paleta autorizada pelo Wellington 17/10: verde de positivo SÓ no ✓ do critério
 *   atendido na página do ativo (VERDE_ATENDE / MARCA_ATENDE_VERDE). Fica fora de
 *   CORES_PERMITIDAS: Quadro, Comparador e células continuam neutros.
 * - Texto/link: #396CAA no claro / #6E9DC4 no escuro. #0079F2 nunca em texto.
 *
 * O teste (__tests__ em src/constants) lista todos os hex deste arquivo e falha com cor fora da
 * paleta permitida (CORES_PERMITIDAS ∪ CORES_EXCECAO_ATENDE).
 */
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { DefCriterioChip, IdCriterio } from '@/types/analiseAtivosCriterios';
import type {
  ClasseEua,
  ClasseQuadro,
  DirecaoOrdem,
  ModoQuadro,
  OrdemQuadro,
} from '@/types/analiseAtivosApi';

/** Cinzas do app (tema Tailwind) e negativos usados na área. */
export const CINZAS_APP = {
  gray100: '#F2F4F7',
  gray200: '#E4E7EC',
  gray400: '#98A2B3',
  gray500: '#667085',
  gray800: '#1D2939',
  escuroFundo: '#18181B',
  escuroCard: '#1F1F22',
  escuroBorda: '#2E3440',
  branco: '#FFFFFF',
} as const;

export const NEGATIVO = { claro: '#D92D20', escuro: '#F97066' } as const;

/** Fundo suave de "atende" (patrimonio a ~10%), derivado da paleta. */
export const FUNDO_ATENDE_CLARO = '#EDF2F8';
/** Fundo do selo NOVO (patrimonio a ~18%). */
export const FUNDO_NOVO_CLARO = '#DCE6F2';

/** Cores permitidas na área (o teste confere todos os hex do arquivo contra esta lista). */
export const CORES_PERMITIDAS: readonly string[] = [
  ...Object.values(MYFINANCE_BRAND),
  ...Object.values(CINZAS_APP),
  ...Object.values(NEGATIVO),
  FUNDO_ATENDE_CLARO,
  FUNDO_NOVO_CLARO,
];

/**
 * Exceção à paleta autorizada pelo Wellington 17/10: verde de positivo só no ✓ do critério atendido
 * na página do ativo; Quadro, Comparador e células continuam neutros. Mesmos tons do --ok do HTML do
 * Pedro. NÃO entra em CORES_PERMITIDAS (os demais componentes seguem reprovando verde).
 */
export const VERDE_ATENDE = { claro: '#16A34A', escuro: '#34C47C' } as const;
/** Círculo do ✓ atendido (página do ativo): verde no claro; verde claro com ✓ escuro no escuro. */
export const MARCA_ATENDE_VERDE = 'bg-[#16A34A] text-white dark:bg-[#34C47C] dark:text-[#18181B]';
/** Hex da exceção do ✓ verde (só para os testes de fonte que a aceitam explicitamente). */
export const CORES_EXCECAO_ATENDE: readonly string[] = Object.values(VERDE_ATENDE);

/** Texto/link (claro / escuro). */
export const COR_LINK = {
  claro: MYFINANCE_BRAND.patrimonio,
  escuro: MYFINANCE_BRAND.tranquilidade,
  classes: 'text-[#396CAA] dark:text-[#6E9DC4]',
} as const;

/** Barras de Lucro/Rendimento 10 anos: lucro em patrimonio para cima; prejuízo vermelho para baixo. */
export const BARRAS_LUCRO = {
  positivo: { claro: MYFINANCE_BRAND.patrimonio, escuro: MYFINANCE_BRAND.tranquilidade },
  negativo: NEGATIVO,
  semDado: { borda: CINZAS_APP.gray400, tracejado: '3 2' },
  suspeito: { borda: CINZAS_APP.gray400, tracejado: '3 2' },
} as const;

/** Duas séries do gráfico Lucro × Cotação (claro / escuro). */
export const SERIES_GRAFICO = {
  claro: { a: MYFINANCE_BRAND.outside, b: MYFINANCE_BRAND.potencia },
  escuro: { a: MYFINANCE_BRAND.tranquilidade, b: MYFINANCE_BRAND.escolha },
  larguraLinha: 2.2,
} as const;

/**
 * Chip de critério LIGADO (protótipo final): fundo #EDF2F8, borda #396CAA, texto #314666; no escuro
 * patrimonio a 20%, borda tranquilidade, texto escolha. Desligado: borda cinza, superfície.
 */
export const CHIP_CRITERIO = {
  ligado:
    'border-[#396CAA] bg-[#EDF2F8] font-semibold text-[#314666] dark:border-[#6E9DC4] dark:bg-[#396CAA]/20 dark:text-[#EAEAEA]',
  desligado:
    'border-gray-200 bg-white text-gray-700 group-hover:bg-gray-50 dark:border-[#2E3440] dark:bg-transparent dark:text-gray-300 dark:group-hover:bg-white/[0.04]',
  semDado:
    'border-dashed border-gray-300 bg-transparent text-gray-500 dark:border-gray-600 dark:text-gray-400',
} as const;

/** Cabeçalho de tabela (TABLE_STYLES) e coluna da ordem destacada. */
export const QUADRO_VISUAL = {
  cabecalho: MYFINANCE_BRAND.seguranca,
  colunaOrdemTh: MYFINANCE_BRAND.outside,
  /** td da coluna da ordem: outside a 6% (claro) / 16% (escuro) */
  colunaOrdemTd: 'bg-[#0079F2]/[0.06] dark:bg-[#0079F2]/[0.16]',
  chipAtivo: 'bg-[#314666] text-white',
} as const;

/** Selo NOVO do menu: texto patrimonio sobre #DCE6F2 (escuro: tranquilidade sobre tranquilidade/15). */
export const SELO_NOVO = 'bg-[#DCE6F2] text-[#396CAA] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]';

export interface ColunaQuadro {
  codigo: string;
  /** chave em TEXTOS_QUADRO.colunas (novas da v2.4) ou TEXTOS_TELA.quadro.colunas */
  rotulo: string;
  ordem: OrdemQuadro | null;
  alinhamento: 'esquerda' | 'direita' | 'centro';
  /** chave em TEXTOS_QUADRO.dicas (title do cabeçalho), opcional */
  dica?: string;
}

const col = (
  codigo: string,
  rotulo: string,
  ordem: OrdemQuadro | null,
  alinhamento: ColunaQuadro['alinhamento'] = 'direita',
  dica?: string,
): ColunaQuadro =>
  dica ? { codigo, rotulo, ordem, alinhamento, dica } : { codigo, rotulo, ordem, alinhamento };

/** Coluna "Critérios" (CelulaCriterios: 'n de 6'; v2.5: financeiras também 'n de 6'). */
const CRITERIOS = col('criterios', 'criterios', 'criterios', 'esquerda', 'criterios');

/**
 * Colunas por classe × modo — v2.4 (protótipo final, D1: estrutura do HTML do Pedro). Sai o
 * indicador antigo; entra "Critérios"; Lucro/Rendimento 10 anos passa ao Detalhado (ordenável pelos
 * anos positivos, 'lucro10').
 */
export const COLUNAS: Record<ClasseQuadro, Record<ModoQuadro, ColunaQuadro[]>> = {
  acao: {
    resumo: [
      col('ativo', 'ativo', 'ticker', 'esquerda'),
      col('preco', 'preco', 'preco'),
      col('lucrosSeguidos', 'lucrosSeguidos', 'anosLucro', 'direita', 'lucrosSeguidos'),
      col('roe', 'roe', 'roe'),
      col('pl', 'pl', 'pl'),
      col('pvp', 'pvp', 'pvp'),
      col('dy12m', 'dy12m', 'dy'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
    detalhado: [
      col('ativo', 'ativo', 'ticker', 'esquerda'),
      col('setor', 'setor', null, 'esquerda'),
      col('preco', 'preco', 'preco'),
      col('lucrosSeguidos', 'lucrosSeguidos', 'anosLucro', 'direita', 'lucrosSeguidos'),
      col('lucro10a', 'lucro10a', 'lucro10', 'centro', 'lucro10a'),
      col('roe', 'roe', 'roe'),
      col('margemLiquida', 'margemLiquida', 'margem'),
      col('divLiqEbitda', 'divLiqEbitda', 'divLiqEbitda', 'direita', 'divLiqEbitda'),
      col('pl', 'pl', 'pl'),
      col('pvp', 'pvp', 'pvp'),
      col('dy12m', 'dy12m', 'dy'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
  },
  fii: {
    resumo: [
      col('ativo', 'fundo', 'ticker', 'esquerda'),
      col('tipo', 'tipo', null, 'esquerda'),
      col('preco', 'cota', 'preco'),
      col('dy12m', 'dy12m', 'dy'),
      col('pvp', 'pvp', 'pvp'),
      col('vacanciaCvm', 'vacanciaCvm', 'vacancia', 'direita', 'vacanciaCvm'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
    detalhado: [
      col('ativo', 'fundo', 'ticker', 'esquerda'),
      col('tipo', 'tipo', null, 'esquerda'),
      col('segmento', 'segmento', null, 'esquerda'),
      col('preco', 'cota', 'preco'),
      col('rendimento10a', 'rendimento10a', 'lucro10', 'centro', 'rendimento10a'),
      col('dy12m', 'dy12m', 'dy'),
      col('pvp', 'pvp', 'pvp'),
      col('vacanciaCvm', 'vacanciaCvm', 'vacancia', 'direita', 'vacanciaCvm'),
      col('imoveisCris', 'imoveisCris', null),
      col('patrimonio', 'patrimonio', 'patrimonio'),
      col('liquidez21', 'liquidez21', 'liquidez'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
  },
  /**
   * EUA (fatia 0; desenho stocks-reits, design.telas): SEM cotação (decisão do Wellington de
   * 17/10: preço, P/L e DY só com ANALISE_ATIVOS_EUA_PRECO_HABILITADO — COLUNAS_PRECO_EUA). Valores
   * em US$. Colunas novas sem ordenação no MVP (ordem null).
   */
  stock: {
    resumo: [
      col('ativo', 'stock', 'ticker', 'esquerda'),
      col('lucrosSeguidos', 'lucrosSeguidos', 'anosLucro', 'direita', 'lucrosSeguidos'),
      col('roe', 'roe', 'roe'),
      col('margemLiquida', 'margemLiquida', 'margem'),
      col('dpaUsd', 'dpaUsd', null, 'direita', 'dpaUsd'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
    detalhado: [
      col('ativo', 'stock', 'ticker', 'esquerda'),
      col('setor', 'setor', null, 'esquerda'),
      col('lucrosSeguidos', 'lucrosSeguidos', 'anosLucro', 'direita', 'lucrosSeguidos'),
      col('lucro10a', 'lucro10a', 'lucro10', 'centro', 'lucro10a'),
      col('roe', 'roe', 'roe'),
      col('margemLiquida', 'margemLiquida', 'margem'),
      col('divLiqEbitda', 'divLiqEbitda', 'divLiqEbitda', 'direita', 'divLiqEbitda'),
      col('dpaUsd', 'dpaUsd', null, 'direita', 'dpaUsd'),
      col('payout', 'payout', 'payout'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
  },
  reit: {
    resumo: [
      col('ativo', 'reit', 'ticker', 'esquerda'),
      col('segmento', 'tipo', null, 'esquerda'),
      col('fcoAcao', 'fcoAcao', null, 'direita', 'fcoAcao'),
      col('divFco', 'divFco', null, 'direita', 'divFco'),
      col('dpaUsd', 'dpaUsd', null, 'direita', 'dpaUsd'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
    detalhado: [
      col('ativo', 'reit', 'ticker', 'esquerda'),
      col('segmento', 'tipo', null, 'esquerda'),
      col('fcoAcao', 'fcoAcao', null, 'direita', 'fcoAcao'),
      col('divFco', 'divFco', null, 'direita', 'divFco'),
      col('dpaUsd', 'dpaUsd', null, 'direita', 'dpaUsd'),
      col('divLiqEbitda', 'divLiqEbitda', 'divLiqEbitda', 'direita', 'divLiqEbitda'),
      col('anosDividendo', 'anosDividendo', null, 'direita', 'anosDividendo'),
      col('lucro10a', 'lucro10a', 'lucro10', 'centro', 'lucro10a'),
      CRITERIOS,
      col('naCarteira', 'naCarteira', null),
    ],
  },
};

/**
 * Colunas de cotação EUA, inseridas logo depois de 'ativo' (preço) e antes de 'criterios' (P/L e
 * DY) SÓ com recursos.euaPreco (fatia C). Sem a chave, nunca aparecem.
 */
export const COLUNAS_PRECO_EUA: Record<
  ClasseEua,
  { aposAtivo: ColunaQuadro[]; antesCriterios: ColunaQuadro[] }
> = {
  stock: {
    aposAtivo: [col('preco', 'precoUsd', 'preco')],
    antesCriterios: [col('pl', 'pl', 'pl'), col('dy12m', 'dy12m', 'dy')],
  },
  reit: {
    aposAtivo: [col('preco', 'precoUsd', 'preco')],
    antesCriterios: [col('dy12m', 'dy12m', 'dy')],
  },
};

/**
 * Critérios que a URL/barra aceitam por classe, derivados dos params: os chips HABILITADOS (em FII,
 * os ids de tijolo — o par de papel vem pelas equivalências). v2.5: com a v2 todos ficam
 * habilitados (vacância/inadimplência e LTV ativos), então ?criterios=vac fica na URL. A rota é a
 * autoridade (400 para o resto); aqui só se limpa a URL.
 */
export function criteriosFiltraveisDe(
  params: Pick<CriteriaParams, 'perfis'>,
): Record<ClasseQuadro, readonly IdCriterio[]> {
  return {
    acao: params.perfis.acao.filter((c) => c.ativo !== false).map((c) => c.id),
    fii: params.perfis.fii_tijolo.filter((c) => c.ativo !== false).map((c) => c.id),
    // EUA: perfis opcionais (ausentes na v1/v2 = nenhum filtro); a financeira usa a lista de stock
    stock: (params.perfis.stock ?? []).filter((c) => c.ativo !== false).map((c) => c.id),
    reit: (params.perfis.reit ?? []).filter((c) => c.ativo !== false).map((c) => c.id),
  };
}

/** Ids habilitados das definições da resposta do Quadro (QuadroResposta.definicoes). */
export function criteriosFiltraveisDasDefinicoes(
  definicoes: readonly DefCriterioChip[],
): IdCriterio[] {
  return definicoes.filter((d) => d.habilitado).map((d) => d.id);
}

/** Fallback do cliente antes da resposta: os params vigentes do código (CRITERIA_PARAMS_CODIGO). */
export const CRITERIOS_FILTRAVEIS: Record<ClasseQuadro, readonly IdCriterio[]> =
  criteriosFiltraveisDe(CRITERIA_PARAMS_CODIGO);

/**
 * Critérios de ação que não se aplicam a financeiras, dos params vigentes do código. v2.5: vazio
 * ("n de 6", literal da spec); religar = nova versão de params com os ids (D4).
 */
export const CRITERIOS_NAO_SE_APLICAM_FINANCEIRA: readonly IdCriterio[] =
  CRITERIA_PARAMS_CODIGO.perfis.acao_financeira.naoSeAplica;

/** Primeiro clique na coluna = direção padrão (múltiplos "quanto menor" começam asc). */
export const DIRECAO_PADRAO: Record<OrdemQuadro, DirecaoOrdem> = {
  ticker: 'asc',
  // v2.4 (fatia 0, contrato de OrdemQuadro): contagem de critérios e Lucro 10 anos começam desc
  criterios: 'desc',
  lucro10: 'desc',
  preco: 'desc',
  anosLucro: 'desc',
  mesesRendimento: 'desc',
  roe: 'desc',
  pl: 'asc',
  pvp: 'asc',
  dy: 'desc',
  margem: 'desc',
  divLiqEbitda: 'asc',
  payout: 'asc',
  vacancia: 'asc',
  valorMercado: 'desc',
  patrimonio: 'desc',
  liquidez: 'desc',
  obrigacoesPl: 'asc',
  cotistas: 'desc',
};

/** v2.4: ordem padrão A–Z (a ordem nunca sugere preferência). */
export const ORDEM_PADRAO: OrdemQuadro = 'ticker';
export const PAGINA_QUADRO = 25;

/** Card Educação: aponta para a página do curso até existirem módulos específicos (decisão 12). */
export const LINK_EDUCACAO: Record<ClasseQuadro, string> = {
  acao: '/educacao',
  fii: '/educacao',
  stock: '/educacao',
  reit: '/educacao',
};

/** Alvos de toque (celular). */
export const ALVO_MIN = { padrao: 'min-h-11', botaoPrincipal: 'min-h-12' } as const;
