/**
 * Período personalizado da aba Rentabilidade Geral (ticket 02/09/2026, "igual
 * ao Gorila"): o usuário escolhe data inicial e final.
 *
 * Contrato: o INÍCIO vai pras APIs como os presets (a série é recalculada a
 * partir dele — primeiro ponto = 0%); o FIM corta as séries no cliente. Como
 * TWR e MWR são cumulativos desde o início da janela (cada ponto = retorno
 * de `inicio` até aquele dia), cortar no fim devolve exatamente o retorno do
 * intervalo [inicio, fim] sem nova chamada.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export interface PeriodoPersonalizado {
  /** Meia-noite UTC do dia inicial (ms). */
  inicio: number;
  /** Meia-noite UTC do dia final (ms), inclusive. */
  fim: number;
}

/** 'YYYY-MM-DD' → meia-noite UTC (ms); null se inválido. */
export function parseIsoDateUtc(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ts);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return ts;
}

export type ResolucaoPeriodo =
  | { ok: true; periodo: PeriodoPersonalizado; inicioClampado: boolean; fimClampado: boolean }
  | { ok: false; erro: string };

/**
 * Valida e ajusta o intervalo digitado:
 * - início anterior ao 1º investimento sobe até ele (a carteira não existe antes);
 * - fim no futuro desce até hoje (não há série além do último fechamento);
 * - fim antes do início é erro.
 */
export function resolverPeriodoPersonalizado(params: {
  inicioIso: string;
  fimIso: string;
  firstInvestmentDate?: number;
  hojeUtc: number;
}): ResolucaoPeriodo {
  const inicioBruto = parseIsoDateUtc(params.inicioIso);
  const fimBruto = parseIsoDateUtc(params.fimIso);
  if (inicioBruto == null || fimBruto == null) {
    return { ok: false, erro: 'Informe a data inicial e a data final.' };
  }
  let inicio = inicioBruto;
  let fim = fimBruto;
  let inicioClampado = false;
  let fimClampado = false;
  if (params.firstInvestmentDate != null && inicio < params.firstInvestmentDate) {
    inicio = params.firstInvestmentDate;
    inicioClampado = true;
  }
  if (fim > params.hojeUtc) {
    fim = params.hojeUtc;
    fimClampado = true;
  }
  if (fim < inicio) {
    return { ok: false, erro: 'A data final precisa ser igual ou posterior à data inicial.' };
  }
  return { ok: true, periodo: { inicio, fim }, inicioClampado, fimClampado };
}

/** Mantém só os pontos até `fim` (inclusive). Sem `fim`, devolve a série intacta. */
export function cortarNoFim<T extends { date: number }>(serie: T[], fim?: number): T[] {
  if (fim == null) return serie;
  return serie.filter((p) => p.date <= fim);
}

const fmtBR = (ts: number): string => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** "05/02/2020 – 01/09/2026" */
export function rotuloPeriodo(periodo: PeriodoPersonalizado): string {
  return `${fmtBR(periodo.inicio)} – ${fmtBR(periodo.fim)}`;
}

/**
 * Range da API de índices que cobre um início arbitrário (a API expande pelo
 * startDate, mas o range dá o teto de resolução/cache — mesmo mapa dos presets).
 */
export function indicesRangeParaInicio(
  inicio: number,
  hojeUtc: number,
): '1y' | '2y' | '3y' | '5y' | '10y' {
  const anos = (hojeUtc - inicio) / (365.25 * DIA_MS);
  if (anos <= 1) return '1y';
  if (anos <= 2) return '2y';
  if (anos <= 3) return '3y';
  if (anos <= 5) return '5y';
  return '10y';
}

/** 'YYYY-MM-DD' (UTC) a partir de ms — valor inicial dos inputs. */
export function toIsoDateUtc(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
