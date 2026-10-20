'use client';

/**
 * Hook do card "Dados societários e estatuto" (A6, item 6; fatia D): GET
 * /api/analise-ativos/ativos/[ticker]/societario → SocietarioResposta. 30 min (o FRE muda por
 * semana), preguiçoso (`enabled`), sem retry em 4xx (404 = chave desligada, FII ou fora da área).
 * Chave em queryKeys.analiseAtivos.societario (sob 'ativo': cai junto com o ativo).
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { ErroAnalise, TEMPOS_ANALISE, retryAnalise } from '@/hooks/useAnaliseAtivos';
import { ROTAS_COMPLEMENTOS, type SocietarioResposta } from '@/types/analiseAtivosComplementos';

async function buscarSocietario(ticker: string, signal?: AbortSignal): Promise<SocietarioResposta> {
  const res = await fetch(ROTAS_COMPLEMENTOS.societario(ticker), {
    credentials: 'include',
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ErroAnalise(
      body?.error ?? `Erro ao carregar os dados societários (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as SocietarioResposta;
}

export function useSocietarioAtivo(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<SocietarioResposta, Error>({
    queryKey: queryKeys.analiseAtivos.societario(ticker),
    staleTime: TEMPOS_ANALISE.analise,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) => buscarSocietario(ticker, signal),
  });
}
