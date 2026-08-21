import { MYFINANCE_BRAND } from '@/constants/brandColors';

/**
 * Mapeamento de categorias da carteira para cores do gráfico de tipos de investimento.
 * Reutilizado em PieChartCarteiraInvestimentos e página Histórico.
 *
 * Paleta My Finance PARTE 2 (ticket 21/08/2026): como o manual só tem azuis e
 * cinzas, as 13 categorias usam as âncoras oficiais + tons derivados da MESMA
 * família (clareados/escurecidos dos azuis do manual — nunca outro matiz).
 * Na ordem das seções, vizinhos alternam claro/escuro para fatias adjacentes
 * do donut não se confundirem.
 */
export const CATEGORIA_CORES: Record<string, string> = {
  reservaEmergencia: MYFINANCE_BRAND.outside, // #0079F2 azul-assinatura
  reservaOportunidade: MYFINANCE_BRAND.escolha, // #EAEAEA
  rendaFixaFundos: MYFINANCE_BRAND.seguranca, // #314666
  fimFia: '#80BCF8', // outside clareado
  fiis: '#0056AC', // outside escurecido
  acoes: '#9DBEDC', // tranquilidade clareado
  stocks: MYFINANCE_BRAND.patrimonio, // #396CAA
  reits: '#C7D9EA', // azul pálido (tranquilidade→escolha)
  etfs: '#4D9FF5', // outside médio-claro
  moedasCriptos: '#1C2A40', // seguranca escurecido
  previdenciaSeguros: MYFINANCE_BRAND.transparencia, // #CCCCCC
  opcoes: '#3A5C8F', // seguranca→patrimonio
  imoveisBens: MYFINANCE_BRAND.tranquilidade, // #6E9DC4
};

export const CATEGORIA_LABELS: Record<string, string> = {
  reservaEmergencia: 'Reserva Emergência',
  reservaOportunidade: 'Reserva Oportunidade',
  rendaFixaFundos: 'Renda Fixa',
  fimFia: 'Fundos',
  fiis: "FII's",
  acoes: 'Ações',
  stocks: 'Stocks',
  reits: "REIT's",
  etfs: "ETF's",
  moedasCriptos: 'Moedas, Criptomoedas & outros',
  previdenciaSeguros: 'Previdência e Seguros',
  opcoes: 'Opções',
  imoveisBens: 'Imóveis & Bens',
};

export const SECOES_ORDEM = [
  'reservaEmergencia',
  'reservaOportunidade',
  'rendaFixaFundos',
  'fimFia',
  'fiis',
  'acoes',
  'stocks',
  'reits',
  'etfs',
  'moedasCriptos',
  'previdenciaSeguros',
  'opcoes',
  'imoveisBens',
] as const;

export const getCorPorCategoria = (categoria: string): string =>
  CATEGORIA_CORES[categoria] ?? '#6B7280';
