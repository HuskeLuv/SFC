/**
 * STUB da fatia 0 — CORPO da fatia C1 (rota GET /api/analise-ativos/ativos/[ticker]/comparar-
 * sugestoes). Pares primeiro, depois A–Z; em FII só o mesmo tipo; nunca o próprio ativo; até 8 (12
 * com q). Critérios via obterCriteriosVarios (lerCriterios). Só banco; nenhum dado do usuário.
 * Assinatura FINAL.
 */
import type { PrismaClient } from '@prisma/client';
import type { Janela, SugestoesCompararResposta } from '@/types/analiseAtivosCriterios';

export async function sugestoesComparar(
  _prisma: PrismaClient,
  _e: { ticker: string; janela: Janela; q: string | null },
): Promise<SugestoesCompararResposta | null> {
  throw new Error('sugestoesComparar: não implementado (fatia C1)');
}
