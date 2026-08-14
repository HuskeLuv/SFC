/**
 * Mapeia `Asset.type` (valor cru do banco) para o "tipo" de UI usado nos wizards
 * de aporte/resgate, e os rótulos legíveis. Compartilhado entre
 * `/api/carteira/resgate/tipos` e `/api/carteira/aporte/tipos`.
 */
import { FUNDO_TYPES_AGRUPADOS } from '@/lib/fundoTypes';

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
  opcao: 'Opções',
  'renda-fixa-prefixada': 'Renda Fixa Prefixada',
  'renda-fixa': 'Renda Fixa',
  'renda-fixa-hibrida': 'Renda Fixa Híbrida',
  previdencia: 'Previdência & Seguros',
  'conta-corrente': 'Conta Corrente',
  personalizado: 'Personalizado',
  'imoveis-bens': 'Imóveis & Bens',
};

/** Fundos da aba agrupada ("Fundos") → um único tipo de UI. */
const FUNDOS_AGRUPADOS = new Set<string>(FUNDO_TYPES_AGRUPADOS);

export const mapPortfolioToTipo = (
  item: {
    asset?: { type?: string | null; symbol?: string | null } | null;
  },
  /**
   * Destino de Tesouro comprado para uma reserva (transaction.notes
   * .tesouroDestino, via getTesouroDestinoByAssetId). O catálogo classifica o
   * título como 'tesouro-direto', mas a UI o exibe na aba da reserva — sem o
   * destino, o resgate de um Tesouro da Reserva de Emergência só aparecia em
   * Renda Fixa (bug ago/2026).
   */
  tesouroDestino?: 'reserva-emergencia' | 'reserva-oportunidade' | null,
): string => {
  const assetType = item.asset?.type || '';
  if (assetType === 'tesouro-direto' && tesouroDestino) return tesouroDestino;
  if (assetType === 'stock') return 'acao';
  if (assetType === 'fii') return 'fii';
  // Tipos de fundo da CVM (fia/multimercado/fidc/fiagro/...) caíam no default e
  // vazavam o slug cru pro Step1 do wizard, fragmentando a carteira em ~10
  // "tipos" ilegíveis (auditoria 2026-08-06, achado #14). Mesmo agrupamento da
  // aba "Fundos" da carteira.
  if (FUNDOS_AGRUPADOS.has(assetType)) return 'fundo';
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
    case 'etf-cvm':
      return 'etf';
    case 'reit':
      return 'reit';
    case 'bdr':
      return 'bdr';
    case 'bond':
    case 'tesouro-direto':
      return 'renda-fixa';
    case 'previdencia':
    case 'insurance':
      return 'previdencia';
    case 'cash':
      return 'conta-corrente';
    default:
      return assetType || 'personalizado';
  }
};

const isRendaFixaTipo = (tipo: string): boolean =>
  tipo === 'renda-fixa' || tipo.startsWith('renda-fixa-');

/**
 * Match tolerante entre o tipo mapeado do Portfolio e o tipo pedido pelo wizard.
 * RF é uma família: `bond` mapeia para "renda-fixa", mas o caller pode pedir
 * "renda-fixa-prefixada"/"-posfixada"/"-hibrida" (classificação vive em
 * FixedIncomeAsset.type). Único ponto de verdade — as rotas de
 * /resgate/{ativos,instituicoes} usavam cópias divergentes deste código e a
 * cópia de `ativos` mapeava bond → 'renda-fixa-prefixada', tornando RF
 * invisível no resgate e no aporte (auditoria 2026-08-06, achado #1).
 */
export const matchesTipo = (mapped: string, requested: string): boolean => {
  if (mapped === requested) return true;
  if (mapped === 'renda-fixa' && isRendaFixaTipo(requested)) return true;
  return false;
};
