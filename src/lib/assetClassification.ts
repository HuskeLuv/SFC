/**
 * Classificação de ativos por modelo de posição.
 *
 * **Share-based** (cotas/ações negociadas): a posição é `quantidade × preço`,
 * pode ter eventos corporativos, e cresce via **Comprar** (operacao) / diminui via
 * **Vender** (resgate por quantidade) — NÃO via aporte de valor. Aportar valor numa
 * posição share-based contaria como cota e corromperia o recálculo.
 *
 * **Value-based** (renda-fixa, Tesouro, reservas): a posição é um montante; cresce
 * via **Aporte** e diminui via **Resgate por valor**.
 *
 * Fundos (`fim-fia`/`fund`/`fip`/...) ainda NÃO estão aqui — hoje são value-based;
 * migram para share-based na Fase 2 (fundos como ações). Quando isso acontecer,
 * adicionar os tipos de fundo a este set.
 */
export const EQUITY_ASSET_TYPES = new Set(['stock', 'fii', 'etf', 'reit', 'bdr']);

/** True para ativos share-based (ação/FII/ETF/REIT/BDR). */
export const isEquityAssetType = (type?: string | null): boolean =>
  !!type && EQUITY_ASSET_TYPES.has(type);
