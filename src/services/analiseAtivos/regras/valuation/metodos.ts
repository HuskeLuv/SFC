/**
 * Fórmulas de "Meus cenários" do Valuation (spec §4.5 e casos da §4.6). Funções puras.
 *
 * Nenhum método é previsão de preço: são contas de referência com as premissas do usuário. Todo caso
 * inválido devolve `null` (a tela mostra "—"), nunca exceção nem valor negativo (regra 4 do relatório
 * da Fase A: base ≤ 0 ⇒ "—"). Percentuais entram em pontos percentuais (6 = 6%). Os resultados saem
 * sem arredondar; a exibição usa `arredondar` (2 casas em R$).
 */
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export type LimitesValuation = ScoringParams['valuation']['limites'];

const LIMITES_PADRAO: LimitesValuation = SCORING_PARAMS_V1.valuation.limites;

function num(x: number | null | undefined): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function positivo(x: number | null | undefined): x is number {
  return num(x) && x > 0;
}

function dentro(x: number | null | undefined, faixa: readonly [number, number]): x is number {
  return num(x) && x >= faixa[0] && x <= faixa[1];
}

/** Bazin: DPA ÷ yield desejado. DPA ≤ 0 ou yield fora de [0,1; 30] ⇒ null. */
export function bazin(
  dpa: number | null,
  yieldPct: number,
  limites: LimitesValuation = LIMITES_PADRAO,
): number | null {
  if (!positivo(dpa) || !dentro(yieldPct, limites.yieldPct)) return null;
  return dpa / (yieldPct / 100);
}

/** Graham: √(22,5 × LPA × VPA). LPA ≤ 0 ou VPA ≤ 0 ⇒ null. */
export function graham(lpa: number | null, vpa: number | null): number | null {
  if (!positivo(lpa) || !positivo(vpa)) return null;
  return Math.sqrt(22.5 * lpa * vpa);
}

/** Múltiplo alvo × base (P/L × LPA, P/FFO × FFO/share). Base ≤ 0 ou múltiplo ≤ 0 ⇒ null. */
export function multiploAlvo(multiplo: number | null, base: number | null): number | null {
  if (!positivo(multiplo) || !positivo(base)) return null;
  return multiplo * base;
}

/** Gordon: DPA × (1+g) ÷ (k − g). k ≤ g, DPA ≤ 0 ou premissa fora do limite ⇒ null. */
export function gordon(
  dpa: number | null,
  gPct: number,
  kPct: number,
  limites: LimitesValuation = LIMITES_PADRAO,
): number | null {
  if (!positivo(dpa) || !dentro(gPct, limites.gPct) || !dentro(kPct, limites.kPct)) return null;
  if (kPct <= gPct) return null;
  return (dpa * (1 + gPct / 100)) / ((kPct - gPct) / 100);
}

/** FII: rendimento 12m ÷ yield desejado. */
export function rendaDesejada(
  rend12m: number | null,
  yieldPct: number,
  limites: LimitesValuation = LIMITES_PADRAO,
): number | null {
  if (!positivo(rend12m) || !dentro(yieldPct, limites.yieldPct)) return null;
  return rend12m / (yieldPct / 100);
}

/** FII: P/VP alvo × VP/cota. */
export function pvpAlvo(pvp: number | null, vpCota: number | null): number | null {
  if (!positivo(pvp) || !positivo(vpCota)) return null;
  return pvp * vpCota;
}

/** "vs. cotação" = resultado ÷ cotação − 1, em %. Sem cor semântica na tela. */
export function vsCotacaoPct(resultado: number | null, cotacao: number): number | null {
  if (!num(resultado) || !positivo(cotacao)) return null;
  return (resultado / cotacao - 1) * 100;
}

/** "Com sua margem" = resultado × (1 − margem). Margem fora de [0; 50] ⇒ null. */
export function comMargem(
  resultado: number | null,
  margemPct: number,
  limites: LimitesValuation = LIMITES_PADRAO,
): number | null {
  if (!num(resultado) || !dentro(margemPct, limites.margemPct)) return null;
  return resultado * (1 - margemPct / 100);
}

/**
 * "Sua posição" (só para quem tem o ativo): preço médio ÷ LPA (ou VP/cota, FFO/share) e
 * DPA (ou rendimento 12m) ÷ preço médio. Usa a primeira base informada, nessa ordem.
 */
export function suaPosicao(e: {
  pm: number;
  lpa?: number | null;
  vpCota?: number | null;
  ffo?: number | null;
  dpa?: number | null;
  rend12m?: number | null;
}): { multiploSobreCusto: number | null; yieldSobreCustoPct: number | null } {
  if (!positivo(e.pm)) return { multiploSobreCusto: null, yieldSobreCustoPct: null };
  const base = [e.lpa, e.vpCota, e.ffo].find((b) => b !== undefined && b !== null);
  const provento = [e.dpa, e.rend12m].find((b) => b !== undefined && b !== null);
  return {
    multiploSobreCusto: positivo(base) ? e.pm / base : null,
    yieldSobreCustoPct: num(provento) && provento >= 0 ? (provento / e.pm) * 100 : null,
  };
}
