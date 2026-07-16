/**
 * Valoração e categorização unificadas de itens do Portfolio.
 *
 * Antes deste serviço, a mesma cascata de "quanto vale este item hoje" existia
 * reescrita (com prioridades DIFERENTES) em ~12 lugares: os dois loops de
 * /api/carteira/resumo, cada rota de aba (etf, acoes, fii, renda-fixa,
 * reservas, ...) e a tabela de alocação. Resultado: o mesmo ativo valia um
 * número na aba e outro na pizza do dashboard.
 *
 * Toda tela que precise do valor atual ou da categoria de um item deve passar
 * por `valuatePortfolioItem`/`categorizarAsset` — não reimplementar.
 */
import { FUNDO_TYPES_AGRUPADOS } from '@/lib/fundoTypes';
import type { FixedIncomeAssetWithAsset } from './patrimonioHistoricoBuilder';

export type CategoriaCarteira =
  | 'reservaEmergencia'
  | 'reservaOportunidade'
  | 'rendaFixaFundos'
  | 'fimFia'
  | 'fiis'
  | 'acoes'
  | 'stocks'
  | 'reits'
  | 'etfs'
  | 'moedasCriptos'
  | 'previdenciaSeguros'
  | 'opcoes'
  | 'imoveisBens';

/** Tipos cujo preço já vem em BRL da getAssetPrices (não aplicar USD→BRL). */
const TIPOS_PRECO_EM_BRL: readonly string[] = ['crypto', 'currency', 'metal', 'commodity'];

/** Ticker no padrão B3: 4 letras + dígito (PETR4, HGLG11, BOVA11...). */
const B3_TICKER_REGEX = /^[A-Z][A-Z0-9]{3}[0-9]$/;

export type AssetLike = {
  symbol: string;
  type?: string | null;
  currency?: string | null;
  name?: string | null;
  /** Prisma Decimal ou number — PU do Tesouro Direto do catálogo. */
  currentPrice?: { toNumber(): number } | number | null;
};

export type PortfolioItemLike = {
  assetId?: string | null;
  quantity: number;
  avgPrice: number;
  totalInvested: number;
};

export type ItemValuationInput = {
  item: PortfolioItemLike;
  asset: AssetLike | null;
  /** FixedIncomeAsset do par (userId, assetId), quando existir. */
  fixedIncome?: FixedIncomeAssetWithAsset | null;
  /** Cotação live (getAssetPrices) na moeda nativa do asset. */
  quote?: number | null;
  /** USD→BRL para converter cotações de assets currency='USD'. */
  cotacaoDolar?: number | null;
  /** Tesouro do catálogo destinado a reserva (transaction.notes.tesouroDestino). */
  tesouroReservaDestino?: 'emergencia' | 'oportunidade';
  /** fiPricer.getCurrentValue — marcação na curva CDI/IPCA/Tesouro. */
  fiGetCurrentValue?: (fi: FixedIncomeAssetWithAsset) => number;
};

export type ItemValuation = {
  /** Valor atual do item em BRL — o número que TODA tela deve exibir. */
  valorAtualBRL: number;
  /** Valor aplicado em BRL (totalInvested, fallback qty*avgPrice). */
  valorAplicadoBRL: number;
  categoria: CategoriaCarteira;
  /**
   * false para imóveis/bens/personalizados: ficam fora de saldoBruto E de
   * valorAplicado dos cards (simetria — era a fonte da rentabilidade -94%).
   */
  contaNoSaldoBruto: boolean;
  fonte: 'tesouro-pu' | 'fixed-income' | 'reserva' | 'quote' | 'manual' | 'fallback';
};

const toNumber = (v: { toNumber(): number } | number | null | undefined): number | null => {
  if (v == null) return null;
  return typeof v === 'number' ? v : v.toNumber();
};

const isReservaItem = (input: ItemValuationInput): boolean => {
  const type = input.asset?.type;
  const symbol = input.asset?.symbol;
  return (
    type === 'emergency' ||
    type === 'opportunity' ||
    Boolean(symbol?.startsWith('RESERVA-EMERG')) ||
    Boolean(symbol?.startsWith('RESERVA-OPORT')) ||
    input.tesouroReservaDestino !== undefined
  );
};

const isImovelBemItem = (asset: AssetLike | null): boolean =>
  asset?.type === 'imovel' ||
  asset?.type === 'personalizado' ||
  asset?.type === 'custom' ||
  Boolean(asset?.symbol?.startsWith('PERSONALIZADO'));

