export interface WizardStep {
  id: string;
  title: string;
  description: string;
  isValid: boolean;
}

export interface AutocompleteOption {
  value: string;
  label: string;
  subtitle?: string;
}

export interface Institution {
  id: string;
  nome: string;
  codigo: string;
  status: string;
}

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency: string;
  source: string;
}

export interface Emissor {
  id: string;
  nome: string;
  tipo: string;
}

export interface WizardFormData {
  operacao: 'compra' | 'aporte';
  // Passo 1: Tipo de Ativo
  tipoAtivo: string;
  rendaFixaTipo?: string;
  /** Variante da renda fixa: '' = não selecionado, 'pre' = pré-fixada, 'pos' = pós-fixada, 'hib' = híbrida */
  rendaFixaVariante?: '' | 'pre' | 'pos' | 'hib';
  rendaFixaIndexer?: string;
  rendaFixaIndexerPercent?: number;
  rendaFixaLiquidity?: string;
  rendaFixaTaxExempt?: boolean;

  // Passo 2: Instituição
  instituicao: string;
  instituicaoId: string;

  // Passo 3: Ativo
  ativo: string;
  assetId: string;

  // Passo 4: Informações do Ativo (varia por tipo)
  dataCompra: string;
  dataInicio: string;
  dataVencimento: string;
  quantidade: number;
  cotacaoUnitaria: number;
  cotacaoCompra: number;
  cotacaoMoeda: number;
  valorInvestido: number;
  valorAplicado: number;
  taxaCorretagem: number;
  taxaJurosAnual: number;
  taxaFixaAnual?: number; // Parte fixa para Renda Fixa Híbrida
  percentualCDI: number;
  indexador: string;
  emissor: string;
  emissorId: string;
  periodo: string;
  descricao: string;
  observacoes: string;
  metodo: 'valor' | 'percentual' | 'cotas';
  moeda: string;
  nomePersonalizado: string;
  precoUnitario: number;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: string;
  benchmark: string;
  estrategia: 'value' | 'growth' | 'risk' | '';
  tipoFii: 'fofi' | 'tvm' | 'tijolo' | '';

  /** Para debênture: tipo (Pré, Pós ou Híbrida) - define em qual seção da aba Renda Fixa será exibida */
  tipoDebenture?: 'prefixada' | 'pos-fixada' | 'hibrida';

  /** Para fundo: tipo (FIM ou FIA) - define em qual seção da aba FIM/FIA será exibido */
  tipoFundo?: 'fim' | 'fia';

  /** Para fundo: onde o fundo deve aparecer (Renda Fixa, Reserva, ou FIM/FIA) */
  fundoDestino?: 'reserva-emergencia' | 'reserva-oportunidade' | 'renda-fixa' | 'fim' | 'fia';

  /** Para fundo em Renda Fixa: tipo (Pré, Pós ou Híbrida) */
  fundoRendaFixaTipo?: 'prefixada' | 'pos-fixada' | 'hibrida';

  /** Para REIT: estratégia (Growth, Value, Risk) - define em qual seção da aba REIT será exibido */
  estrategiaReit?: 'value' | 'growth' | 'risk';

  /** Para conta corrente: onde o investimento deve aparecer */
  contaCorrenteDestino?: 'reserva-emergencia' | 'reserva-oportunidade';

  /** Para tesouro direto: onde o título deve aparecer (reserva ou renda fixa com tipo) */
  tesouroDestino?:
    | 'reserva-emergencia'
    | 'reserva-oportunidade'
    | 'renda-fixa-prefixada'
    | 'renda-fixa-posfixada'
    | 'renda-fixa-hibrida';

  /** Para opções: tipo (put ou call) e operação (compra ou venda) */
  opcaoTipo?: 'put' | 'call';
  opcaoCompraVenda?: 'compra' | 'venda';

  /** Para Ações Brasil: tipo real do ativo selecionado (acao ou bdr) - usado ao enviar para API */
  acoesBrasilTipo?: 'acao' | 'bdr';

  /** Para ETF: região (Brasil ou EUA) - define em qual seção da aba ETF será exibido */
  regiaoEtf?: 'brasil' | 'estados_unidos';

  // Aporte
  portfolioId: string;
  dataAporte: string;
  valorAporte: number;
  availableQuantity: number;
  availableTotal: number;
}

export interface WizardErrors {
  operacao?: string;
  tipoAtivo?: string;
  rendaFixaTipo?: string;
  rendaFixaIndexer?: string;
  rendaFixaIndexerPercent?: string;
  rendaFixaLiquidity?: string;
  rendaFixaTaxExempt?: string;
  instituicao?: string;
  ativo?: string;
  dataCompra?: string;
  dataInicio?: string;
  dataVencimento?: string;
  quantidade?: string;
  cotacaoUnitaria?: string;
  cotacaoCompra?: string;
  cotacaoMoeda?: string;
  valorInvestido?: string;
  valorAplicado?: string;
  taxaJurosAnual?: string;
  taxaFixaAnual?: string;
  percentualCDI?: string;
  indexador?: string;
  emissor?: string;
  periodo?: string;
  descricao?: string;
  nomePersonalizado?: string;
  precoUnitario?: string;
  moeda?: string;
  cotizacaoResgate?: string;
  liquidacaoResgate?: string;
  vencimento?: string;
  benchmark?: string;
  metodo?: string;
  estrategia?: string;
  tipoFii?: string;
  tipoDebenture?: string;
  tipoFundo?: string;
  fundoDestino?: string;
  fundoRendaFixaTipo?: string;
  estrategiaReit?: string;
  regiaoEtf?: string;
  contaCorrenteDestino?: string;
  tesouroDestino?: string;
  opcaoTipo?: string;
  opcaoCompraVenda?: string;
  dataAporte?: string;
  valorAporte?: string;
}

