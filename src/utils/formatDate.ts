/**
 * Formatadores de data "wall-clock" — datas armazenadas como UTC midnight
 * (ex.: data de transação, vencimento de título). Sem `timeZone: 'UTC'`,
 * o `toLocaleDateString` do viewer (BRT, UTC-3) mostra o dia ANTERIOR
 * porque UTC 00:00 = BRT 21:00 do dia anterior.
 *
 * Use estas funções pra TODA data armazenada como `YYYY-MM-DDT00:00:00Z`
 * (data sem hora-do-dia significativa) — não pra timestamps reais.
 */

const toDate = (input: Date | string | number | null | undefined): Date | null => {
  if (input == null) return null;
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "06/05/2026" — formato curto pt-BR sem ajuste de timezone do viewer. */
export const formatWallClockDate = (input: Date | string | number | null | undefined): string => {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** "2026-05-06" — formato YYYY-MM-DD pra date inputs e payloads de API. */
export const toDateInputValue = (input: Date | string | number | null | undefined): string => {
  const d = toDate(input);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
};

/** Formatação custom mantendo `timeZone: 'UTC'` por padrão. */
export const formatWallClockDateWith = (
  input: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string => {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC', ...options });
};
