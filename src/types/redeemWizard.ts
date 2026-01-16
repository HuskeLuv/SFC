export interface RedeemWizardStep {
  id: string;
  title: string;
  description: string;
  isValid: boolean;
}

export interface RedeemWizardFormData {
  tipoAtivo: string;
  instituicao: string;
  instituicaoId: string;
  ativo: string;
  portfolioId: string;
  assetId: string;
  stockId: string;
  moeda: string;
  dataResgate: string;
  metodoResgate: "quantidade" | "valor";
  quantidade: number;
  cotacaoUnitaria: number;
  valorResgate: number;
  observacoes: string;
  availableQuantity: number;
  availableTotal: number;
}

export interface RedeemWizardErrors {
  tipoAtivo?: string;
  instituicao?: string;
  ativo?: string;
  dataResgate?: string;
  metodoResgate?: string;
  quantidade?: string;
  cotacaoUnitaria?: string;
  valorResgate?: string;
}

export interface RedeemAssetTypeOption {
  value: string;
  label: string;
}

export interface RedeemAssetOption {
  id: string;
  label: string;
  subtitle?: string;
  portfolioId: string;
  assetId?: string | null;
  stockId?: string | null;
  symbol: string;
  name: string;
  tipoAtivo: string;
  quantity: number;
  avgPrice: number;
  totalInvested: number;
  currency: string;
}
