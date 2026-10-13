'use client';

/**
 * STUB da fatia 0 — CORPO da fatia C1. Hooks dos modais da página do ativo (React Query):
 *  - useSugestoesComparar: GET comparar-sugestoes (queryKeys.analiseAtivos.sugestoesComparar);
 *  - useMutacoesCarteiraAnalise: planejar (POST/PATCH/DELETE /api/carteira/planejados ou
 *    POST /api/carteira/<aba>/objetivo) e registrar (POST /api/carteira/operacao | /resgate), sempre
 *    com csrfFetch e, no sucesso, invalidatePortfolioDerivedQueries + overlay da análise.
 * Assinaturas FINAIS. Ainda não são usados pela tela.
 */
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CorpoCompraOperacao,
  CorpoResgateVenda,
} from '@/services/analiseAtivos/regras/carteira/registroOperacao';
import type { Janela, SugestoesCompararResposta } from '@/types/analiseAtivosCriterios';

export interface PlanoAlvoEntrada {
  ticker: string;
  /** % DENTRO da aba; null/0 = remover do plano */
  objetivoPct: number | null;
}

export interface MutacoesCarteiraAnalise {
  salvarPlano: UseMutationResult<void, Error, PlanoAlvoEntrada>;
  registrarCompra: UseMutationResult<void, Error, CorpoCompraOperacao>;
  registrarVenda: UseMutationResult<void, Error, CorpoResgateVenda>;
}

export function useSugestoesComparar(
  _ticker: string,
  _janela: Janela,
  _q: string,
  _habilitado: boolean,
): UseQueryResult<SugestoesCompararResposta> {
  throw new Error('useSugestoesComparar: não implementado (fatia C1)');
}

export function useMutacoesCarteiraAnalise(): MutacoesCarteiraAnalise {
  throw new Error('useMutacoesCarteiraAnalise: não implementado (fatia C1)');
}
