import { SECOES_ORDEM } from '@/lib/carteiraCategoryColors';
import { overrideEfetivo, type BaseCtx } from '@/lib/carteiraMover';

export type CategoriaKey = (typeof SECOES_ORDEM)[number];

export type PortfolioCategoriaInput = {
  stock?: { ticker: string } | null;
  asset?: { type?: string | null; currency?: string | null; symbol?: string; name?: string } | null;
  assetId?: string | null;
  /** Aba escolhida no "Mover na Carteira" (vale só via overrideEfetivo). */
  categoriaOverride?: string | null;
};

/**
 * Classe do item no histórico por classe. `ctx.reservaDestino` (Tesouro de
 * catálogo comprado como reserva, `reservaDestinoPorAsset`) só serve para ler o
 * override do mover contra a aba base certa — sem override, a heurística de
 * sempre (o Tesouro de catálogo continua em Renda Fixa aqui, como antes).
 */
export const getCategoriaFromPortfolio = (
  item: PortfolioCategoriaInput,
  _fixedIncomeAssetIds: Set<string>,
  ctx?: BaseCtx,
): CategoriaKey | null => {
  const symbol = item.asset?.symbol || item.stock?.ticker;
  if (!symbol) return null;

  // Item movido de aba: agrupa na aba escolhida. Vem ANTES do bloco das
  // reservas (mover fase 2: Reservas ↔ Renda Fixa, atrás de
  // MOVER_CAIXA_RF_HABILITADO; chave desligada → override do trio ignorado).
  // Override inválido, igual à aba base ou em item fora das abas movíveis →
  // null → heurística de sempre.
  const movido = item.asset
    ? overrideEfetivo({ ...item.asset, symbol }, item.categoriaOverride, ctx)
    : null;
  if (movido) return movido;

  const assetType = item.asset?.type?.toLowerCase() || '';
  const isReserva =
    assetType === 'emergency' ||
    assetType === 'opportunity' ||
    symbol.startsWith('RESERVA-EMERG') ||
    symbol.startsWith('RESERVA-OPORT');

  if (isReserva) {
    return assetType === 'opportunity' || symbol.startsWith('RESERVA-OPORT')
      ? 'reservaOportunidade'
      : 'reservaEmergencia';
  }

  if (assetType === 'imovel' || assetType === 'personalizado') {
    return 'imoveisBens';
  }

  if (assetType) {
    switch (assetType) {
      case 'ação':
      case 'acao':
      case 'stock':
        return item.asset?.currency === 'BRL' ? 'acoes' : 'stocks';
      case 'bdr':
      case 'brd':
        return 'acoes';
      case 'fii':
        return 'fiis';
      case 'fund':
      case 'funds':
        // Fundo legado: a aba Fundos o lista (FUNDO_TYPES_AGRUPADOS) e a pizza
        // soma em fimFia — sem a heurística antiga de FII por ticker/nome.
        return 'fimFia';
      case 'etf':
        return 'etfs';
      case 'reit':
        return 'reits';
      case 'crypto':
      case 'currency':
      case 'metal':
      case 'commodity':
        return 'moedasCriptos';
      case 'bond':
      case 'cash':
        return 'rendaFixaFundos';
      case 'insurance':
      case 'previdencia':
        return 'previdenciaSeguros';
      case 'opcao':
        return 'opcoes';
      default:
        if (symbol.toUpperCase().endsWith('11')) return 'fiis';
        return 'rendaFixaFundos';
    }
  }

  const tickerUpper = symbol.toUpperCase();
  if (tickerUpper.endsWith('11')) return 'fiis';
  return 'acoes';
};
