/**
 * R5/R6 (bloqueantes) e R12 (revisão) de FII. Funções puras. Limiares em
 * ScoringParams.sanidade.conferencia (fiiVpSalto, fiiObrigacoesMaxPct, rev.fiiPl, rev.fiiCotistas).
 *
 *  - fii_vp / vp_salto: |VP/cota do último informe ÷ anterior − 1| > fiiVpSalto, sem
 *    fatorDesdobramento em nenhum dos dois (GSRF11 ×6,23 com cotistas 2.817 → 2). Ticker; ocultar.
 *  - fii_obrigacoes / obrigacoes_acima: Obrigações/PL > fiiObrigacoesMaxPct (APXU11 125%, BLCA11,
 *    PMRL11). Ticker; selo. Liberação por mês (FII de desenvolvimento).
 *  - rev:fii_pl: PL > rev.fiiPl de variação entre os dois últimos informes (só caso).
 *  - rev:fii_cotistas: nº de cotistas > rev.fiiCotistas, base ≥ rev.fiiCotistasBaseMin (só caso).
 *  - fii_vacancia / vacancia_ocupacao | vacancia_salto: a vacância do trimestre MAIS RECENTE está em
 *    conferência pela série (regras/fii/saneamentoVacancia; HSML11 4T25 2,7% → 91,4%). Ticker;
 *    ocultar. Chave = mês do 1º trimestre do episódio (um caso por episódio).
 * Chave = mês do informe (AAAA-MM).
 */
import {
  conferirVacancia,
  type ParamsVacancia,
  type TrimestreVacancia,
  type VacanciaLiberada,
} from '@/services/analiseAtivos/regras/fii/saneamentoVacancia';
import type { CfgConferencia, DeteccaoConf, DeteccaoRev } from './aplicarConferencia';

export interface MesFiiSanidade {
  /** AAAA-MM-DD (1º dia do mês) */
  refMonth: string;
  vpCota: number | null;
  pl?: number | null;
  cotistas?: number | null;
  obrigacoesPlPct?: number | null;
  fatorDesdobramento?: number | null;
}

const mes = (refMonth: string) => refMonth.slice(0, 7);

/** Os dois últimos informes (mais recente primeiro). */
function ultimosDois(meses: readonly MesFiiSanidade[]): [MesFiiSanidade, MesFiiSanidade] | null {
  const s = [...meses].sort((a, b) => b.refMonth.localeCompare(a.refMonth));
  return s.length >= 2 ? [s[0], s[1]] : null;
}

function variacao(a: number | null | undefined, b: number | null | undefined): number | null {
  if (typeof a !== 'number' || typeof b !== 'number' || !(a > 0) || !(b > 0)) return null;
  return a / b - 1;
}

export function detectarFiiVp(
  meses: readonly MesFiiSanidade[],
  cfg: Pick<CfgConferencia, 'fiiVpSalto'>,
): DeteccaoConf | null {
  const par = ultimosDois(meses);
  if (!par) return null;
  const [ult, ant] = par;
  if (ult.fatorDesdobramento || ant.fatorDesdobramento) return null;
  const v = variacao(ult.vpCota, ant.vpCota);
  if (v === null || Math.abs(v) <= cfg.fiiVpSalto) return null;
  return {
    tipo: 'conf',
    grupo: 'fii_vp',
    regra: 'vp_salto',
    chave: mes(ult.refMonth),
    valor: v + 1,
  };
}

export function detectarFiiObrigacoes(
  mesAtual: MesFiiSanidade | null,
  cfg: Pick<CfgConferencia, 'fiiObrigacoesMaxPct'>,
): DeteccaoConf | null {
  const o = mesAtual?.obrigacoesPlPct;
  if (!mesAtual || typeof o !== 'number' || !(o > cfg.fiiObrigacoesMaxPct)) return null;
  return {
    tipo: 'conf',
    grupo: 'fii_obrigacoes',
    regra: 'obrigacoes_acima',
    chave: mes(mesAtual.refMonth),
    valor: o,
  };
}

export function revisaoFiiPl(
  meses: readonly MesFiiSanidade[],
  cfg: Pick<CfgConferencia['rev'], 'fiiPl'>,
): DeteccaoRev | null {
  const par = ultimosDois(meses);
  if (!par) return null;
  const v = variacao(par[0].pl, par[1].pl);
  if (v === null || Math.abs(v) <= cfg.fiiPl) return null;
  return { tipo: 'rev', regra: 'fii_pl', chave: mes(par[0].refMonth), valor: v + 1 };
}

export function revisaoFiiCotistas(
  meses: readonly MesFiiSanidade[],
  cfg: Pick<CfgConferencia['rev'], 'fiiCotistas' | 'fiiCotistasBaseMin'>,
): DeteccaoRev | null {
  const par = ultimosDois(meses);
  if (!par) return null;
  const base = par[1].cotistas;
  if (typeof base !== 'number' || base < cfg.fiiCotistasBaseMin) return null;
  const v = variacao(par[0].cotistas, base);
  if (v === null || Math.abs(v) <= cfg.fiiCotistas) return null;
  return { tipo: 'rev', regra: 'fii_cotistas', chave: mes(par[0].refMonth), valor: v + 1 };
}

/**
 * Vacância do trimestre mais recente em conferência (a série inteira dá a referência). Trimestre mais
 * recente sem vacância (papel, sem imóvel) = nada. `liberada` = episódio liberado pela curadoria.
 */
export function detectarFiiVacancia(
  trimestres: readonly TrimestreVacancia[],
  p: ParamsVacancia,
  liberada?: VacanciaLiberada,
): DeteccaoConf | null {
  if (trimestres.length === 0) return null;
  const ultimo = [...trimestres].sort((a, b) => b.refQuarter.localeCompare(a.refQuarter))[0];
  const c = conferirVacancia(trimestres, p, liberada).get(ultimo.refQuarter);
  if (!c) return null;
  return { tipo: 'conf', grupo: 'fii_vacancia', regra: c.regra, chave: c.chave, valor: c.valorPct };
}
