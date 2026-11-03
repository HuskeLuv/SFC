import { useContext, useMemo } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export interface PosicaoSemPrecoMedio {
  portfolioId: string;
  ticker: string;
  nome: string;
  tipo: string;
}

/**
 * Posições cuja compra veio do banco (Open Finance) sem o custo. Uma consulta por tela (React
 * Query); a chave fica sob `carteira`, então invalidatePortfolioDerivedQueries a refaz depois de
 * editar a compra. Erro = lista vazia (o aviso é só um lembrete).
 *
 * Fora de um QueryClientProvider (tabelas renderizadas soltas em testes) não consulta nada: o
 * aviso é acessório e não pode derrubar a tabela.
 */
const clienteInerte = new QueryClient();

export function usePrecoMedioPendente() {
  const client = useContext(QueryClientContext);
  const query = useQuery<PosicaoSemPrecoMedio[]>(
    {
      enabled: !!client,
      queryKey: queryKeys.carteira.precoMedioPendente(),
      staleTime: 60_000,
      queryFn: async ({ signal }) => {
        const res = await fetch('/api/carteira/preco-medio-pendente', {
          credentials: 'include',
          signal,
        });
        if (!res.ok) return [];
        const body = (await res.json()) as { posicoes?: PosicaoSemPrecoMedio[] };
        return body.posicoes ?? [];
      },
    },
    client ?? clienteInerte,
  );
  const posicoes = useMemo(() => query.data ?? [], [query.data]);
  const porPortfolio = useMemo(() => new Set(posicoes.map((p) => p.portfolioId)), [posicoes]);
  return { posicoes, porPortfolio };
}

/** Link para corrigir a compra (preço e data) na edição do ativo. */
export const linkCorrigirPrecoMedio = (portfolioId: string) =>
  `/ativos/${portfolioId}/editar#movimentacao-inicial`;
