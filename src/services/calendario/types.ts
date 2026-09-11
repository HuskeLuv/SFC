/**
 * Agenda financeira — tipos compartilhados entre as fontes de eventos.
 *
 * Um EventoAgenda é o que a página Calendário desenha. Fontes calculadas
 * (dívidas, proventos, renda fixa, IR, planejamento, mercado) geram eventos
 * na hora a partir dos dados de origem; só a fonte `manual` lê a tabela Event.
 * Datas são civis ("AAAA-MM-DD"), sem fuso; hora é texto "HH:MM" ou null.
 */

export const TIPOS_EVENTO = [
  'manual',
  'divida',
  'provento',
  'rf',
  'ir',
  'planejamento',
  'mercado',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface EventoAgenda {
  /** Único por ocorrência (ex.: "manual:<uuid>:2026-09-25", "divida:<id>:14"). */
  id: string;
  tipo: TipoEvento;
  titulo: string;
  /** Primeiro dia, AAAA-MM-DD. */
  data: string;
  /** Último dia (inclusive) para eventos de vários dias; null = um dia só. */
  dataFim: string | null;
  /** "HH:MM" ou null (dia inteiro). */
  hora: string | null;
  /** Valor em R$ quando faz sentido (parcela, provento, vencimento). */
  valor: number | null;
  descricao: string | null;
  /** Rota no app para "abrir em…" (ex.: "/dividas/<id>"); null para eventos manuais. */
  link: string | null;
  /** Dados específicos do tipo, para o detalhe no cartão. */
  detalhe: Record<string, unknown>;
}

/** Intervalo civil inclusivo. */
export interface Periodo {
  de: string;
  ate: string;
}
