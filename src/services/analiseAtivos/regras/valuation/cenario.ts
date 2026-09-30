/**
 * Premissas de "Meus cenários" (spec §4.5): validação dos inputs e a parte pura do caso 22 da §4.6
 * (salvar/restaurar cenário). A persistência em user_scenarios é da Fase 2.
 */
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { LimitesValuation } from '@/services/analiseAtivos/regras/valuation/metodos';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export type Premissas = ScoringParams['valuation']['premissasPadrao']['acao'];
export type NomePremissa = 'yieldPct' | 'gPct' | 'kPct' | 'margemPct';

/**
 * Aceita número ou texto com vírgula ou ponto ("6", "6,5", "6.5"). Fora do limite da spec (yield
 * 0,1–30; g 0–20; k 1–30; margem 0–50 em passos de 5) ⇒ null.
 */
export function validarPremissa(
  nome: NomePremissa,
  valor: string | number,
  limites: LimitesValuation = SCORING_PARAMS_V1.valuation.limites,
): number | null {
  let n: number;
  if (typeof valor === 'number') {
    n = valor;
  } else {
    const t = valor.trim().replace(/\s+/g, '');
    if (!/^[+-]?\d+([.,]\d+)?$/.test(t)) return null;
    n = Number(t.replace(',', '.'));
  }
  if (!Number.isFinite(n)) return null;
  const [min, max] = limites[nome];
  if (n < min || n > max) return null;
  if (nome === 'margemPct') {
    const passos = n / limites.margemPasso;
    if (Math.abs(passos - Math.round(passos)) > 1e-9) return null;
  }
  return n;
}

/** Ao reabrir o ativo: o cenário salvo (se houver) vence as premissas padrão, campo a campo. */
export function aplicarCenarioSalvo(
  padrao: Premissas,
  salvo: Partial<Premissas> | null,
): { premissas: Premissas; origem: 'salvo' | 'ativo' } {
  if (!salvo || Object.keys(salvo).length === 0)
    return { premissas: { ...padrao }, origem: 'ativo' };
  const premissas: Premissas = { ...padrao };
  for (const [k, v] of Object.entries(salvo) as Array<[keyof Premissas, unknown]>) {
    if (v !== undefined && v !== null) (premissas as Record<string, unknown>)[k] = v;
  }
  return { premissas, origem: 'salvo' };
}

/** "Restaurar valores do ativo": volta ao padrão e pede para apagar o registro salvo. */
export function restaurarPadrao(padrao: Premissas): { premissas: Premissas; apagarRegistro: true } {
  return { premissas: { ...padrao }, apagarRegistro: true };
}
