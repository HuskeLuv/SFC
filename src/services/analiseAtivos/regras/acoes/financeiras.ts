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

export interface ExcecaoEscopo {
  escopo: 'con' | 'ind';
  motivo: string;
}

/**
 * Exceções por raiz ao escopo padrão (bancos pelo individual, decisão 3; demais pelo consolidado).
 * Vale quando o ScoringParams gravado não traz `financeiras.escopoPorRaiz` (v1/v2 de prod). Backtest
 * 18/10/2026 (A10): no Itaú e no BR Partners o individual é o da HOLDING, não o do banco — razão
 * receita individual ÷ consolidada medida em 2020–2025 entre as 25 financeiras do universo: entre
 * as que usam o individual (segmento Bancos), ITUB 0,02–0,08 e BRBI 0,00–0,01; os outros bancos com
 * os dois escopos ficam entre 0,54 e 2,49 (BB, Bradesco, Santander, ABC, Pine, BRB, Banrisul…) ou só
 * têm o individual. PSSA e ITSA também têm razão ~0, mas já usam o consolidado (não são banco). Não
 * generalizar sem medir.
 */
export const ESCOPO_POR_RAIZ_PADRAO: Readonly<Record<string, ExcecaoEscopo>> = {
  ITUB: {
    escopo: 'con',
    motivo:
      'Itaú Unibanco Holding: individual é o da holding (receita 2025 de R$ 30,7 bi no individual × R$ 387,1 bi no consolidado; margem de 147% a 611%)',
  },
  BRBI: {
    escopo: 'con',
    motivo:
      'BR Partners: individual é o da holding (receita 0 em 2023–2025 no individual × R$ 247–365 mi no consolidado)',
  },
};

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
