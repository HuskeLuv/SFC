/**
 * ScoringParams versão 4 — a v3 com o DPA/DY do ano de AÇÕES pelo ano-calendário da data-ex também
 * nas empresas com exercício fora de dezembro (proventos.dpaPorExercicio false), como o Fundamentei
 * agrupa os proventos (decisão do Wellington de 21/10/2026, a partir do HAR de 19/10). O payout
 * continua o da v3: proventos pagos na DFC ÷ lucro do MESMO exercício.
 *
 * INERTE: o seed (seed-scoring-params --versao=4) grava com validFrom 2099-01-01 FIXO; a ativação
 * é um UPDATE do validFrom com OK, depois do dry-run recalcular-analise --versao-params=4. A v3
 * nunca é ativada (histórico imutável). Recalibrar = v5.
 */
import { SCORING_PARAMS_V3 } from '@/services/analiseAtivos/params/scoringParamsV3';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

/** validFrom do seed da v4 (fixo: nunca new Date()). */
export const VALID_FROM_SCORING_V4 = '2099-01-01T00:00:00.000Z';

function criarV4(): ScoringParams {
  const p = structuredClone(SCORING_PARAMS_V3);
  p.versao = 4;
  p.descricao =
    'v3 com o DPA/DY do ano pelo ano-calendário da data-ex também no exercício fora de dezembro (21/10/2026, mais próximo do Fundamentei): payout = proventos pagos na DFC ÷ lucro (lucro ≤ 0 = prejuízo), DY de ações por data-ex sem data-ex futura e anos fechados do job quadro por dtFim. Percentuais em pontos percentuais.';
  p.proventos = { ...p.proventos, dpaPorExercicio: false };
  return p;
}

export const SCORING_PARAMS_V4: ScoringParams = criarV4();
