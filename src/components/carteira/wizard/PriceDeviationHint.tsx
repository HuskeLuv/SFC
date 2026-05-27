'use client';
import React from 'react';
import {
  computePriceDeviationWarning,
  DEFAULT_PRICE_DEVIATION_THRESHOLD,
} from './priceDeviationWarning';

interface PriceDeviationHintProps {
  /** Preço digitado pelo usuário no campo cotacaoUnitaria/cotacaoCompra. */
  enteredPrice: number | null | undefined;
  /** Cotação atual (Asset.currentPrice) do ativo selecionado. */
  currentPrice: number | null | undefined;
  /** Override do threshold (default 0.2 = 20%). Use 0.5 pra cripto. */
  threshold?: number;
}

/**
 * Aviso visual abaixo do campo de cotação quando o preço digitado divirja
 * mais que o threshold do fechamento atual. NÃO bloqueia avançar — é só
 * dica pra pegar erro de digitação de casa decimal (F1.7).
 */
export default function PriceDeviationHint({
  enteredPrice,
  currentPrice,
  threshold = DEFAULT_PRICE_DEVIATION_THRESHOLD,
}: PriceDeviationHintProps) {
  const warning = computePriceDeviationWarning(enteredPrice, currentPrice, threshold);
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
