import { formatCurrency } from '@/utils/formatters';

/**
 * Threshold padrão (20%) para alertar quando a cotação digitada no Step4
 * divergir do fechamento de referência. Pega o erro mais comum de UX —
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
 * O wizard guarda o ativo selecionado como label "SYMBOL - Nome" (ex.:
 * "PETR4 - Petrobras"), mas o /api/ativos/price-at compara contra o symbol
 * cru (PETR4). Extrai o código antes do " - ". Idempotente: um symbol já
 * limpo (sem " - ") passa intacto.
 */
export const cleanAssetSymbol = (symbol: string): string => symbol.split(' - ')[0].trim();

/** Formata YYYY-MM-DD em DD/MM/YYYY pra mensagem. */
export const formatDateBR = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

/**
 * Calcula o aviso quando `enteredPrice` divergir do `referencePrice` mais
 * que `threshold` (default 20%). Retorna `null` quando não há aviso a
 * emitir — ou seja, quando o campo ainda não foi preenchido, quando o
 * ativo não tem cotação, ou quando a divergência está dentro do limite.
 *
 * Quando `referenceDate` (YYYY-MM-DD) é informado, a mensagem cita o
 * fechamento daquela data — D.3 do checklist mai/28 (#3): compras antigas
 * comparam contra o fechamento DO DIA DA COMPRA em vez do preço atual,
 * que pode ter divergido naturalmente. Sem referenceDate, mantém a frase
 * antiga ("fechamento atual").
 *
 * NÃO bloqueia avançar — é só warning visual.
 */
export function computePriceDeviationWarning(
  enteredPrice: number | null | undefined,
  referencePrice: number | null | undefined,
  threshold: number = DEFAULT_PRICE_DEVIATION_THRESHOLD,
  referenceDate?: string | null,
): PriceDeviationWarning | null {
  if (
    enteredPrice == null ||
    referencePrice == null ||
    !Number.isFinite(enteredPrice) ||
    !Number.isFinite(referencePrice) ||
    enteredPrice <= 0 ||
    referencePrice <= 0
  ) {
    return null;
  }

  const diff = enteredPrice - referencePrice;
  const ratio = Math.abs(diff) / referencePrice;
  if (ratio <= threshold) {
    return null;
  }

  const direction: 'acima' | 'abaixo' = diff > 0 ? 'acima' : 'abaixo';
  const pct = (ratio * 100).toFixed(1).replace('.', ',');
  const formattedClose = formatCurrency(referencePrice);
  const dateLabel = referenceDate ? `em ${formatDateBR(referenceDate)}` : 'atual';
  return {
    message: `Preço informado está ${pct}% ${direction} do fechamento ${dateLabel} (R$ ${formattedClose}). Confira a casa decimal.`,
    ratio,
    direction,
  };
}