/**
 * Valor atual de um item com FixedIncomeAsset. Prioridade única (a mesma da
 * aba Renda Fixa, agora canônica para o resumo e reservas também):
 *   1. PU oficial do Tesouro (Asset.currentPrice mantido pelo bridge) × qty
 *   2. Marcação na curva — para Tesouro via FI (tesouroBondType) basta > 0
 *      (PU pode cair abaixo do par em alta de juros); para emissão bancária
 *      exige > investedAmount (curva de juros nunca decresce; abaixo do
 *      investido = série de taxas indisponível)
 *   3. Edição manual (avgPrice × qty)
 *   4. Fallback: o valor calculado (mesmo que igual ao investido)
 */
export const getFixedIncomeCurrentValue = (
  fixedIncome: FixedIncomeAssetWithAsset,
  item: PortfolioItemLike,
  asset: AssetLike | null,
  fiGetCurrentValue: (fi: FixedIncomeAssetWithAsset) => number,
): { valor: number; fonte: ItemValuation['fonte'] } => {
  const tesouroPU = asset?.type === 'tesouro-direto' ? toNumber(asset.currentPrice) : null;
  if (tesouroPU != null && tesouroPU > 0 && item.quantity > 0) {
    return { valor: tesouroPU * item.quantity, fonte: 'tesouro-pu' };
  }

  const valorCalculado = fiGetCurrentValue(fixedIncome);
  const hasIndexerOrRate =
    fixedIncome.indexer === 'CDI' || fixedIncome.indexer === 'IPCA' || fixedIncome.annualRate > 0;
  const isFiTesouro = Boolean(fixedIncome.tesouroBondType);
  const curveOk =
    hasIndexerOrRate &&
    (isFiTesouro ? valorCalculado > 0 : valorCalculado > fixedIncome.investedAmount);
  if (curveOk) return { valor: valorCalculado, fonte: 'fixed-income' };

  if (item.avgPrice > 0 && item.quantity > 0) {
    return { valor: item.avgPrice * item.quantity, fonte: 'manual' };
  }
  return { valor: valorCalculado, fonte: 'fixed-income' };
};

/**
 * Categoria da distribuição/alocação para um asset. Tabela ÚNICA — os filtros
 * das rotas de aba devem espelhar exatamente estas categorias (ver
 * CATEGORIA_ASSET_TYPE_FILTERS).
 */
export const categorizarAsset = (
  asset: AssetLike | null,
  ctx: { isReserva?: boolean; tesouroReservaDestino?: 'emergencia' | 'oportunidade' } = {},
): CategoriaCarteira => {
  const symbol = asset?.symbol ?? '';
  const symbolUpper = symbol.toUpperCase();
  const tipo = asset?.type?.toLowerCase() ?? '';

  if (ctx.isReserva) {
    if (ctx.tesouroReservaDestino === 'emergencia') return 'reservaEmergencia';
    if (ctx.tesouroReservaDestino === 'oportunidade') return 'reservaOportunidade';
    if (tipo === 'emergency' || symbol.startsWith('RESERVA-EMERG')) return 'reservaEmergencia';
    return 'reservaOportunidade';
  }

  const isB3StockTicker = B3_TICKER_REGEX.test(symbolUpper);

  switch (tipo) {
    case 'ação':
    case 'acao':
    case 'stock':
      if (asset?.currency !== 'BRL' && asset?.currency != null) return 'stocks';
      // Ação BRL fora do padrão B3: renda fixa (conservador, evita fantasmas)
      return isB3StockTicker ? 'acoes' : 'rendaFixaFundos';
    case 'bdr':
    case 'brd':
      // BDR aparece na aba Ações — a pizza precisa somar na MESMA categoria.
      return 'acoes';
    case 'fii':
      return 'fiis';
    case 'etf':
    case 'etf-cvm':
      return 'etfs';
    case 'reit':
      return 'reits';
    case 'crypto':
    case 'currency':
    case 'metal':
    case 'commodity':
      return 'moedasCriptos';
    case 'bond':
    case 'tesouro-direto':
      return 'rendaFixaFundos';
    case 'previdencia':
    case 'insurance':
      return 'previdenciaSeguros';
    case 'cash':
      return 'reservaOportunidade';
    case 'emergency':
      return 'reservaEmergencia';
    case 'opportunity':
      return 'reservaOportunidade';
    case 'imovel':
    case 'personalizado':
    case 'custom':
      return 'imoveisBens';
    case 'opcao':
      return 'opcoes';
    default:
      if ((FUNDO_TYPES_AGRUPADOS as readonly string[]).includes(tipo)) {
        // fia/multimercado/fund-rf/fund-cambial/fip/fip-infra/fidc/fiagro —
        // aparecem na aba Fundos, então a pizza soma em fimFia.
        // 'fund'/'funds' legados: heurística FII preservada.
        if (tipo === 'fund' || tipo === 'funds') {
          const nameLower = (asset?.name ?? '').toLowerCase();
          if (
            symbolUpper.endsWith('11') ||
            nameLower.includes('fii') ||
            nameLower.includes('imobili')
          ) {
            return 'fiis';
          }
        }
        return 'fimFia';
      }
      if (symbol.startsWith('RESERVA-OPORT')) return 'reservaOportunidade';
      if (symbol.startsWith('RESERVA-EMERG')) return 'reservaEmergencia';
      if (symbolUpper.endsWith('11')) return 'fiis';
      return 'rendaFixaFundos';
  }
};

