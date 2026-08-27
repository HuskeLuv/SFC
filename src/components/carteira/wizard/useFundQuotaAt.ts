'use client';
import { useQuery } from '@tanstack/react-query';
import { cleanAssetSymbol } from './priceDeviationWarning';

export interface FundQuotaAt {
  /** Cota oficial (CVM) na data pedida — ou a última anterior, até 30 dias. */
  price: number;
  /** Data efetiva da cota usada (YYYY-MM-DD). */
  effectiveDate: string;
}

export interface UseFundQuotaAtResult {
  quota: FundQuotaAt | null;
  /** True enquanto busca (inclui o download sob demanda do INF_DIARIO). */
  isLoading: boolean;
  /** True quando a busca terminou sem cota (404) ou com erro. */
  notFound: boolean;
}

/**
 * Cota do fundo CVM no dia da compra, via /api/ativos/price-at (que, para
 * symbol `CVM-<cnpj>`, lê CvmFundQuota e baixa o mês sob demanda se preciso).
 *
 * Mesma queryKey do usePriceDeviationWarning pra compartilhar cache.
 */
export function useFundQuotaAt(
  symbol: string | null | undefined,
  referenceDate: string | null | undefined,
): UseFundQuotaAtResult {
  const cleanSymbol = symbol ? cleanAssetSymbol(symbol) : null;
  const enabled = Boolean(cleanSymbol && cleanSymbol.startsWith('CVM-') && referenceDate);

  const query = useQuery<FundQuotaAt | null, Error>({
    queryKey: ['ativos', 'price-at', cleanSymbol, referenceDate],
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const url = `/api/ativos/price-at?symbol=${encodeURIComponent(cleanSymbol!)}&date=${encodeURIComponent(referenceDate!)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Erro ao buscar cota (${res.status})`);
      const data = (await res.json()) as { price: number; effectiveDate: string };
      return { price: data.price, effectiveDate: data.effectiveDate };
    },
  });

  if (!enabled) return { quota: null, isLoading: false, notFound: false };
  return {
    quota: query.data ?? null,
    isLoading: query.isLoading,
    notFound: !query.isLoading && (query.isError || query.data === null),
  };
}
