'use client';

/**
 * "Meus relatos" (GET /api/analise-ativos/meus-reportes) — bloco C, fatia D.
 *
 * - useMeusReportes({ ticker? }): useInfiniteQuery por cursor (20 por página), staleTime 0 e sem
 *   retry em 4xx. Chave ['analiseAtivos', 'meus-reportes', ticker|'todos'] — o envio do relato
 *   invalida CHAVE_MEUS_REPORTES inteira.
 * - Com `ticker`, serve ao "Você reportou" da página do ativo (só os relatos do usuário logado).
 * - `enabled` (padrão true): a página e o link do Quadro só ligam com config.reporteHabilitado.
 */
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { MeusReportesResposta } from '@/types/analiseAtivosCuradoria';

export const CHAVE_MEUS_REPORTES = [...queryKeys.analiseAtivos.all, 'meus-reportes'] as const;

export class ErroMeusReportes extends Error {
  constructor(public status: number) {
    super(`Erro ao carregar os relatos (${status})`);
  }
}

export function urlMeusReportes(ticker?: string | null, cursor?: string | null): string {
  const qs = new URLSearchParams();
  if (ticker) qs.set('ticker', ticker.toUpperCase());
  if (cursor) qs.set('cursor', cursor);
  const s = qs.toString();
  return `/api/analise-ativos/meus-reportes${s ? `?${s}` : ''}`;
}

export function useMeusReportes(opts: { ticker?: string | null; enabled?: boolean } = {}) {
  const ticker = opts.ticker ? opts.ticker.toUpperCase() : null;
  return useInfiniteQuery<
    MeusReportesResposta,
    Error,
    InfiniteData<MeusReportesResposta, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: [...CHAVE_MEUS_REPORTES, ticker ?? 'todos'],
    enabled: opts.enabled ?? true,
    staleTime: 0,
    initialPageParam: null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
    retry: (falhas, erro) =>
      !(erro instanceof ErroMeusReportes && erro.status >= 400 && erro.status < 500) && falhas < 2,
    queryFn: async ({ pageParam, signal }) => {
      const res = await fetch(urlMeusReportes(ticker, pageParam), {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new ErroMeusReportes(res.status);
      return (await res.json()) as MeusReportesResposta;
    },
  });
}
