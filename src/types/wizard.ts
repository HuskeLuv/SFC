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
  // Passo 1: Tipo de Ativo
  tipoAtivo: string;
  
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
}

export interface WizardErrors {
  tipoAtivo?: string;
  instituicao?: string;
  ativo?: string;
  dataCompra?: string;
  dataInicio?: string;
  dataVencimento?: string;
  quantidade?: string;
  cotacaoUnitaria?: string;
  cotacaoCompra?: string;
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
  { value: "fii", label: "Fundos Imobiliários e REITs" },
  { value: "moeda", label: "Moedas" },
  { value: "personalizado", label: "Personalizados" },
  { value: "poupanca", label: "Poupança" },
  { value: "previdencia", label: "Previdência" },
  { value: "renda-fixa-prefixada", label: "Renda Fixa Prefixada" },
  { value: "renda-fixa-posfixada", label: "Renda Fixa Pós-Fixada" },
  { value: "tesouro-direto", label: "Tesouro Direto" },
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
