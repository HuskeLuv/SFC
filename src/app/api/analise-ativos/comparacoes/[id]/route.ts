import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursosAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { ComparacaoPatchSchema } from '@/services/analiseAtivos/salvos/contrato';
import {
  apagarComparacao,
  renomearComparacao,
} from '@/services/analiseAtivos/salvos/comparacoesService';
import {
  NO_STORE,
  exigirPessoal,
  lerCorpo,
  lerId,
} from '@/services/analiseAtivos/salvos/listasService';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ComparacaoSalvaApi, OkResposta } from '@/types/analiseAtivosSalvos';

/**
 * /api/analise-ativos/comparacoes/[id] — PATCH {nome} (CSRF) → ComparacaoSalvaApi; DELETE (CSRF)
 * → {ok}. Recursos salvos + comparador. Comparação de outro usuário → 404; consultor → 403.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function contexto(request: NextRequest, ctx: Ctx) {
  const { payload, actingClient } = await exigirRecursosAnalise(request, ['salvos', 'comparador']);
  exigirPessoal(actingClient);
  const { id } = await ctx.params;
  return { userId: payload.id, id: lerId(id, TEXTOS_SALVOS.servidor.comparacaoNaoEncontrada) };
}

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  const { nome } = await lerCorpo(request, ComparacaoPatchSchema);
  const corpo: ComparacaoSalvaApi = await renomearComparacao(userId, id, nome);
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  await apagarComparacao(userId, id);
  const corpo: OkResposta = { ok: true };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
