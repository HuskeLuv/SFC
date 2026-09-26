/**
 * Número digitado pelo usuário ↔ texto do campo (PWA fase 1: MobileEditSheet, AlocacaoMetaSheet).
 *
 * `parseDecimalInput` segue o que as células editáveis da carteira já fazem (EditableValorCell e o
 * input type=number), para o celular salvar o MESMO valor que o desktop:
 * - pt-BR: com vírgula, os pontos são milhar e a vírgula é o decimal ('1.234,56' → 1234.56). SEM
 *   vírgula, pontos em grupos de 3 dígitos são milhar ('1.234' → 1234, '15.000' → 15000 — o campo
 *   de moeda abre como '1.234,50' e o usuário pode apagar só os centavos); qualquer outro ponto é
 *   decimal ('3.5' → 3.5, '0.14499999' → 0.14499999), como o `parseCurrencyInput`;
 * - en-US: as vírgulas são milhar e o ponto é o decimal ('1,234.56' → 1234.56).
 * Aceita sinal '-' ou '−' (U+2212), ignora prefixo/sufixo ('R$', '%', espaços) e devolve `null`
 * para vazio ou não numérico.
 */
export type DecimalLocale = 'pt-BR' | 'en-US';

export function parseDecimalInput(str: string, locale: DecimalLocale = 'pt-BR'): number | null {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim().replace(/−/g, '-');
  const negative = /^[^\d]*-/.test(trimmed);
  const cleaned = trimmed.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;

  let normalized: string;
  if (locale === 'en-US') {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
        ? cleaned.replace(/\./g, '')
        : cleaned;
  }
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num)) return null;
  return negative ? -num : num;
}

/** Texto para o campo: '1234.5' → '1.234,50' (pt-BR) / '1,234.50' (en-US). `null` → ''. */
export function formatDecimalInput(
  n: number | null | undefined,
  locale: DecimalLocale = 'pt-BR',
  digits = 2,
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
