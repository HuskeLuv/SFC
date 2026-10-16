import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  NO_STORE,
  exigirPessoal,
  lerId,
  lerTicker,
  removerItem,
} from '@/services/analiseAtivos/salvos/listasService';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { OkResposta } from '@/types/analiseAtivosSalvos';

/**
 * DELETE /api/analise-ativos/listas/[id]/itens/[ticker] (CSRF) — tira o ativo da lista (o '×' da
 * tabela Salvos, com Desfazer no toast). Idempotente; NÃO confere o Quadro (um item que saiu do
 * Quadro precisa poder ser removido). Lista de outro usuário → 404; consultor → 403.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; ticker: string }> };

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'salvos');
  exigirPessoal(actingClient);
  const { id: bruto, ticker } = await ctx.params;
  const id = lerId(bruto, TEXTOS_SALVOS.servidor.listaNaoEncontrada);
  await removerItem(payload.id, id, lerTicker(ticker));
  const corpo: OkResposta = { ok: true };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
