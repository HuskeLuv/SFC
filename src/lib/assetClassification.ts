import { FUNDO_TYPES_ALL } from '@/lib/fundoTypes';

/**
 * Classificação de ativos por modelo de posição.
 *
 * **Share-based** (cotas/ações negociadas): a posição é `quantidade × preço`,
 * pode ter eventos corporativos, e cresce via **Comprar** (operacao) / diminui via
 * **Vender** (resgate por quantidade) — NÃO via aporte de valor. Aportar valor numa
 * posição share-based contaria como cota e corromperia o recálculo; venda parcial
 * precisa remover o CUSTO PROPORCIONAL via recalculatePortfolioFromTransactions.
 *
 * **Value-based** (renda-fixa, Tesouro, reservas, seguro manual, imóveis): a posição
 * é um montante; cresce via **Aporte** e diminui via **Resgate por valor**.
 */
export const EQUITY_ASSET_TYPES = new Set(['stock', 'fii', 'etf', 'reit', 'bdr']);

/**
 * Fase 2 (fundos como ações) + auditoria de resgate 2026-08-06 (achado #3):
 * fundos CVM (inclui previdência CVM), cripto, moedas e opções também são
 * share-based — a venda parcial deles caía no cálculo inline value-based, que
 * subtraía a RECEITA da venda do CUSTO (2 BTC custo 200k, vende 1 por 300k →
 * totalInvested 0, avgPrice 0). 'insurance' (seguro manual) e 'bond'/'tesouro-direto'
 * ficam value-based.
 */
export const SHARE_BASED_ASSET_TYPES = new Set([
  ...EQUITY_ASSET_TYPES,
  'crypto',
  'currency',
  'opcao',
  ...FUNDO_TYPES_ALL,
]);

/** True para ativos share-based estritos de bolsa (ação/FII/ETF/REIT/BDR). */
export const isEquityAssetType = (type?: string | null): boolean =>
  !!type && EQUITY_ASSET_TYPES.has(type);

/** True para qualquer ativo de posição em cotas (equity + cripto/moeda/fundos/opções). */
export const isShareBasedAssetType = (type?: string | null): boolean =>
  !!type && SHARE_BASED_ASSET_TYPES.has(type);
