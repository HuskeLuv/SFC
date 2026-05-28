'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  computePriceDeviationWarning,
  DEFAULT_PRICE_DEVIATION_THRESHOLD,
} from './priceDeviationWarning';

interface PriceDeviationHintProps {
  /** Preço digitado pelo usuário no campo cotacaoUnitaria/cotacaoCompra. */
  enteredPrice: number | null | undefined;
  /** Cotação atual (Asset.currentPrice) do ativo selecionado. Usado como
   * fallback quando referenceDate/symbol não estão definidos OU quando o
   * fetch histórico falha. */
  currentPrice: number | null | undefined;
  /** Override do threshold (default 0.2 = 20%). Use 0.5 pra cripto. */
  threshold?: number;
  /** Symbol do ativo (PETR4, etc.). Se informado junto com referenceDate,
   * o hint busca o fechamento do dia da compra em vez de usar currentPrice. */
  symbol?: string | null;
  /** Data da compra (YYYY-MM-DD). Quando presente, ativa a comparação
   * histórica via /api/ativos/price-at. */
  referenceDate?: string | null;
}

interface PriceAtResponse {
  symbol: string;
  date: string;
  effectiveDate: string;
  price: number;
  source: string;
}

/**
 * Aviso visual abaixo do campo de cotação quando o preço digitado divirja
 * mais que o threshold do fechamento de referência. NÃO bloqueia avançar
 * — é só dica pra pegar erro de digitação de casa decimal (F1.7 + D.3 do
 * checklist mai/28).
 *
 * Quando o caller passa symbol + referenceDate, busca o fechamento do dia
 * da compra via /api/ativos/price-at (cache 10min React Query) e compara
 * contra ele em vez do preço atual. Resolve o cenário onde aporte antigo
 * (ex.: PETR4 em 2022) emitia warning indevido contra a cotação de hoje.
 */
export default function PriceDeviationHint({
  enteredPrice,
  currentPrice,
  threshold = DEFAULT_PRICE_DEVIATION_THRESHOLD,
  symbol,
  referenceDate,
}: PriceDeviationHintProps) {
  const isHistoricMode = Boolean(symbol && referenceDate);

  const historicQuery = useQuery<PriceAtResponse | null, Error>({
    queryKey: ['ativos', 'price-at', symbol, referenceDate],
    enabled: isHistoricMode,
    staleTime: 10 * 60 * 1000, // 10min
    retry: 0,
    queryFn: async () => {
      const url = `/api/ativos/price-at?symbol=${encodeURIComponent(symbol!)}&date=${encodeURIComponent(referenceDate!)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Erro ao buscar preço (${res.status})`);
      return (await res.json()) as PriceAtResponse;
    },
  });

  // Prioridade: preço histórico (quando solicitado e disponível) →
  // currentPrice (fallback). Enquanto carrega, não exibe warning (evita
  // flash com referência errada).
  let referencePrice: number | null | undefined;
  let warningDate: string | null | undefined;
  if (isHistoricMode) {
    if (historicQuery.isLoading) return null;
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
  if (!warning) return null;

  return (
    <p
      role="alert"
      data-testid="price-deviation-warning"
      className="mt-1 text-sm text-amber-600 dark:text-amber-400"
    >
      {warning.message}
    </p>
  );
}
