import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalida as árvores do Fluxo de Caixa (`queryKeys.cashflow.year(ano)`) de todos os anos, menos
 * `excetoAno` (o que a tela acabou de gravar com a resposta do servidor). A linha (CashflowItem) é
 * a mesma em todos os anos e é ela a subcategoria do Orçamento v2: criar, renomear ou excluir uma
 * linha, numa tela ou na outra, muda a árvore de todos os anos, não só a do ano aberto.
 */
export function invalidarArvoresDoFluxo(
  queryClient: QueryClient,
  excetoAno?: number,
): Promise<void> {
  const predicate = (q: { queryKey: readonly unknown[] }) => {
    const [raiz, ano] = q.queryKey;
    return raiz === 'cashflow' && typeof ano === 'number' && ano !== excetoAno;
  };
  // Sem outro ano em cache, nada a fazer (nem a chamada).
  if (queryClient.getQueryCache().findAll({ predicate }).length === 0) return Promise.resolve();
  return queryClient.invalidateQueries({ predicate });
}
