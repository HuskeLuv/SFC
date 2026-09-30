import { prevBusinessDayB3 } from '@/utils/feriadosB3';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Abertura do pregão em minutos UTC (B3 10h BRT; NYSE 9h30 ET no horário de verão). */
const ABERTURA_UTC_MIN = { B3: 13 * 60, EUA: 13 * 60 + 30 } as const;

export type MercadoPregao = keyof typeof ABERTURA_UTC_MIN;

/**
 * Data (UTC midnight) do pregão a que uma cotação consultada em `consultadoEm` se refere.
 *
 * A BRAPI devolve em `regularMarketTime` a hora da CONSULTA, não a do último negócio.
 * O cron roda às 07h UTC, antes da abertura: o preço ali é o fechamento do pregão
 * anterior e não pode ser gravado com a data do dia (nem em sábado/domingo).
 *
 * Regra: antes da abertura → último pregão anterior; durante/depois do pregão → hoje;
 * dia sem pregão → último pregão anterior. Uma consulta intradiária grava o preço
 * parcial em "hoje", e o cron da manhã seguinte sobrescreve com o fechamento.
 */
export const dataPregaoReferencia = (consultadoEm: Date, mercado: MercadoPregao = 'B3'): Date => {
  const dia = Date.UTC(
    consultadoEm.getUTCFullYear(),
    consultadoEm.getUTCMonth(),
    consultadoEm.getUTCDate(),
  );
  const minutos = consultadoEm.getUTCHours() * 60 + consultadoEm.getUTCMinutes();
  let alvo = minutos < ABERTURA_UTC_MIN[mercado] ? dia - DAY_MS : dia;

  if (mercado === 'B3') {
    alvo = prevBusinessDayB3(alvo);
  } else {
    // Sem calendário de feriados dos EUA: só pula fim de semana. Num feriado americano a
    // cotação fica gravada no feriado e é sobrescrita pelo cron seguinte.
    while ([0, 6].includes(new Date(alvo).getUTCDay())) alvo -= DAY_MS;
  }
  return new Date(alvo);
};

/** Mercado do pregão pelo ativo; `null` para ativos de negociação contínua (cripto, moeda). */
export const mercadoDoAtivo = (asset: {
  type?: string | null;
  currency?: string | null;
}): MercadoPregao | null => {
  if (asset.type === 'crypto' || asset.type === 'currency') return null;
  return asset.currency === 'USD' ? 'EUA' : 'B3';
};
