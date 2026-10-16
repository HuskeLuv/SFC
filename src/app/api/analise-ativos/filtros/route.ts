import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { ClasseQuerySchema, FiltroPostSchema } from '@/services/analiseAtivos/salvos/contrato';
import { criarFiltro, listarFiltros } from '@/services/analiseAtivos/salvos/filtrosService';
import {
  NO_STORE,
  exigirPessoal,
  lerCorpo,
  lerQuery,
  permissaoSalvos,
} from '@/services/analiseAtivos/salvos/listasService';
import type { FiltroSalvoApi, FiltrosResposta } from '@/types/analiseAtivosSalvos';

/**
 * /api/analise-ativos/filtros — filtros salvos do Quadro (bloco 1, fatia A).
 *
 * - GET ?classe=acao|fii → FiltrosResposta (critério que saiu da classe é retirado, ajustado=true).
 * - POST {nome, classe, estado} (CSRF) → 201 FiltroSalvoApi; mesmo nome na classe ou 21º → 409;
 *   critério fora dos chips habilitados da classe → 400.
 * - Recurso 'salvos' (404 sem a flag, antes da sessão). Consultor: GET vazio, POST 403.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  const { classe } = lerQuery(request.nextUrl.searchParams, ClasseQuerySchema);
  const consultor = Boolean(actingClient);
  const corpo: FiltrosResposta = {
    filtros: consultor ? [] : await listarFiltros(payload.id, classe),
    ...permissaoSalvos(consultor),
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const body = await lerCorpo(request, FiltroPostSchema);
  const corpo: FiltroSalvoApi = await criarFiltro(payload.id, body);
  return NextResponse.json(corpo, { status: 201, headers: NO_STORE });
});
