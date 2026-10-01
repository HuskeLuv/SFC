'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { MoverOpcoesResponse, TipoItemMover } from '@/lib/carteiraMover';

/** Opções frescas por 30s: o arrasto (Fatia E) faz prefetch no onDragStart. */
export const MOVER_OPCOES_STALE_MS = 30_000;

export async function fetchMoverOpcoes(
  tipo: TipoItemMover,
  id: string,
  signal?: AbortSignal,
): Promise<MoverOpcoesResponse> {
  const params = new URLSearchParams({ tipo, id });
  const response = await fetch(`/api/carteira/mover?${params.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Não foi possível carregar as opções',
    );
  }
  return response.json();
}

export const moverOpcoesQueryOptions = (tipo: TipoItemMover, id: string) => ({
  queryKey: queryKeys.carteiraMover.opcoes(tipo, id),
  queryFn: ({ signal }: { signal?: AbortSignal }) => fetchMoverOpcoes(tipo, id, signal),
  staleTime: MOVER_OPCOES_STALE_MS,
});

/** Prefetch das opções (início do arrasto, hover no menu ⋯). */
export function prefetchMoverOpcoes(queryClient: QueryClient, tipo: TipoItemMover, id: string) {
  return queryClient.prefetchQuery(moverOpcoesQueryOptions(tipo, id));
}

/**
 * GET /api/carteira/mover?tipo=&id= — onde o item está, para onde pode ir
 * (com motivo das abas recusadas), seções por aba e o "movido"/original.
 */
export function useMoverOpcoes(
  tipo: TipoItemMover,
  id: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery<MoverOpcoesResponse>({
    ...moverOpcoesQueryOptions(tipo, id ?? ''),
    enabled: !!id && (options.enabled ?? true),
    retry: false,
  });
}

export default useMoverOpcoes;
