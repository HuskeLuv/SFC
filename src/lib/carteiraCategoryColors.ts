/**
 * Mapeamento de categorias da carteira para cores do gráfico de tipos de investimento.
 * Reutilizado em PieChartCarteiraInvestimentos e página Histórico.
 */
export const CATEGORIA_CORES: Record<string, string> = {
  reservaEmergencia: '#4F81BD',
  reservaOportunidade: '#DDD9C3',
  rendaFixaFundos: '#404040',
  fimFia: '#B9CDE5',
  fiis: '#9E8A58',
  acoes: '#FFC000',
  stocks: '#9E8A58',
  reits: '#FFFF00',
  etfs: '#E46C0A',
  moedasCriptos: '#C4BD97',
  previdenciaSeguros: '#EEECE1',
  opcoes: '#00CCFF',
  imoveisBens: '#6B7280',
};

export const CATEGORIA_LABELS: Record<string, string> = {
  reservaEmergencia: 'Reserva Emergência',
  reservaOportunidade: 'Reserva Oportunidade',
  rendaFixaFundos: 'Renda Fixa',
  fimFia: 'FIM/FIA',
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
