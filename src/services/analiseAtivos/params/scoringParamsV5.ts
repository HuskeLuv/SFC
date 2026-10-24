/**
 * ScoringParams versão 5 — a v4 com as regras "igual ao Fundamentei" de 24/10/2026 (decisão do
 * Wellington: sempre fazer igual ao Fundamentei, a partir do HAR de 24/10):
 * - proventos.jcpLiquido: JCP líquido de IR no DPA/DY de ações e nos próximos proventos;
 * - multiplos.lucroPlTotais: lucro e PL TOTAIS (com minoritários) em LPA, VPA, P/L, P/VP, ROE, DL/PL e
 *   no payout de caixa;
 * - multiplos.valorMercadoComTesouraria: valor de mercado = Σ classes × ações emitidas com tesouraria.
 *
 * INERTE: o seed (seed-scoring-params --versao=5) grava com validFrom 2099-01-01 FIXO; a ativação
 * é um UPDATE do validFrom com OK, depois do dry-run recalcular-analise --versao-params=5. Recalibrar
 * = v6.
 */
import { SCORING_PARAMS_V4 } from '@/services/analiseAtivos/params/scoringParamsV4';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

/** validFrom do seed da v5 (fixo: nunca new Date()). */
export const VALID_FROM_SCORING_V5 = '2099-01-01T00:00:00.000Z';

function criarV5(): ScoringParams {
  const p = structuredClone(SCORING_PARAMS_V4);
  p.versao = 5;
  p.descricao =
    'v4 com as regras de 24/10/2026 (igual ao Fundamentei): JCP líquido de IR no DPA/DY e nos próximos proventos, lucro e PL totais (com minoritários) nos múltiplos e no payout de caixa, e valor de mercado com as ações em tesouraria. Percentuais em pontos percentuais.';
  p.proventos = { ...p.proventos, jcpLiquido: true };
  p.multiplos = { lucroPlTotais: true, valorMercadoComTesouraria: true };
  return p;
}

export const SCORING_PARAMS_V5: ScoringParams = criarV5();
