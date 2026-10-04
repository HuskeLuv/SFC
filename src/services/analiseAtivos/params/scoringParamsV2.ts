/**
 * ScoringParams versão 2 — bloco C da Análise de Ativos (03/10/2026): a v1 SEM NENHUMA outra
 * mudança + `sanidade.conferencia.ligada = true` (regras de sanidade "em conferência" por grupo,
 * regras/comum/conferencia.ts; limiares em CONFERENCIA_PADRAO, de
 * docs/analise-ativos/blocoC/spec-desenho.json → regras_sanidade + decisoes.md).
 *
 * NÃO é semeada por padrão: `seed-scoring-params.ts` só grava a v2 com `--versao=2 --apply`, e
 * gravar a v2 com validFrom ≤ agora a torna a versão ATIVA (obterScoringParams pega a maior). Em
 * produção isso exige OK do Wellington, depois do dry-run `recalcular-analise --versao-params=2`
 * (docs/analise-ativos/blocoC/ATIVACAO.md). Versões são imutáveis: recalibrar = v3.
 */
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

function criarV2(): ScoringParams {
  const p = structuredClone(SCORING_PARAMS_V1);
  p.versao = 2;
  p.descricao =
    'v1 + bloco C (03/10/2026): regras de sanidade "em conferência" por grupo ligadas (sanidade.conferencia.ligada=true; docs/analise-ativos/blocoC/decisoes.md). Percentuais em pontos percentuais.';
  p.sanidade.conferencia.ligada = true;
  return p;
}

export const SCORING_PARAMS_V2: ScoringParams = criarV2();
