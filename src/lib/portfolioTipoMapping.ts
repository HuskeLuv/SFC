/**
 * Mapeia `Asset.type` (valor cru do banco) para o "tipo" de UI usado nos wizards
 * de aporte/resgate, e os rótulos legíveis. Compartilhado entre
 * `/api/carteira/resgate/tipos` e `/api/carteira/aporte/tipos`.
 */
export const TIPO_LABELS: Record<string, string> = {
  'reserva-emergencia': 'Reserva de Emergência',
  'reserva-oportunidade': 'Reserva de Oportunidade',
  acao: 'Ações',
  fii: 'Fundos Imobiliários e REITs',
  bdr: 'BDRs',
  etf: 'ETFs',
  reit: 'REITs',
  criptoativo: 'Criptoativos',
  moeda: 'Moedas',
  fundo: 'Fundos',
  'renda-fixa-prefixada': 'Renda Fixa Prefixada',
  'renda-fixa': 'Renda Fixa',
  'renda-fixa-hibrida': 'Renda Fixa Híbrida',
  previdencia: 'Previdência',
  'conta-corrente': 'Conta Corrente',
  personalizado: 'Personalizado',
  'imoveis-bens': 'Imóveis & Bens',
};

export const mapPortfolioToTipo = (item: {
  asset?: { type?: string | null; symbol?: string | null } | null;
}): string => {
  const assetType = item.asset?.type || '';
  if (assetType === 'stock') return 'acao';
  if (assetType === 'fii') return 'fii';
  switch (assetType) {
    case 'emergency':
      return 'reserva-emergencia';
    case 'opportunity':
      return 'reserva-oportunidade';
    case 'personalizado':
      return 'personalizado';
    case 'imovel':
      return 'imoveis-bens';
    case 'crypto':
      return 'criptoativo';
    case 'currency':
      return 'moeda';
    case 'etf':
      return 'etf';
    case 'reit':
      return 'reit';
    case 'bdr':
      return 'bdr';
    case 'fund':
      return 'fundo';
    case 'bond':
      return 'renda-fixa';
    case 'insurance':
      return 'previdencia';
    case 'cash':
      return 'conta-corrente';
    default:
      return assetType || 'personalizado';
  }
};

/**
 * Tipos de UI share-based (cotas/ações) — crescem via Comprar, não via Aporte.
 * Usado pelo `/api/carteira/aporte/tipos` para NÃO oferecê-los no aporte.
 * Espelha EQUITY_ASSET_TYPES (asset.type) já mapeado para o tipo de UI.
 */
export const EQUITY_TIPOS = new Set(['acao', 'fii', 'etf', 'reit', 'bdr']);
