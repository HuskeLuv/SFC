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
  percentualCDI: number;
  indexador: string;
  emissor: string;
  emissorId: string;
  periodo: string;
  descricao: string;
  observacoes: string;
  metodo: 'valor' | 'percentual';
  moeda: string;
  nomePersonalizado: string;
  precoUnitario: number;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: string;
  benchmark: string;
  estrategia: 'value' | 'growth' | 'risk' | '';
  tipoFii: 'fofi' | 'tvm' | 'tijolo' | '';

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
  dataAporte?: string;
  valorAporte?: string;
}

export const TIPOS_ATIVO = [
  { value: "reserva-emergencia", label: "Reserva de Emergência" },
  { value: "reserva-oportunidade", label: "Reserva de Oportunidade" },
  { value: "acao", label: "Ações" },
  { value: "bdr", label: "BDRs" },
  { value: "conta-corrente", label: "Conta Corrente" },
  { value: "criptoativo", label: "Criptoativos" },
  { value: "debenture", label: "Debêntures" },
  { value: "fundo", label: "Fundos" },
  { value: "fii", label: "Fundos Imobiliários (FII's)" },
  { value: "reit", label: "REIT's" },
  { value: "stock", label: "Stocks" },
  { value: "moeda", label: "Moedas" },
  { value: "personalizado", label: "Personalizado" },
  { value: "poupanca", label: "Poupança" },
  { value: "previdencia", label: "Previdência" },
  { value: "renda-fixa", label: "Renda Fixa Pré-Fixada" },
  { value: "renda-fixa-posfixada", label: "Renda Fixa Pós-Fixada" },
  { value: "tesouro-direto", label: "Tesouro Direto" },
];

export const RENDA_FIXA_TIPOS = [
  { value: "CDB_PRE", label: "CDB Pré" },
  { value: "LC_PRE", label: "LC Pré" },
  { value: "LCI_PRE", label: "LCI Pré" },
  { value: "LCA_PRE", label: "LCA Pré" },
  { value: "RDB_PRE", label: "RDB Pré" },
  { value: "LF_PRE", label: "LF Pré" },
  { value: "LFS_PRE", label: "LFS Pré" },
  { value: "CRI_PRE", label: "CRI Pré" },
  { value: "CRA_PRE", label: "CRA Pré" },
  { value: "DPGE_PRE", label: "DPGE Pré" },
  { value: "RDC_PRE", label: "RDC Pré" },
  { value: "LIG_PRE", label: "LIG Pré" },
];

export const MOEDAS_FIXAS = [
  { value: "USD", label: "Dólar Americano (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "Libra Esterlina (GBP)" },
  { value: "CAD", label: "Dólar Canadense (CAD)" },
  { value: "AUD", label: "Dólar Australiano (AUD)" },
];

export const INDEXADORES = [
  { value: "cdi+taxa", label: "CDI + Taxa" },
  { value: "cdi", label: "CDI" },
  { value: "ipca", label: "IPCA" },
  { value: "igp-m", label: "IGP-M" },
  { value: "igp-di", label: "IGP-DI" },
];

/** Indexadores para Renda Fixa Pós-Fixada (prisma FixedIncomeIndexer: CDI, IPCA) */
export const RENDA_FIXA_INDEXADORES_POS = [
  { value: "CDI", label: "CDI" },
  { value: "IPCA", label: "IPCA" },
];

export const PERIODOS = [
  { value: "1-mes", label: "1 Mês" },
  { value: "3-meses", label: "3 Meses" },
  { value: "6-meses", label: "6 Meses" },
  { value: "1-ano", label: "1 Ano" },
  { value: "2-anos", label: "2 Anos" },
  { value: "3-anos", label: "3 Anos" },
  { value: "5-anos", label: "5 Anos" },
  { value: "10-anos", label: "10 Anos" },
  { value: "15-anos", label: "15 Anos" },
  { value: "20-anos", label: "20 Anos" },
  { value: "30-anos", label: "30 Anos" },
];
