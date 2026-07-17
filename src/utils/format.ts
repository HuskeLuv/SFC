/**
 * Módulo canônico de formatação numérica pt-BR (Intl.NumberFormat).
 *
 * Regra geral: TODA formatação de número/moeda/percentual exibida na UI deve
 * sair daqui. Não crie formatters locais em hooks/componentes — as ~20 cópias
 * divergentes (ponto × vírgula, "+" vazando, "$" en-US) foram a causa da
 * família de bugs de locale mapeada na auditoria de jul/2026
 * (docs/auditoria-ui-consistencia-carteira-jul2026.md, seção P3).
 *
 * Qual usar:
 * - `formatBRL`       → valores em reais ("R$ 1.234,56").
 * - `formatUSD`       → valores em dólar no padrão pt-BR ("US$ 1.234,56").
 * - `formatPct`       → percentuais em geral (alocação, risco, taxa): SEM sinal
 *                       forçado; negativo mantém o "-".
 * - `formatPctSigned` → APENAS deltas/variações (rentabilidade, variação do
 *                       dia): força "+" no positivo e no zero.
 * - `formatNumber`    → números puros (quantidade, beta, correlação).
 *
 * Convenção de fallback: null/undefined/NaN formatam como zero na mesma
 * convenção do caminho normal (ex.: "R$ 0,00", "0,00%") — nunca misturar
 * "0,00%" no fallback com "12.34%" no caminho feliz.
 *
 * Obs.: o separador entre símbolo de moeda e valor é NBSP (U+00A0), como o
 * Intl emite — testes devem comparar com ' '.
 */

const isInvalid = (value: number | null | undefined): value is null | undefined =>
  value === null || value === undefined || Number.isNaN(value);

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatters = new Map<number, Intl.NumberFormat>();

const getNumberFormatter = (casas: number): Intl.NumberFormat => {
  let formatter = numberFormatters.get(casas);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
    numberFormatters.set(casas, formatter);
  }
  return formatter;
};

/**
 * Formata um valor em reais: `formatBRL(1234.56)` → `"R$ 1.234,56"`.
 * null/undefined/NaN → `"R$ 0,00"`.
 */
export const formatBRL = (value: number | null | undefined): string =>
  brlFormatter.format(isInvalid(value) ? 0 : value);

/**
 * Formata um valor em dólar no padrão pt-BR: `formatUSD(1234.56)` → `"US$ 1.234,56"`.
 * null/undefined/NaN → `"US$ 0,00"`.
 */
export const formatUSD = (value: number | null | undefined): string =>
  usdFormatter.format(isInvalid(value) ? 0 : value);

/**
 * Formata um número puro pt-BR: `formatNumber(1234.5)` → `"1.234,50"`.
 * `casas` controla o número FIXO de casas decimais (padrão 2).
 * null/undefined/NaN → zero na mesma convenção (`"0,00"` com casas=2).
 * Valores negativos que arredondam para zero perdem o sinal ("-0,00" → "0,00").
 */
export const formatNumber = (value: number | null | undefined, casas = 2): string => {
  const formatted = getNumberFormatter(casas).format(isInvalid(value) ? 0 : value);
  // Evita "-0,00" quando um negativo minúsculo arredonda para zero.
  return /^-0(?:,0+)?$/.test(formatted) ? formatted.slice(1) : formatted;
};

/**
 * Formata um percentual SEM sinal forçado: `formatPct(12.345)` → `"12,35%"`,
 * `formatPct(-3.2)` → `"-3,20%"`. Use para alocação, risco, taxas — qualquer
 * percentual que não seja um delta. null/undefined/NaN → `"0,00%"`.
 */
export const formatPct = (value: number | null | undefined, casas = 2): string =>
  `${formatNumber(value, casas)}%`;

/**
 * Formata um DELTA/variação percentual com sinal explícito:
 * `formatPctSigned(12.34)` → `"+12,34%"`, `formatPctSigned(-12.34)` → `"-12,34%"`,
 * `formatPctSigned(0)` → `"+0,00%"`. Use SOMENTE para variações (rentabilidade,
 * variação do dia) — nunca para alocação/risco. null/undefined/NaN → `"0,00%"`.
 */
export const formatPctSigned = (value: number | null | undefined): string => {
  if (isInvalid(value)) {
    return '0,00%';
  }
  const formatted = formatPct(value);
  return formatted.startsWith('-') ? formatted : `+${formatted}`;
};
