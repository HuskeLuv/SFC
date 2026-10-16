import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import {
  exigirRecursoAnalise,
  flagsRecursosBlocoD,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import { LinhasListaQuerySchema, ListaPatchSchema } from '@/services/analiseAtivos/salvos/contrato';
import {
  NO_STORE,
  apagarLista,
  atualizarLista,
  exigirPessoal,
  lerCorpo,
  lerId,
  lerQuery,
  obterLista,
} from '@/services/analiseAtivos/salvos/listasService';
import { linhasDaLista } from '@/services/analiseAtivos/salvos/linhasDaLista';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { LinhasListaResposta, OkResposta, ResumoLista } from '@/types/analiseAtivosSalvos';

/**
 * /api/analise-ativos/listas/[id] — uma lista (bloco 1, fatia A).
 *
 * - GET ?classe=acao|fii&janela=&ordem=&dir=&modo= → LinhasListaResposta (linhas do Quadro + Adicionado
 *   em + contagem anterior; itens fora do Quadro em `foraDoQuadro`). Ordem padrão A–Z.
 * - PATCH {nome?, alertas?} (CSRF) → ResumoLista; alertas só com o recurso alertas (senão 400).
 * - DELETE (CSRF) → {ok:true} (itens por cascade).
 * - Lista de outro usuário (ou id inválido) → 404. Consultor agindo → 403 (as listas são pessoais;
 *   a página nem chega aqui, porque o GET /listas devolve vazio).
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const TS = TEXTOS_SALVOS.servidor;

async function contexto(request: NextRequest, ctx: Ctx) {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const { id } = await ctx.params;
  return { userId: payload.id, id: lerId(id, TS.listaNaoEncontrada) };
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  const q = lerQuery(request.nextUrl.searchParams, LinhasListaQuerySchema);
  const lista = await obterLista(userId, id);
  if (!lista) throw new ApiError(404, TS.listaNaoEncontrada);
  const corpo: LinhasListaResposta = await linhasDaLista(userId, lista, q);
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  const body = await lerCorpo(request, ListaPatchSchema);
  if (body.alertas && !flagsRecursosBlocoD().alertas) {
    throw new ApiError(400, TS.alertasDesligados);
  }
  const corpo: ResumoLista = await atualizarLista(userId, id, body);
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  await apagarLista(userId, id);
  const corpo: OkResposta = { ok: true };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
