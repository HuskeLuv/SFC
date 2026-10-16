import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  exigirRecursoAnalise,
  flagsRecursosBlocoD,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import { ListaPostSchema } from '@/services/analiseAtivos/salvos/contrato';
import {
  NO_STORE,
  criarLista,
  exigirPessoal,
  lerCorpo,
  listarListas,
  permissaoSalvos,
  resolverAtivo,
} from '@/services/analiseAtivos/salvos/listasService';
import type { ListasResposta, ResumoLista } from '@/types/analiseAtivosSalvos';

/**
 * /api/analise-ativos/listas — Salvos (bloco 1, fatia A).
 *
 * - GET → ListasResposta (ordem de criação, contagem por classe, limites, podeSalvar).
 * - POST {nome, tickerInicial?, alertas?} (CSRF) → 201 ResumoLista; 409 nome repetido ou 21ª lista.
 * - exigirRecursoAnalise('salvos'): flag desligada → 404 ANTES da sessão; sem sessão → 401.
 * - PESSOAL: sempre payload.id. Consultor agindo pelo cliente → GET vazio (podeSalvar=false) e
 *   POST 403 'As listas são pessoais'. no-store.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  const consultor = Boolean(actingClient);
  const corpo: ListasResposta = {
    listas: consultor ? [] : await listarListas(payload.id),
    ...permissaoSalvos(consultor),
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const body = await lerCorpo(request, ListaPostSchema);
  const item = body.tickerInicial ? await resolverAtivo(body.tickerInicial) : undefined;
  const corpo: ResumoLista = await criarLista(
    payload.id,
    { nome: body.nome, alertas: body.alertas, item },
    flagsRecursosBlocoD().alertas,
  );
  return NextResponse.json(corpo, { status: 201, headers: NO_STORE });
});
