/**
 * "Preço médio não informado pelo banco" (Open Finance, nov/2026).
 *
 * Para ação/FII/ETF o banco manda só quantidade e cotação atual — sem custo nem data da compra.
 * O importador grava a compra com a cotação e a data da conexão e marca a StockTransaction com
 * `notes.operation.precoMedioNaoInformado = true`. A Carteira mostra o aviso na linha até o
 * cliente corrigir o preço da compra (a edição do preço/total tira o marcador).
 *
 * Sem dependência de servidor: usado pela rota, pelo importador, pelo script e pela tela.
 */
import { lerNotesTransacao } from '@/lib/ativoEmDolar';

export const CAMPO_PRECO_MEDIO_NAO_INFORMADO = 'precoMedioNaoInformado';

/**
 * Trecho literal do marcador no JSON gravado (JSON.stringify sem espaços) — filtro barato no
 * banco (`notes contains`); o resultado é confirmado com `temPrecoMedioNaoInformado`.
 */
export const TRECHO_MARCADOR_PRECO_MEDIO = `"${CAMPO_PRECO_MEDIO_NAO_INFORMADO}":true`;

/** Origem gravada em `notes.operation.origem` pelas compras do importador Open Finance. */
export const ORIGEM_OPEN_FINANCE = 'open-finance';

/** Notes da compra importada sem custo informado (texto da importação em `observacoes`). */
export function notesCompraSemPrecoMedio(observacoes: string): string {
  return JSON.stringify({
    observacoes,
    operation: {
      action: 'compra',
      origem: ORIGEM_OPEN_FINANCE,
      [CAMPO_PRECO_MEDIO_NAO_INFORMADO]: true,
    },
  });
}

/** A transação está marcada como "preço médio não informado pelo banco"? */
export function temPrecoMedioNaoInformado(notes: unknown): boolean {
  const operation = lerNotesTransacao(notes)?.operation;
  return (
    !!operation &&
    typeof operation === 'object' &&
    (operation as Record<string, unknown>)[CAMPO_PRECO_MEDIO_NAO_INFORMADO] === true
  );
}

/**
 * Notes sem o marcador (o resto fica). Sem marcador, devolve o mesmo texto.
 */
export function semMarcadorPrecoMedio(notes: string | null): string | null {
  if (!temPrecoMedioNaoInformado(notes)) return notes;
  const obj = lerNotesTransacao(notes)!;
  const operation = { ...(obj.operation as Record<string, unknown>) };
  delete operation[CAMPO_PRECO_MEDIO_NAO_INFORMADO];
  return JSON.stringify({ ...obj, operation });
}

/**
 * Notes antigas (texto solto da importação, ou `{ raw }` depois de trocar a instituição) com o
 * marcador. Usado pelo script que marca as posições já importadas. Já marcada: igual.
 */
export function comMarcadorPrecoMedio(notes: string | null, observacoes: string): string {
  if (temPrecoMedioNaoInformado(notes)) return notes as string;
  const obj = lerNotesTransacao(notes);
  if (!obj) return notesCompraSemPrecoMedio(notes?.trim() ? notes : observacoes);
  const operation =
    obj.operation && typeof obj.operation === 'object'
      ? (obj.operation as Record<string, unknown>)
      : {};
  const base: Record<string, unknown> = { ...obj };
  if (typeof base.raw === 'string' && base.observacoes === undefined) {
    base.observacoes = base.raw;
    delete base.raw;
  }
  return JSON.stringify({
    ...base,
    operation: {
      action: 'compra',
      ...operation,
      origem: ORIGEM_OPEN_FINANCE,
      [CAMPO_PRECO_MEDIO_NAO_INFORMADO]: true,
    },
  });
}
