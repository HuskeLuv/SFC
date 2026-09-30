/**
 * Regra 15 na INGESTÃO — só pelo que o próprio documento mostra:
 *  - layout financeiro (DRE de banco/seguradora) ⇒ EBIT, D&A, ativo/passivo circulante e os derivados
 *    (EBITDA, Dív.líq/EBITDA, liquidez corrente, margem bruta) "não se aplicam" (nunca zero);
 *  - receita ≤ 0 ⇒ margens e P/Receita n/a ('receita_nao_positiva');
 *  - receita ≤ lucro (holdings: BBSE3, ITSA4) ⇒ margens e P/Receita n/a ('receita_menor_que_lucro').
 * A classificação setorial (financeira por segmento B3, holdings financeiras) é reaplicada pela fatia
 * D no cálculo, via EmissorInfo.
 */
import type { MotivoNaoSeAplica } from '@/services/analiseAtivos/tipos';

/** Campos de AssetFundamentalsPeriod + métricas derivadas que não se aplicam a layout financeiro. */
export const NAO_APLICAVEIS_LAYOUT_FINANCEIRO = [
  'ebit',
  'depreciacaoAmortizacao',
  'ativoCirculante',
  'passivoCirculante',
  'ebitda',
  'divLiqEbitda',
  'liquidezCorrente',
  'margemBrutaPct',
] as const;

/** Métricas que dependem de receita positiva e maior que o lucro. */
export const NAO_APLICAVEIS_RECEITA = ['margemBrutaPct', 'margemLiquidaPct', 'pReceita'] as const;

export function metricasNaoAplicaveis(e: {
  layoutFinanceiro: boolean;
  receita: number | null;
  lucro: number | null;
}): Map<string, MotivoNaoSeAplica> {
  const out = new Map<string, MotivoNaoSeAplica>();
  if (e.layoutFinanceiro) {
    for (const m of NAO_APLICAVEIS_LAYOUT_FINANCEIRO) out.set(m, 'financeira');
  }
  // receita ausente é "ausente", não n/a: só decide quando há número
  if (typeof e.receita === 'number' && Number.isFinite(e.receita)) {
    let motivo: MotivoNaoSeAplica | null = null;
    if (e.receita <= 0) motivo = 'receita_nao_positiva';
    else if (typeof e.lucro === 'number' && Number.isFinite(e.lucro) && e.receita <= e.lucro) {
      motivo = 'receita_menor_que_lucro';
    }
    if (motivo) for (const m of NAO_APLICAVEIS_RECEITA) if (!out.has(m)) out.set(m, motivo);
  }
  return out;
}
