/**
 * ScoringParams versão 3 — alinhamento ao Fundamentei, só a IDEIA das regras de cálculo (desenho
 * docs/analise-ativos/fundamentei-regras/desenho.json, fatia F2; decisões do Wellington de
 * 20/10/2026 em decisoes.md). v3 = a v2 SEM NENHUMA outra mudança + as regras de cálculo
 * versionadas da F0 (scoringParamsSchema.regrasCalculoDe):
 *  - payout.regra 'dfc' (A4.a): payout do ano = dividendos + JCP PAGOS na DFC ÷ lucro atribuível do
 *    FY; do dia = os mesmos do TTM ÷ lucro TTM; lucro ≤ 0 = sem número, motivo 'prejuizo' (a tela
 *    mostra 'L'). payoutDmplPct e payoutPorAcaoPct continuam gravados (auditoria de proventos);
 *  - proventos.baseJanelaDy 'ex' (A4.b): DY 12m e DY/DPA do ano de AÇÕES pela data-ex (pregão
 *    seguinte à data-com real). FII segue pela data-com;
 *  - proventos.cortarFuturos (A4.b): data-ex depois de hoje fica fora do DPA do ano;
 *  - proventos.dpaPorExercicio (A4.c, decisão 3): exercício fora de dezembro (CAML3 mar–fev) soma
 *    os proventos com data-ex em [dtIni, dtFim] contra o preço do último pregão do exercício;
 *  - serie10aPorDtFim (A4.c): 'lucro 10 anos' e salto de provento do job quadro com os anos
 *    fechados por dtFim ≤ hoje (dezembro não muda).
 *
 * Base = a v2 (a última versão do código). ATENÇÃO na ativação: a v2 liga as regras de sanidade "em
 * conferência" (bloco C). Se, na hora do seed em produção, a vigente ainda for a v1, ativar a v3 liga
 * também o bloco C — confirmar com o Wellington antes do seed (versão imutável: trocar a base depois
 * do seed = v4).
 *
 * INERTE: o seed (seed-scoring-params --versao=3) grava com validFrom 2099-01-01 FIXO; a ativação
 * é um UPDATE do validFrom com OK, depois do dry-run recalcular-analise --versao-params=3
 * --relatorio-tickers (ATIVACAO.md). Versões são imutáveis: recalibrar = v4.
 */
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

/** validFrom do seed da v3 (fixo: nunca new Date()). */
export const VALID_FROM_SCORING_V3 = '2099-01-01T00:00:00.000Z';

function criarV3(): ScoringParams {
  const p = structuredClone(SCORING_PARAMS_V2);
  p.versao = 3;
  p.descricao =
    'v2 + regras de cálculo do alinhamento ao Fundamentei (20/10/2026; docs/analise-ativos/fundamentei-regras/desenho.json, F2): payout = proventos pagos na DFC ÷ lucro (lucro ≤ 0 = prejuízo), DY de ações por data-ex sem data-ex futura, DPA/DY do exercício real fora de dezembro e anos fechados do job quadro por dtFim. Percentuais em pontos percentuais.';
  p.payout = { regra: 'dfc' };
  p.proventos = { baseJanelaDy: 'ex', cortarFuturos: true, dpaPorExercicio: true };
  p.serie10aPorDtFim = true;
  return p;
}

export const SCORING_PARAMS_V3: ScoringParams = criarV3();
