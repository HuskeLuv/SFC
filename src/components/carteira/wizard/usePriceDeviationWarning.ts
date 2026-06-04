'use client';
import { useQuery } from '@tanstack/react-query';
import {
  cleanAssetSymbol,
  computePriceDeviationWarning,
  DEFAULT_PRICE_DEVIATION_THRESHOLD,
  type PriceDeviationWarning,
} from './priceDeviationWarning';

interface PriceAtResponse {
  symbol: string;
  date: string;
  effectiveDate: string;
  price: number;
  source: string;
}

export interface UsePriceDeviationParams {
  /** Preço digitado pelo usuário (cotacaoUnitaria/cotacaoCompra). */
  enteredPrice: number | null | undefined;
  /** Cotação atual (Asset.currentPrice) — fallback quando não há histórico. */
  currentPrice: number | null | undefined;
  /** Override do threshold (default 0.2 = 20%; use 0.5 pra cripto). */
  threshold?: number;
  /** Symbol do ativo (PETR4...). Junto com referenceDate ativa o modo histórico. */
  symbol?: string | null;
  /** Data da compra (YYYY-MM-DD) — referência para buscar o fechamento. */
  referenceDate?: string | null;
}

export interface PriceDeviationResult {
  /** Aviso calculado, ou null quando não há divergência relevante. */
  warning: PriceDeviationWarning | null;
  /** Preço de referência usado na comparação (fechamento do dia ou atual). */
  referencePrice: number | null | undefined;
  /** Data efetiva do fechamento usado como referência (YYYY-MM-DD). */
  effectiveDate: string | null | undefined;
  /** True enquanto o fechamento histórico ainda está sendo buscado. */
  isLoading: boolean;
}

/**
 * Centraliza o cálculo do aviso de divergência de preço usado tanto pelo
 * hint inline (PriceDeviationHint) quanto pelo popup de confirmação do
 * wizard (PriceDeviationConfirmModal via AddAssetWizard).
 *
 * Quando `symbol` + `referenceDate` estão presentes, busca o fechamento do
 * dia da compra via /api/ativos/price-at (cache 10min) e compara contra ele.
 * Sem isso, cai para `currentPrice`. Enquanto o histórico carrega, não emite
 * aviso (evita flash com referência errada).
 */
export function usePriceDeviationWarning({
  enteredPrice,
  currentPrice,
  threshold = DEFAULT_PRICE_DEVIATION_THRESHOLD,
  symbol,
  referenceDate,
}: UsePriceDeviationParams): PriceDeviationResult {
  // O ativo selecionado vem como label "SYMBOL - Nome"; o price-at compara
  // contra o symbol cru. cleanAssetSymbol normaliza (idempotente).
  const cleanSymbol = symbol ? cleanAssetSymbol(symbol) : symbol;
  const isHistoricMode = Boolean(cleanSymbol && referenceDate);

  const historicQuery = useQuery<PriceAtResponse | null, Error>({
    queryKey: ['ativos', 'price-at', cleanSymbol, referenceDate],
    enabled: isHistoricMode,
    staleTime: 10 * 60 * 1000, // 10min
    retry: 0,
    queryFn: async () => {
      const url = `/api/ativos/price-at?symbol=${encodeURIComponent(cleanSymbol!)}&date=${encodeURIComponent(referenceDate!)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Erro ao buscar preço (${res.status})`);
      return (await res.json()) as PriceAtResponse;
    },
  });

  let referencePrice: number | null | undefined;
  let warningDate: string | null | undefined;
  if (isHistoricMode) {
    if (historicQuery.isLoading) {
      return {
        warning: null,
        referencePrice: undefined,
        effectiveDate: undefined,
        isLoading: true,
      };
    }
    if (historicQuery.data) {
      referencePrice = historicQuery.data.price;
      warningDate = historicQuery.data.effectiveDate;
    } else {
      // 404 ou erro → cai pro currentPrice
      referencePrice = currentPrice;
    }
  } else {
    referencePrice = currentPrice;
  }

  const warning = computePriceDeviationWarning(
    enteredPrice,
    referencePrice,
    threshold,
    warningDate,
  );
  return { warning, referencePrice, effectiveDate: warningDate, isLoading: false };
}
