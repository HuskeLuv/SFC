import { formatCurrency } from '@/utils/formatters';

/**
 * Threshold padrão (20%) para alertar quando a cotação digitada no Step4
 * divergir do fechamento atual do ativo. Pega o erro mais comum de UX —
 * digitar R$ 2,80 quando o real era R$ 28,00 (deslocamento de uma casa
 * decimal gera diferença de ~90%, bem acima do threshold).
 */
export const DEFAULT_PRICE_DEVIATION_THRESHOLD = 0.2;

/**
 * Cripto tem volatilidade naturalmente alta — alertar a cada 20% gera
 * falsos positivos demais (BTC pode subir/cair 10% em um dia). Usa
 * threshold mais frouxo (50%) só pra continuar pegando erros grosseiros
 * de casa decimal.
 */
export const CRYPTO_PRICE_DEVIATION_THRESHOLD = 0.5;

export interface PriceDeviationWarning {
  /** Mensagem amigável (PT-BR) pronta pra renderizar abaixo do campo. */
  message: string;
  /** Razão (ex.: 0.32 = 32% de divergência), absoluta. */
  ratio: number;
  /** Se o preço informado está acima ou abaixo do fechamento. */
  direction: 'acima' | 'abaixo';
}

/**
 * Calcula o aviso quando `enteredPrice` divergir do `currentPrice` mais
 * que `threshold` (default 20%). Retorna `null` quando não há aviso a
 * emitir — ou seja, quando o campo ainda não foi preenchido, quando o
 * ativo não tem cotação, ou quando a divergência está dentro do limite.
 *
 * NÃO bloqueia avançar — é só warning visual.
 */
export function computePriceDeviationWarning(
  enteredPrice: number | null | undefined,
  currentPrice: number | null | undefined,
  threshold: number = DEFAULT_PRICE_DEVIATION_THRESHOLD,
): PriceDeviationWarning | null {
  if (
    enteredPrice == null ||
    currentPrice == null ||
    !Number.isFinite(enteredPrice) ||
    !Number.isFinite(currentPrice) ||
    enteredPrice <= 0 ||
    currentPrice <= 0
  ) {
    return null;
  }

  const diff = enteredPrice - currentPrice;
  const ratio = Math.abs(diff) / currentPrice;
  if (ratio <= threshold) {
    return null;
  }

  const direction: 'acima' | 'abaixo' = diff > 0 ? 'acima' : 'abaixo';
  const pct = (ratio * 100).toFixed(1).replace('.', ',');
  const formattedClose = formatCurrency(currentPrice);
  return {
    message: `Preço informado está ${pct}% ${direction} do fechamento atual (R$ ${formattedClose}). Confira a casa decimal.`,
    ratio,
    direction,
  };
}
