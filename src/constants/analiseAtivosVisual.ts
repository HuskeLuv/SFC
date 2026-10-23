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
import type { ChaveRotuloEuaEn } from '@/services/analiseAtivos/textosEuaEn';
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
/**
 * Visual v2 (ANALISE_ATIVOS_VISUAL_V2_HABILITADO, 23/10): o ✓ atendido da página do ativo sai em
 * marinho discreto, como no HTML do Pedro (seguranca #314666; tranquilidade no escuro).
 */
export const MARCA_ATENDE_MARINHO = 'bg-[#314666] text-white dark:bg-[#6E9DC4] dark:text-[#18181B]';
/** Visual v2: barras dos critérios no azul vivo da marca (outside #0079F2; não é texto). */
export const BARRA_CRITERIO_V2 = 'fill-[#0079F2] dark:fill-[#6E9DC4]';
/** Hex da exceção do ✓ verde (só para os testes de fonte que a aceitam explicitamente). */
export const CORES_EXCECAO_ATENDE: readonly string[] = Object.values(VERDE_ATENDE);

/**
 * fundamentei-regras (F4, item C; Wellington 20/10): cores de EXCEÇÃO do HTML do Pedro, SÓ na
 * Análise de Ativos e SÓ com ANALISE_ATIVOS_VISUAL_V2_HABILITADO. Ficam aqui (e nas classes de
 * VISUAL_V2 abaixo) e em nenhum componente: os testes de paleta dos componentes continuam
 * aceitando só CORES_PERMITIDAS. Fora de CORES_PERMITIDAS, como o verde do ✓.
 * - acento (chip ligado, ícone do ticker, contagem da aba): --accent-bg / --accent-ink;
 * - superfície 2 (pílula desligada, faixa de grupo do Comparador, slots): --surface2;
 * - tintas dos KPIs (blocos 4×2): --tint-blue / --tint-gray / --tint-blue2;
 * - dourado (#B8842E nos DOIS temas): cotação do gráfico Lucro × Cotação e média dos múltiplos
 *   históricos (autorizados em 20/10). O marcador da cotação de Meus cenários segue o do #309.
 * Nada de verde/vermelho semântico novo.
 */
export const CORES_EXCECAO_ANALISE = {
  acentoFundo: { claro: '#E8F0FD', escuro: '#233247' },
  acentoTexto: { claro: '#1D6FE0', escuro: '#7DB4FF' },
  superficie2: { claro: '#F3F5F9', escuro: '#1E222A' },
  tintaAzul: { claro: '#E8F0FB', escuro: '#1F2A3D' },
  tintaCinza: { claro: '#ECEFF4', escuro: '#262A33' },
  tintaAzul2: { claro: '#DFEAFB', escuro: '#1B2B45' },
  dourado: { claro: '#B8842E', escuro: '#B8842E' },
} as const;

/** Hex da exceção da Análise (para o teste de paleta). */
export const HEX_EXCECAO_ANALISE: readonly string[] = [
  ...new Set(Object.values(CORES_EXCECAO_ANALISE).flatMap((c) => [c.claro, c.escuro])),
];

/** Dourado da série de cotação e da média histórica (mesmo tom no claro e no escuro). */
export const DOURADO_ANALISE = CORES_EXCECAO_ANALISE.dourado.claro;

/**
 * Classes do visual v2 (item C, HTML do Pedro). Só usadas com visualV2 ligado; com a chave
 * desligada os componentes seguem com as classes de sempre (DOM idêntico).
 */
