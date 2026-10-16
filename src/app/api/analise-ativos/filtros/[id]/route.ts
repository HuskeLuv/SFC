import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { FiltroPatchSchema } from '@/services/analiseAtivos/salvos/contrato';
import { apagarFiltro, atualizarFiltro } from '@/services/analiseAtivos/salvos/filtrosService';
import {
  NO_STORE,
  exigirPessoal,
  lerCorpo,
  lerId,
} from '@/services/analiseAtivos/salvos/listasService';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { FiltroSalvoApi, OkResposta } from '@/types/analiseAtivosSalvos';

/**
 * /api/analise-ativos/filtros/[id] — PATCH {nome?, estado?, usado?:true} (CSRF) → FiltroSalvoApi
 * ("Salvar alterações", renomear, marcar o uso ao aplicar ?filtro=<id>); DELETE (CSRF) → {ok}.
 * Filtro de outro usuário → 404; nome repetido na classe → 409. Consultor → 403.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function contexto(request: NextRequest, ctx: Ctx) {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const { id } = await ctx.params;
  return { userId: payload.id, id: lerId(id, TEXTOS_SALVOS.servidor.filtroNaoEncontrado) };
}

export const PATCH = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  const body = await lerCorpo(request, FiltroPatchSchema);
  const corpo: FiltroSalvoApi = await atualizarFiltro(userId, id, body);
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, id } = await contexto(request, ctx);
  await apagarFiltro(userId, id);
  const corpo: OkResposta = { ok: true };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
