/**
 * ScoringParams versão 6 — a v5 com Fiagro e FI-Infra listados DENTRO do Quadro (decisão de produto
 * de 04/11/2026: a mesma análise do FII de papel, só muda o lastro — FII papel = CRI/LCI, Fiagro =
 * CRA/LCA, FI-Infra = debêntures). Única diferença: universo.fiagroForaDoMvp = false. O tipo 'papel'
 * (perfil fii_papel, rótulo "Papel") vem dos jobs fiagro-mensal / fi-infra-mensal, não daqui.
 *
 * INERTE: o seed (seed-scoring-params --versao=6) grava com validFrom 2099-01-01 FIXO; a ativação
 * é um UPDATE do validFrom com OK, depois do dry-run recalcular-analise --versao-params=6 e com o
 * cadastro + informes de Fiagro/FI-Infra já carregados. A v1–v5 registradas não mudam.
 */
import { SCORING_PARAMS_V5 } from '@/services/analiseAtivos/params/scoringParamsV5';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

/** validFrom do seed da v6 (fixo: nunca new Date()). */
export const VALID_FROM_SCORING_V6 = '2099-01-01T00:00:00.000Z';

function criarV6(): ScoringParams {
  const p = structuredClone(SCORING_PARAMS_V5);
  p.versao = 6;
  p.descricao =
    'v5 com Fiagro e FI-Infra listados no Quadro, analisados como FII de papel (decisão de 04/11/2026). Percentuais em pontos percentuais.';
  p.universo = { ...p.universo, fiagroForaDoMvp: false };
  return p;
}

export const SCORING_PARAMS_V6: ScoringParams = criarV6();
