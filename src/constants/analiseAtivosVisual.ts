/**
 * Constantes VISUAIS da Análise de Ativos — Fase 1 (decisão 1 do Wellington, 02/10/2026).
 *
 * Só a paleta My Finance (brandColors.ts) + cinzas do app + negativos #D92D20 (claro) / #F97066
 * (escuro). Nada de verde/âmbar: verde lê como "compre" e não está na paleta.
 * - Anel do Índice numa cor só (outside #0079F2, elemento NÃO textual); número em gray-800/branco.
 *   Incompleto = trilho tracejado (sem cor nova). FAIXA_INDICE é só dado, sem mapa de cor.
 * - Semáforo: Atende e Parcial em patrimonio #396CAA (escuro tranquilidade #6E9DC4), diferenciados
 *   pelo ÍCONE (círculo cheio ✓ / meio círculo); só "Não atende" em vermelho, com ✕; "Sem dado"
 *   tracejado cinza com '?'; "Não se aplica" com traço.
 * - Texto/link: #396CAA no claro / #6E9DC4 no escuro. #0079F2 nunca em texto.
 *
 * O teste (__tests__ em src/constants) lista todos os hex deste arquivo e falha com cor fora da
 * paleta permitida (CORES_PERMITIDAS).
 */
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import type { IdCriterio } from '@/types/analiseAtivosCriterios';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  ModoQuadro,
  OrdemQuadro,
  StatusCriterioTela,
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

/** Texto/link (claro / escuro). */
export const COR_LINK = {
  claro: MYFINANCE_BRAND.patrimonio,
  escuro: MYFINANCE_BRAND.tranquilidade,
  classes: 'text-[#396CAA] dark:text-[#6E9DC4]',
} as const;

export interface EstiloStatusCriterio {
  /** forma do ícone (BadgeCriterio desenha): nunca só cor */
  icone: 'circulo_check' | 'meio_circulo' | 'xis' | 'circulo_tracejado_interrogacao' | 'traco';
  /** caractere de apoio para leitores/fallback */
  simbolo: string;
  /** classes Tailwind de texto + ícone (claro e escuro) */
  texto: string;
  /** classes de fundo do badge */
  fundo: string;
  /** borda (tracejada só em sem_dado) */
  borda: string;
}

export const STATUS_CRITERIO: Record<StatusCriterioTela, EstiloStatusCriterio> = {
  atende: {
    icone: 'circulo_check',
    simbolo: '✓',
    texto: 'text-[#396CAA] dark:text-[#6E9DC4]',
    fundo: 'bg-[#EDF2F8] dark:bg-[#6E9DC4]/15',
    borda: 'border border-transparent',
  },
  parcial: {
    icone: 'meio_circulo',
    simbolo: '◐',
    texto: 'text-[#396CAA] dark:text-[#6E9DC4]',
    fundo: 'bg-gray-100 dark:bg-gray-800',
    borda: 'border border-transparent',
  },
  nao_atende: {
    icone: 'xis',
    simbolo: '✕',
    texto: 'text-[#D92D20] dark:text-[#F97066]',
    fundo: 'bg-error-50 dark:bg-error-500/10',
    borda: 'border border-transparent',
  },
  sem_dado: {
    icone: 'circulo_tracejado_interrogacao',
    simbolo: '?',
    texto: 'text-gray-500 dark:text-gray-400',
    fundo: 'bg-transparent',
    borda: 'border border-dashed border-[#98A2B3]',
  },
  nao_se_aplica: {
    icone: 'traco',
    simbolo: '—',
    texto: 'text-gray-500 dark:text-gray-400',
    fundo: 'bg-transparent',
    borda: 'border border-transparent',
  },
};

/** Anel do Índice MF: uma cor só; incompleto = trilho tracejado. */
export const ANEL = {
  trilho: { claro: CINZAS_APP.gray200, escuro: CINZAS_APP.escuroBorda },
  preenchimento: MYFINANCE_BRAND.outside,
  numero: 'text-gray-800 dark:text-white',
  tracejadoIncompleto: true,
} as const;

/** Faixas do Índice MF — SÓ DADO (sem mapa de cor, decisão 1). */
export const FAIXA_INDICE = [
  { min: 8, rotulo: '8 a 10' },
  { min: 6, rotulo: '6 a 8' },
  { min: 4, rotulo: '4 a 6' },
  { min: 0, rotulo: '0 a 4' },
] as const;

export function faixaIndice(valor: number | null): string | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  return FAIXA_INDICE.find((f) => valor >= f.min)?.rotulo ?? null;
}

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

/** Coluna "Critérios" (CelulaCriterios: 'n de 6'; financeiras 'n de 3'). */
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
};

/**
 * Critérios que a URL/barra aceitam por classe: os chips HABILITADOS do params v1 (em FII, os ids
 * de tijolo — o par de papel vem pelas equivalências; vacância/inadimplência ficam fora, D3). A rota
 * é a autoridade (400 para o resto); aqui só se limpa a URL.
 */
export const CRITERIOS_FILTRAVEIS: Record<ClasseQuadro, readonly IdCriterio[]> = {
  acao: CRITERIA_PARAMS_V1.perfis.acao.filter((c) => c.ativo !== false).map((c) => c.id),
  fii: CRITERIA_PARAMS_V1.perfis.fii_tijolo.filter((c) => c.ativo !== false).map((c) => c.id),
};

/** Critérios de ação que não se aplicam a financeiras (D4: 'n de 3'). */
export const CRITERIOS_NAO_SE_APLICAM_FINANCEIRA: readonly IdCriterio[] =
  CRITERIA_PARAMS_V1.perfis.acao_financeira.naoSeAplica;

export type FiltroRapido =
  | 'lucroConsistente'
  | 'dyMinAcao'
  | 'dyMinFii'
  | 'pvpMax'
  | 'tijolo'
  | 'papel'
  | 'naCarteira'
  | 'somenteCompletos';

/** Chips por classe (o popover Setor/Segmento é à parte). */
export const FILTROS_RAPIDOS: Record<ClasseQuadro, FiltroRapido[]> = {
  acao: ['lucroConsistente', 'dyMinAcao', 'naCarteira', 'somenteCompletos'],
  fii: ['tijolo', 'papel', 'dyMinFii', 'pvpMax', 'naCarteira', 'somenteCompletos'],
};

/** Valores dos chips de limiar. */
export const LIMIARES_FILTRO = { dyMinAcao: 4, dyMinFii: 8, pvpMax: 1, lucroAnos: 5 } as const;

/** Primeiro clique na coluna = direção padrão (múltiplos "quanto menor" começam asc). */
export const DIRECAO_PADRAO: Record<OrdemQuadro, DirecaoOrdem> = {
  indiceMf: 'desc',
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

/** v2.4: ordem padrão A–Z (o indicador antigo saiu da superfície; a ordem nunca sugere preferência). */
export const ORDEM_PADRAO: Exclude<OrdemQuadro, 'indiceMf'> = 'ticker';
export const PAGINA_QUADRO = 25;

/** Card Educação: aponta para a página do curso até existirem módulos específicos (decisão 12). */
export const LINK_EDUCACAO: Record<ClasseQuadro, string> = {
  acao: '/educacao',
  fii: '/educacao',
};

/** Alvos de toque (celular). */
export const ALVO_MIN = { padrao: 'min-h-11', botaoPrincipal: 'min-h-12' } as const;