/** Tipos de ativo aceitos pela API de operação. Impede adição de tipos desconhecidos. */
export const TIPOS_ATIVO_PERMITIDOS = [
  'emergency',
  'opportunity',
  'conta-corrente',
  'poupanca',
  'criptoativo',
  'moeda',
  'personalizado',
  'renda-fixa-prefixada',
  'renda-fixa',
  'renda-fixa-posfixada',
  'renda-fixa-hibrida',
  'tesouro-direto',
  'debenture',
  'fundo',
  'previdencia',
  'fii',
  'acao',
  'bdr',
  'acoes-brasil',
  'etf',
  'reit',
  'stock',
  'opcoes',
] as const;

export type TipoAtivoPermitido = (typeof TIPOS_ATIVO_PERMITIDOS)[number];

export const isTipoAtivoPermitido = (tipo: string): tipo is TipoAtivoPermitido =>
  (TIPOS_ATIVO_PERMITIDOS as readonly string[]).includes(tipo);

export const TIPOS_ATIVO = [
  // Ordem das tabs (reserva-emergencia, reserva-oportunidade, renda-fixa, fim-fia, fiis, acoes, stocks, reit, etf, moedas-criptos, previdencia)
  { value: 'reserva-emergencia', label: 'Reserva de Emergência' },
  { value: 'reserva-oportunidade', label: 'Reserva de Oportunidade' },
  { value: 'renda-fixa', label: 'Renda Fixa' },
  { value: 'fundo', label: 'Fundos' },
  { value: 'fii', label: "Fundos Imobiliários (FII's)" },
  { value: 'acoes-brasil', label: 'Ações Brasil' },
  { value: 'stock', label: 'Stocks' },
  { value: 'reit', label: "REIT's" },
  { value: 'etf', label: "ETF's" },
  { value: 'moeda', label: 'Moedas' },
  { value: 'criptoativo', label: 'Criptomoedas' },
  { value: 'previdencia', label: 'Previdência e Seguros' },
  // Sem tab - por último
  { value: 'conta-corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'debenture', label: 'Debêntures' },
  { value: 'tesouro-direto', label: 'Tesouro Direto' },
  { value: 'personalizado', label: 'Personalizado' },
  { value: 'opcoes', label: 'Opções' },
];

export const RENDA_FIXA_TIPOS = [
  { value: 'CDB_PRE', label: 'CDB Pré' },
  { value: 'LC_PRE', label: 'LC Pré' },
  { value: 'LCI_PRE', label: 'LCI Pré' },
  { value: 'LCA_PRE', label: 'LCA Pré' },
  { value: 'RDB_PRE', label: 'RDB Pré' },
  { value: 'LF_PRE', label: 'LF Pré' },
  { value: 'LFS_PRE', label: 'LFS Pré' },
  { value: 'CRI_PRE', label: 'CRI Pré' },
  { value: 'CRA_PRE', label: 'CRA Pré' },
  { value: 'DPGE_PRE', label: 'DPGE Pré' },
  { value: 'RDC_PRE', label: 'RDC Pré' },
  { value: 'LIG_PRE', label: 'LIG Pré' },
];

/** Tipos para Renda Fixa Híbrida (parte fixa + indexador) */
export const RENDA_FIXA_TIPOS_HIBRIDOS = [
  { value: 'CDB_HIB', label: 'CDB Híbrido' },
  { value: 'LC_HIB', label: 'LC Híbrida' },
  { value: 'LCI_HIB', label: 'LCI Híbrida' },
  { value: 'LCA_HIB', label: 'LCA Híbrida' },
  { value: 'RDB_HIB', label: 'RDB Híbrido' },
  { value: 'LF_HIB', label: 'LF Híbrida' },
  { value: 'LFS_HIB', label: 'LFS Híbrida' },
  { value: 'CRI_HIB', label: 'CRI Híbrido' },
  { value: 'CRA_HIB', label: 'CRA Híbrido' },
  { value: 'DPGE_HIB', label: 'DPGE Híbrido' },
  { value: 'RDC_HIB', label: 'RDC Híbrido' },
  { value: 'LIG_HIB', label: 'LIG Híbrido' },
];

export const MOEDAS_FIXAS = [
  { value: 'USD', label: 'Dólar Americano (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'Libra Esterlina (GBP)' },
  { value: 'CAD', label: 'Dólar Canadense (CAD)' },
  { value: 'AUD', label: 'Dólar Australiano (AUD)' },
];

export const INDEXADORES = [
  { value: 'cdi+taxa', label: 'CDI + Taxa' },
  { value: 'cdi', label: 'CDI' },
  { value: 'ipca', label: 'IPCA' },
  { value: 'igp-m', label: 'IGP-M' },
  { value: 'igp-di', label: 'IGP-DI' },
];

/** Indexadores para Renda Fixa Pós-Fixada (prisma FixedIncomeIndexer: CDI, IPCA) */
export const RENDA_FIXA_INDEXADORES_POS = [
  { value: 'CDI', label: 'CDI' },
  { value: 'IPCA', label: 'IPCA' },
];

export const PERIODOS = [
  { value: '1-mes', label: '1 Mês' },
  { value: '3-meses', label: '3 Meses' },
  { value: '6-meses', label: '6 Meses' },
  { value: '1-ano', label: '1 Ano' },
  { value: '2-anos', label: '2 Anos' },
  { value: '3-anos', label: '3 Anos' },
  { value: '5-anos', label: '5 Anos' },
  { value: '10-anos', label: '10 Anos' },
  { value: '15-anos', label: '15 Anos' },
  { value: '20-anos', label: '20 Anos' },
  { value: '30-anos', label: '30 Anos' },
];
