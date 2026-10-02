/**
 * Séries anuais e CAGR — implementação ÚNICA da Fase 1 (usada pelas fatias A, B e C).
 *
 * Regras (decisão 5 do Wellington, 02/10/2026):
 * - Séries anuais usam SÓ anos FECHADOS: o ano corrente fica fora (HGLG11 2026 = 5,5 de jan–ago,
 *   contra 13,2 em 2025). FII: também sai o ano com menos de 12 meses de informe.
 * - Os últimos 12 meses são um ponto SEPARADO ('últ. 12m'), nunca misturado na série.
 * - Provento do ano > 2× o do ano anterior = "em conferência" (suspeito): barra tracejada, selo
 *   'proventos em conferência' e FORA do CAGR (WEGE3 2025: 2,45 contra 0,76 — parcelas repetidas
 *   na fonte). O fator é 2 (decisões.md prevalece sobre o 2,5 da spec); com payout do ano
 *   informado, o salto só marca se o payout passar de 150% (WEGE3 2021 dobrou com lucro).
 * - CAGR: null se algum extremo ≤ 0 (ou ausente).
 *
 * Funções puras; datas 'AAAA-MM-DD'; percentuais em pontos percentuais.
 */
import { fatorEventosApos } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import type { EventoCorporativoVerificado } from '@/services/analiseAtivos/tipos';
import type { PontoSerieAnual, PontoUlt12m } from '@/types/analiseAtivosApi';

/** Fator padrão da regra de salto de provento (decisão 5). */
export const FATOR_SALTO_PROVENTO = 2;
/** Com payout do ano informado, o salto só marca acima disto (%). */
export const PAYOUT_MAX_PADRAO = 150;

export function anoDe(data: string): number {
  return Number(data.slice(0, 4));
}

/** Crescimento anual composto em % a.a.; null se algum extremo ≤ 0/ausente ou anos ≤ 0. */
export function cagr(
  vIni: number | null | undefined,
  vFim: number | null | undefined,
  anos: number,
): number | null {
  if (typeof vIni !== 'number' || typeof vFim !== 'number') return null;
  if (!Number.isFinite(vIni) || !Number.isFinite(vFim)) return null;
  if (vIni <= 0 || vFim <= 0 || !(anos > 0)) return null;
  return (Math.pow(vFim / vIni, 1 / anos) - 1) * 100;
}

export interface OpcoesAnosFechados {
  /** FII: meses com informe por ano; ano com menos de `mesesMinimos` sai */
  mesesPorAno?: Record<number, number>;
  /** padrão 12 */
  mesesMinimos?: number;
}

/** Descarta o ano corrente (e posteriores) e, para FIIs, anos com informe incompleto. Ordena por ano. */
export function anosFechados<T extends { ano: number }>(
  pontos: readonly T[],
  hoje: string,
  opts: OpcoesAnosFechados = {},
): T[] {
  const anoAtual = anoDe(hoje);
  const minimo = opts.mesesMinimos ?? 12;
  return pontos
    .filter((p) => p.ano < anoAtual)
    .filter((p) => !opts.mesesPorAno || (opts.mesesPorAno[p.ano] ?? 0) >= minimo)
    .slice()
    .sort((a, b) => a.ano - b.ano);
}

/** Ponto 'últ. 12m' separado da série; null se não houver valor finito. */
export function pontoUlt12m(
  valorTtm: number | null | undefined,
  dataRef: string | null | undefined,
): PontoUlt12m | null {
  if (typeof valorTtm !== 'number' || !Number.isFinite(valorTtm) || !dataRef) return null;
  return { valor: valorTtm, dataRef };
}

export interface OpcoesSaltoProvento {
  /** padrão FATOR_SALTO_PROVENTO (2) */
  fator?: number;
  /**
   * Payout (%) por ano. Quando o ano tem payout informado, o salto só marca se o payout também
   * passar de `payoutMax` (um salto acompanhado de lucro é real: WEGE3 2021 dobrou com payout de
   * ~51%). Sem payout do ano (FIIs, ano sem lucro), vale só o salto.
   */
  payoutPorAno?: Record<number, number | null | undefined>;
  /** padrão PAYOUT_MAX_PADRAO (150) */
  payoutMax?: number;
}

export interface ResultadoSaltoProvento {
  anosSuspeitos: number[];
  /** mesma série, ordenada por ano, com `suspeito: true` nos anos marcados */
  serie: PontoSerieAnual[];
}

/**
 * Marca anos com provento > fator × o do ano anterior (o último ano anterior com valor > 0),
 * filtrado pelo payout quando informado (ver OpcoesSaltoProvento). Alimenta o selo 'proventos em
 * conferência' e tira o ano do CAGR.
 */
