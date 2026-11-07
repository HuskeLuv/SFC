/**
 * Marcador gravado em `StockTransaction.notes` (e em dívidas) pelo importador
 * do Open Finance. Fica num módulo leve para ser lido fora do importador (ex.:
 * acompanhamento da aposentadoria, Evolução do Patrimônio) sem puxar o SDK do Pluggy.
 */
import { lerNotesTransacao } from '@/lib/ativoEmDolar';
import { ORIGEM_OPEN_FINANCE } from '@/lib/precoMedioNaoInformado';

export const NOTA_IMPORTACAO = 'Importado do banco (Open Finance)';

/**
 * true quando a transação foi criada pela importação de posições do Pluggy. Dois formatos:
 * texto puro (`NOTA_IMPORTACAO`) e JSON das compras sem preço médio
 * (`{ observacoes: NOTA_IMPORTACAO, operation: { origem: 'open-finance', … } }`).
 */
export const ehImportacaoOpenFinance = (notes: string | null | undefined): boolean => {
  if (!notes) return false;
  if (notes.startsWith(NOTA_IMPORTACAO)) return true;
  const json = lerNotesTransacao(notes);
  if (!json) return false;
  const operation = json.operation as Record<string, unknown> | undefined;
  return (
    operation?.origem === ORIGEM_OPEN_FINANCE ||
    (typeof json.observacoes === 'string' && json.observacoes.startsWith(NOTA_IMPORTACAO))
  );
};
