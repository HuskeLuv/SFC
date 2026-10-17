import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { ItemPostSchema } from '@/services/analiseAtivos/salvos/contrato';
import {
  NO_STORE,
  adicionarItem,
  exigirPessoal,
  lerCorpo,
  lerId,
  resolverAtivo,
} from '@/services/analiseAtivos/salvos/listasService';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';

/**
 * POST /api/analise-ativos/listas/[id]/itens {ticker} (CSRF) — põe um ativo na lista.
 * 201 {ticker, classe, adicionadoEm} quando entra; 200 quando já estava (idempotente: o Desfazer do
 * "removido" reenvia). Ticker no formato do bloco 1 e com linha no Quadro (a classe vem da linha;
 * sem linha → 404). Limites 200 por lista e 500 por usuário → 409. Consultor → 403.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const { id: bruto } = await ctx.params;
  const id = lerId(bruto, TEXTOS_SALVOS.servidor.listaNaoEncontrada);
  const body = await lerCorpo(request, ItemPostSchema);
  const ativo = await resolverAtivo(body.ticker);
  const { criado, item } = await adicionarItem(payload.id, id, ativo);
  return NextResponse.json(item, { status: criado ? 201 : 200, headers: NO_STORE });
});
