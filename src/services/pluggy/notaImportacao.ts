/**
 * Marcador gravado em `StockTransaction.notes` (e em dívidas) pelo importador
 * do Open Finance. Fica num módulo leve para ser lido fora do importador (ex.:
 * acompanhamento da aposentadoria) sem puxar o SDK do Pluggy.
 */
export const NOTA_IMPORTACAO = 'Importado do banco (Open Finance)';

/** true quando a transação foi criada pela importação de posições do Pluggy. */
export const ehImportacaoOpenFinance = (notes: string | null | undefined): boolean =>
  !!notes && notes.startsWith(NOTA_IMPORTACAO);
