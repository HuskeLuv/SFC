import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { SalvosPutSchema } from '@/services/analiseAtivos/salvos/contrato';
import {
  NO_STORE,
  definirSalvo,
  exigirPessoal,
  lerCorpo,
  lerTicker,
  resolverAtivo,
  type AtivoSalvo,
} from '@/services/analiseAtivos/salvos/listasService';
import type { SalvosPutResposta } from '@/types/analiseAtivosSalvos';

/**
 * PUT /api/analise-ativos/salvos/[ticker] {listaIds} (CSRF) — define em quais listas o ativo está.
 *
 * - ['padrao'] (sentinela do 1º clique): 0 listas → cria 'Salvos' com o ativo (listaCriada);
 *   1 lista → essa; 2+ → 400 (o cliente abre "Salvar em…" e manda o conjunto).
 * - [] remove de todas (vale também para um ativo que saiu do Quadro).
 * - Lista de outro usuário → 404; limites → 409; uma transação com a trava do usuário (dois
 *   cliques simultâneos não criam duas 'Salvos'). Consultor → 403.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

export const PUT = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const { ticker } = await ctx.params;
  const symbol = lerTicker(ticker);
  const { listaIds } = await lerCorpo(request, SalvosPutSchema);
  // remover de todas não exige a linha do Quadro (o ativo pode ter saído dele)
  const ativo: AtivoSalvo =
    listaIds.length === 0 ? { symbol, classe: 'acao' } : await resolverAtivo(symbol);
  const corpo: SalvosPutResposta = await definirSalvo(payload.id, ativo, listaIds);
  return NextResponse.json(corpo, { headers: NO_STORE });
});
