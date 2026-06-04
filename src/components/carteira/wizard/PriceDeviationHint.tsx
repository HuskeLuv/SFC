'use client';
import React from 'react';
import { DEFAULT_PRICE_DEVIATION_THRESHOLD } from './priceDeviationWarning';
import { usePriceDeviationWarning } from './usePriceDeviationWarning';

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

/**
 * Aviso visual abaixo do campo de cotação quando o preço digitado divirja
 * mais que o threshold do fechamento de referência. NÃO bloqueia avançar
 * — é só dica pra pegar erro de digitação de casa decimal (F1.7 + D.3 do
 * checklist mai/28). A confirmação obrigatória vive no popup do wizard
 * (PriceDeviationConfirmModal); o cálculo é compartilhado via
 * usePriceDeviationWarning.
 */
export default function PriceDeviationHint({
  enteredPrice,
  currentPrice,
  threshold = DEFAULT_PRICE_DEVIATION_THRESHOLD,
  symbol,
  referenceDate,
}: PriceDeviationHintProps) {
  const { warning } = usePriceDeviationWarning({
    enteredPrice,
    currentPrice,
    threshold,
    symbol,
    referenceDate,
  });
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