/**
 * Filtros de Asset.type por categoria — fonte única para os `where` das rotas
 * de aba. Uma aba que filtre por estes types exibe exatamente o que a pizza
 * soma na categoria correspondente (deriva de filtro = valor fantasma).
 */
export const CATEGORIA_ASSET_TYPE_FILTERS: Record<CategoriaCarteira, readonly string[]> = {
  reservaEmergencia: ['emergency'],
  reservaOportunidade: ['opportunity', 'cash'],
  rendaFixaFundos: ['bond', 'tesouro-direto'],
  fimFia: [...FUNDO_TYPES_AGRUPADOS],
  fiis: ['fii'],
  acoes: ['stock', 'bdr', 'brd'],
  stocks: ['stock'],
  reits: ['reit'],
  etfs: ['etf', 'etf-cvm'],
  moedasCriptos: ['crypto', 'currency', 'metal', 'commodity'],
  previdenciaSeguros: ['previdencia', 'insurance'],
  opcoes: ['opcao'],
  imoveisBens: ['imovel', 'personalizado'],
};

/**
 * Valoração canônica de um item do Portfolio, em BRL. Ordem:
 *   1. FixedIncomeAsset → getFixedIncomeCurrentValue (PU Tesouro → curva →
 *      edição manual → calculado)
 *   2. Reserva → edição manual (avgPrice×qty) → totalInvested → qty×avgPrice
 *   3. Imóvel/personalizado → totalInvested → qty×avgPrice (fora do saldo)
 *   4. Cotação live → qty×quote (+USD→BRL, exceto tipos já em BRL)
 *   5. Fallback sem cotação → qty×avgPrice (avgPrice é gravado em BRL pela
 *      /api/carteira/operacao — NÃO converter, senão dupla conversão)
 */
export const valuatePortfolioItem = (input: ItemValuationInput): ItemValuation => {
  const { item, asset, fixedIncome, quote, cotacaoDolar, fiGetCurrentValue } = input;
  const isReserva = isReservaItem(input);
  const isImovelBem = isImovelBemItem(asset);
  const categoria = categorizarAsset(asset, {
    isReserva,
    tesouroReservaDestino: input.tesouroReservaDestino,
  });
  const valorAplicadoBRL =
    item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;

  const base = { categoria, valorAplicadoBRL, contaNoSaldoBruto: !isImovelBem };

  if (fixedIncome && fiGetCurrentValue) {
    const { valor, fonte } = getFixedIncomeCurrentValue(
      fixedIncome,
      item,
      asset,
      fiGetCurrentValue,
    );
    return { ...base, valorAtualBRL: valor, fonte };
  }

  if (isReserva) {
    const valor =
      item.avgPrice > 0 && item.quantity > 0
        ? item.avgPrice * item.quantity
        : item.totalInvested > 0
          ? item.totalInvested
          : item.quantity * item.avgPrice;
    return { ...base, valorAtualBRL: valor, fonte: 'reserva' };
  }

  if (isImovelBem) {
    const valor = item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
    return { ...base, valorAtualBRL: valor, fonte: 'manual' };
  }

  if (quote != null && quote > 0) {
    let valor = item.quantity * quote;
    const jaEmBRL = TIPOS_PRECO_EM_BRL.includes(asset?.type ?? '');
    if (!jaEmBRL && asset?.currency === 'USD' && cotacaoDolar != null && cotacaoDolar > 0) {
      valor *= cotacaoDolar;
    }
    return { ...base, valorAtualBRL: valor, fonte: 'quote' };
  }

  return { ...base, valorAtualBRL: item.quantity * item.avgPrice, fonte: 'fallback' };
};