export function detectarSaltoProvento(
  serie: readonly PontoSerieAnual[],
  opts: OpcoesSaltoProvento = {},
): ResultadoSaltoProvento {
  const fator = opts.fator ?? FATOR_SALTO_PROVENTO;
  const payoutMax = opts.payoutMax ?? PAYOUT_MAX_PADRAO;
  const ordenada = serie.slice().sort((a, b) => a.ano - b.ano);
  const suspeitos: number[] = [];
  let anterior: number | null = null;
  const saida = ordenada.map((p) => {
    const v = p.valor;
    let suspeito = false;
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (anterior !== null && v > fator * anterior) {
        const payout = opts.payoutPorAno?.[p.ano];
        suspeito =
          typeof payout === 'number' && Number.isFinite(payout) ? payout > payoutMax : true;
      }
      if (v > 0) anterior = v;
    }
    if (suspeito) suspeitos.push(p.ano);
    const { suspeito: _antes, ...resto } = p;
    return suspeito ? { ...resto, suspeito: true } : resto;
  });
  return { anosSuspeitos: suspeitos, serie: saida };
}

export type MotivoCagr = 'historico_curto' | 'extremo_em_conferencia' | 'base_nao_positiva';

export interface ResultadoCagrJanela {
  pct: number | null;
  motivo: MotivoCagr | null;
  anoInicio: number | null;
  anoFim: number | null;
}

export interface OpcoesCagrJanela {
  /**
   * Último ano suspeito ('em conferência'): a janela recua até o último ano NÃO suspeito (WEGE3
   * 2025 suspeito ⇒ 2019 a 2024), em vez de devolver null. Quem usa mostra 'de anoInicio a anoFim'.
   */
  recuarFimEmConferencia?: boolean;
}

/**
 * CAGR de `anos` anos sobre uma série JÁ de anos fechados: do último ano até `anos` antes.
 * Extremo suspeito ('em conferência') ⇒ null com motivo (fica fora do CAGR); com
 * `recuarFimEmConferencia`, o fim recua até o último ano não suspeito.
 */
export function cagrJanela(
  serie: readonly PontoSerieAnual[],
  anos: number,
  opts: OpcoesCagrJanela = {},
): ResultadoCagrJanela {
  let ordenada = serie.slice().sort((a, b) => a.ano - b.ano);
  if (opts.recuarFimEmConferencia) {
    let i = ordenada.length - 1;
    while (i >= 0 && ordenada[i].suspeito) i--;
    if (i >= 0) ordenada = ordenada.slice(0, i + 1);
  }
  const fim = ordenada[ordenada.length - 1];
  if (!fim) return { pct: null, motivo: 'historico_curto', anoInicio: null, anoFim: null };
  const ini = ordenada.find((p) => p.ano === fim.ano - anos);
  if (!ini) return { pct: null, motivo: 'historico_curto', anoInicio: null, anoFim: fim.ano };
  if (ini.suspeito || fim.suspeito) {
    return { pct: null, motivo: 'extremo_em_conferencia', anoInicio: ini.ano, anoFim: fim.ano };
  }
  const pct = cagr(ini.valor, fim.valor, anos);
  return {
    pct,
    motivo: pct === null ? 'base_nao_positiva' : null,
    anoInicio: ini.ano,
    anoFim: fim.ano,
  };
}

/**
 * Rebase para 100 no primeiro ponto com valor > 0 a partir do índice `inicio` (pontos anteriores
 * ficam null). Valores ausentes continuam null (lacuna).
 */
export function baseCem<T extends { valor: number | null }>(
  serie: readonly T[],
  inicio = 0,
): Array<T & { base100: number | null }> {
  let base: number | null = null;
  return serie.map((p, i) => {
    if (i < inicio) return { ...p, base100: null };
    const v = p.valor;
    if (base === null && typeof v === 'number' && v > 0) base = v;
    const base100 = base !== null && typeof v === 'number' ? (v / base) * 100 : null;
    return { ...p, base100 };
  });
}

/**
 * Fator para levar um valor POR AÇÃO da data `data` à base de ações de hoje (regra de
 * regras/calculo/eventosCorporativos): Π dos eventos confirmados (ou emissão/recompra coerente)
 * com data estritamente posterior. Preço ajustado = preço / fator.
 */
export function fatorAjusteAte(
  data: string,
  eventosConfirmados: ReadonlyArray<
    Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>
  >,
): number {
  return fatorEventosApos([...eventosConfirmados], data);
}
