/**
 * Leitura dos critérios de fundamentos (criteria_eval) — CONTRATO da fatia 0, CORPO da fatia A.
 *
 * Assinaturas FINAIS (as fatias B, C1, C2 e D programam contra elas):
 *  - obterCriteriosAtivo(prisma, symbol) → CriteriosAtivo | null — as 3 janelas de UM ativo, com
 *    rótulo/definição/formato/unidade dos critérios do perfil (criteria_params da paramsVersion da
 *    avaliação), para AtivoTopoResposta.criterios (C2). null = ativo sem avaliação. Cache em memória
 *    com TTL (CRITERIOS_TTL_MS) por symbol.
 *  - obterCriteriosVarios(prisma, symbols, janela) → Map<symbol, CriteriosLinhaApi> — UMA janela de
 *    vários ativos (pares da C2, sugestões do Comparar da C1, Comparador da D). Symbol sem avaliação
 *    não entra no Map.
 *  - projetarCriteriosCompactos(compactos, janela, perfil) → CriteriosLinhaApi | null — projeção PURA
 *    da cópia compacta de AnaliseQuadroLinha.criterios (B: linhasQuadro). Implementada aqui (fatia 0)
 *    porque o formato compacto é contrato.
 *
 * Nenhuma função chama provedor externo; só o banco (criteria_eval / criteria_params).
 * Até a fatia A preencher, obterCriteriosAtivo devolve null e obterCriteriosVarios um Map vazio
 * (a tela trata como "sem avaliação"): nada quebra se alguém chamar antes da hora.
 */
import type { PrismaClient } from '@prisma/client';
import type {
  ChaveJanela,
  CriteriosAtivo,
  CriteriosCompactos,
  CriteriosLinhaApi,
  Janela,
  PerfilCriterio,
} from '@/types/analiseAtivosCriterios';

/** TTL do cache de obterCriteriosAtivo (o job grava 1×/dia). */
export const CRITERIOS_TTL_MS = 10 * 60 * 1000;

export type PrismaCriterios = Pick<PrismaClient, 'criteriaEval' | 'criteriaParams'>;

/** STUB (fatia A preenche): critérios das 3 janelas de um ativo. */
export async function obterCriteriosAtivo(
  _prisma: PrismaCriterios,
  _symbol: string,
): Promise<CriteriosAtivo | null> {
  return null;
}

/** STUB (fatia A preenche): uma janela de vários ativos. */
export async function obterCriteriosVarios(
  _prisma: PrismaCriterios,
  _symbols: readonly string[],
  _janela: Janela,
): Promise<Map<string, CriteriosLinhaApi>> {
  return new Map();
}

/** Limpa o cache em memória (testes e job 'criterios' ao terminar). STUB até a fatia A. */
export function limparCacheCriterios(): void {}

/**
 * Projeção pura da cópia compacta (AnaliseQuadroLinha.criterios) numa janela. Devolve null quando a
 * linha não tem a janela (job ainda não rodou ou JSON inválido).
 */
export function projetarCriteriosCompactos(
  compactos: unknown,
  janela: Janela,
  perfil: PerfilCriterio | null,
): CriteriosLinhaApi | null {
  if (!perfil || !compactos || typeof compactos !== 'object') return null;
  const j = (compactos as CriteriosCompactos)[String(janela) as ChaveJanela];
  if (!j || !Array.isArray(j.m)) return null;
  return {
    janela,
    perfil,
    n: j.n,
    de: j.de,
    marcas: j.m.map(([id, estado, fato]) => ({ id, estado, fato })),
  };
}
