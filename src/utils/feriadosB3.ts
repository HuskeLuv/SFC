/**
 * Calendário de feriados nacionais bancários do Brasil — feriados em que B3 e
 * BACEN não funcionam. Usado pelo `buildDailyTimeline` para excluir dias em
 * que renda fixa pré-fixada (LCA/CDB/LCI/debênture pré) NÃO compõe juros.
 *
 * Tudo ancorado em UTC (mesmo padrão do resto do app pós-`dca69f2`).
 *
 * Cobre:
 *   - 8 feriados fixos: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 25/12
 *   - 4 móveis derivados da Páscoa (algoritmo de Gauss):
 *       Sexta-feira Santa (-2d), Carnaval segunda (-48d) + terça (-47d), Corpus Christi (+60d)
 *
 * NÃO cobre:
 *   - Feriados estaduais/municipais (ex.: aniversário de SP em 25/01)
 *   - Feriados-ponte oficializados pontualmente
 *   - Feriados móveis criados por decreto (raríssimo)
 *   ANBIMA inclui mais alguns; pra precificação de FI nacional os 12 acima
 *   já cobrem ~99% dos casos.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Domingo de Páscoa em UTC midnight, via algoritmo de Gauss (válido pra anos 1900-2099). */
const easterUtc = (year: number): number => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
};

const yearCache = new Map<number, Set<number>>();

/**
 * Retorna o conjunto de timestamps UTC midnight de todos os feriados
 * nacionais bancários do Brasil em `year`. Cacheado por ano.
 */
export const feriadosB3 = (year: number): Set<number> => {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const days = new Set<number>();
  // Fixos
  days.add(Date.UTC(year, 0, 1)); //   Confraternização Universal
  days.add(Date.UTC(year, 3, 21)); //  Tiradentes
  days.add(Date.UTC(year, 4, 1)); //   Dia do Trabalho
  days.add(Date.UTC(year, 8, 7)); //   Independência
  days.add(Date.UTC(year, 9, 12)); //  Padroeira
  days.add(Date.UTC(year, 10, 2)); //  Finados
  days.add(Date.UTC(year, 10, 15)); // Proclamação da República
  days.add(Date.UTC(year, 11, 25)); // Natal

  // Móveis derivados da Páscoa
  const easter = easterUtc(year);
  days.add(easter - 2 * DAY_MS); //  Sexta-feira Santa
  days.add(easter - 48 * DAY_MS); // Carnaval segunda
  days.add(easter - 47 * DAY_MS); // Carnaval terça
  days.add(easter + 60 * DAY_MS); // Corpus Christi

  yearCache.set(year, days);
  return days;
};

/**
 * `true` se a data é feriado nacional bancário (B3/BACEN). Aceita Date ou
 * timestamp; normaliza para UTC midnight antes de comparar.
 */
export const isHolidayB3 = (date: Date | number): boolean => {
  const d = typeof date === 'number' ? new Date(date) : date;
  const year = d.getUTCFullYear();
  const utcMidnight = Date.UTC(year, d.getUTCMonth(), d.getUTCDate());
  return feriadosB3(year).has(utcMidnight);
};

/**
 * `true` se sábado, domingo OU feriado B3. Atalho usado pelos timeline builders.
 */
export const isNonBusinessDayB3 = (date: Date | number): boolean => {
  const d = typeof date === 'number' ? new Date(date) : date;
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return isHolidayB3(d);
};

/**
 * Devolve o timestamp UTC midnight do PRÓXIMO dia útil (>= `from`). Usado para
 * ancorar cashflows que caíram em dia não-útil — convenção D+next ANBIMA.
 *
 * Aceita timestamp UTC midnight; retorna timestamp UTC midnight.
 * Avança no máximo 10 dias para evitar loops em datasets degenerados.
 */
export const nextBusinessDayB3 = (from: number): number => {
  let cursor = from;
  for (let i = 0; i < 10; i++) {
    if (!isNonBusinessDayB3(cursor)) return cursor;
    cursor += DAY_MS;
  }
  return cursor;
};