export const VISUAL_V2 = {
  /** chip de critério ligado: pílula 99px, sem borda, acento */
  chipLigado:
    'border-transparent bg-[#E8F0FD] font-semibold text-[#1D6FE0] dark:border-transparent dark:bg-[#233247] dark:text-[#7DB4FF]',
  chipDesligado:
    'border-gray-200 bg-white font-medium text-gray-600 group-hover:bg-gray-50 dark:border-[#2E3440] dark:bg-transparent dark:text-gray-300 dark:group-hover:bg-white/[0.04]',
  /** pílula compacta (janela, A–Z, Resumo|Detalhado, 5A|10A, Essencial|Raio-X): ligada = patrimonio */
  pilulaLigada: 'bg-[#396CAA] font-semibold text-white dark:bg-[#6E9DC4] dark:text-[#2D2D2D]',
  pilulaDesligada:
    'bg-[#F3F5F9] font-semibold text-gray-600 hover:text-[#314666] dark:bg-[#1E222A] dark:text-gray-300 dark:hover:text-white',
  /** ícone do ticker 32px raio 8 (Quadro, slots do Comparador) */
  iconeTicker: 'bg-[#E8F0FD] text-[#1D6FE0] dark:bg-[#233247] dark:text-[#7DB4FF]',
  /** texto do ticker no acento (Pares, Quadro) */
  textoAcento: 'text-[#1D6FE0] dark:text-[#7DB4FF]',
  /** contagem da aba de classe (ResponsiveTabNav.badge) */
  badgeAtivo: 'bg-[#E8F0FD] text-[#1D6FE0] dark:bg-[#233247] dark:text-[#7DB4FF]',
  badgeInativo: 'bg-[#F3F5F9] text-gray-500 dark:bg-[#1E222A] dark:text-gray-400',
  /** superfície 2 (faixa de grupo do Comparador, slots, trilho das barras) */
  superficie2: 'bg-[#F3F5F9] dark:bg-[#1E222A]',
  /** tintas dos 8 KPIs, na ordem do HTML do Pedro: b · cinza · b2 · cinza · cinza · b · cinza · b2 */
  tintasKpi: [
    'bg-[#E8F0FB] dark:bg-[#1F2A3D]',
    'bg-[#ECEFF4] dark:bg-[#262A33]',
    'bg-[#DFEAFB] dark:bg-[#1B2B45]',
    'bg-[#ECEFF4] dark:bg-[#262A33]',
    'bg-[#ECEFF4] dark:bg-[#262A33]',
    'bg-[#E8F0FB] dark:bg-[#1F2A3D]',
    'bg-[#ECEFF4] dark:bg-[#262A33]',
    'bg-[#DFEAFB] dark:bg-[#1B2B45]',
  ],
  /** linha destacada (ano mais recente do Essencial, próprio ativo nos Pares) */
  linhaDestaque: 'bg-[#E8F0FB] font-semibold dark:bg-[#1F2A3D]',
} as const;

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
  /**
   * fundamentei-regras (A4.d, F4): nome EN da coluna EUA (ROTULOS_EUA_EN), usado só com
   * `rotulosEn` da resposta; `rotuloEnAjustado` = REIT com o caixa operacional ajustado (A2.d).
   */
  rotuloEn?: ChaveRotuloEuaEn;
  rotuloEnAjustado?: ChaveRotuloEuaEn;
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
 * A4.d (F4): nomes EN das colunas EUA por código (lista fechada de textosEuaEn.ts). Ativo, setor,
 * segmento, critérios, Na carteira e Lucro 10 anos ficam em português.
 */
const ROTULO_EN_COLUNA: Partial<Record<string, ChaveRotuloEuaEn>> = {
  lucrosSeguidos: 'profitStreak',
  roe: 'roe',
  margemLiquida: 'netMargin',
  dpaUsd: 'dividendPerShare',
  divLiqEbitda: 'netDebtEbitda',
  payout: 'payout',
  fcoAcao: 'ocfPerShare',
  divFco: 'payout',
  anosDividendo: 'dividendGrowing',
  pl: 'pe',
  dy12m: 'dividendYield',
};
const ROTULO_EN_AJUSTADO: Partial<Record<string, ChaveRotuloEuaEn>> = {
  fcoAcao: 'ocfAdjustedPerShare',
  divFco: 'payoutOcfAdjusted',
};

function comRotuloEn(colunas: ColunaQuadro[]): ColunaQuadro[] {
  return colunas.map((c) => {
    const en = ROTULO_EN_COLUNA[c.codigo];
    if (!en) return c;
    const aj = ROTULO_EN_AJUSTADO[c.codigo];
    return aj ? { ...c, rotuloEn: en, rotuloEnAjustado: aj } : { ...c, rotuloEn: en };
  });
}

for (const classe of ['stock', 'reit'] as const) {
  for (const modo of ['resumo', 'detalhado'] as const) {
    COLUNAS[classe][modo] = comRotuloEn(COLUNAS[classe][modo]);
  }
}

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
for (const classe of ['stock', 'reit'] as const) {
  COLUNAS_PRECO_EUA[classe].antesCriterios = comRotuloEn(COLUNAS_PRECO_EUA[classe].antesCriterios);
}

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
