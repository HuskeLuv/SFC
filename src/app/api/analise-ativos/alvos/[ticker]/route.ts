import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  ObjetivoPutSchema,
  assetDoTicker,
  lerObjetivoAtivo,
  removerObjetivoAtivo,
  salvarObjetivoAtivo,
} from '@/services/analiseAtivos/carteira/objetivoAtivo';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import type {
  AlvoDeleteResposta,
  AlvoGetResposta,
  AlvoPutResposta,
} from '@/types/analiseAtivosApi';

/**
 * /api/analise-ativos/alvos/[ticker] — "Planejar na carteira" da página do ativo. Desde 17/10/2026
 * lê e grava o OBJETIVO DA CARTEIRA (% dentro da aba): Portfolio.objetivo com posição; linha
 * planejada (Watchlist) sem posição. Ver services/analiseAtivos/carteira/objetivoAtivo.ts.
 *
 * - GET → AlvoGetResposta (alvo null sem posição e sem planejado) · PUT {objetivoPct, secao?}
 *   (zod strict, CSRF) → AlvoPutResposta (criado=true quando a linha planejada nasceu agora) ·
 *   DELETE (CSRF) → AlvoDeleteResposta (posição → objetivo 0; planejado → linha apagada).
 * - Histórico + desfazer iguais aos da Carteira ('objetivo-classe.definir' / 'planejado.*').
 * - targetUserId: o consultor agindo pelo cliente lê e grava o objetivo DO CLIENTE; o acesso fica
 *   registrado (logSensitiveEndpointAccess) e o histórico registra quem gravou.
 * - Flag desligada / fora do beta → 404 (exigirAcessoAnalise); ticker inválido ou sem Asset → 404.
 *   CSRF: o middleware valida PUT/DELETE.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

const TICKER_RE = /^[A-Z0-9]{4,12}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const ENDPOINT = '/api/analise-ativos/alvos';

async function contexto(request: NextRequest, ctx: Ctx, method: string) {
  const auth = await exigirAcessoAnalise(request);
  const { payload, targetUserId, actingClient } = auth;
  const { ticker: bruto } = await ctx.params;
  const symbol = decodeURIComponent(bruto ?? '')
    .trim()
    .toUpperCase();
  if (!TICKER_RE.test(symbol)) throw new ApiError(404, 'Ativo não encontrado');
  const asset = await assetDoTicker(symbol);
  if (!asset) throw new ApiError(404, 'Ativo não encontrado');
  if (actingClient) {
    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      `${ENDPOINT}/${symbol}`,
      method,
    );
  }
  return { auth, asset, symbol };
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { auth, asset, symbol } = await contexto(request, ctx, 'GET');
  const corpo: AlvoGetResposta = {
    ticker: symbol,
    alvo: await lerObjetivoAtivo(auth.targetUserId, asset),
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const PUT = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { auth, asset, symbol } = await contexto(request, ctx, 'PUT');
  const parsed = ObjetivoPutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, issue?.message ?? 'Dados inválidos', {
      objetivoPct: parsed.error.issues.map((i) => i.message),
    });
  }
  const { objetivo, criado } = await salvarObjetivoAtivo(request, auth, asset, parsed.data);
  const corpo: AlvoPutResposta = { ticker: symbol, alvo: objetivo, criado };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { auth, asset, symbol } = await contexto(request, ctx, 'DELETE');
  const { removido, origem } = await removerObjetivoAtivo(request, auth, asset);
  const corpo: AlvoDeleteResposta = { ticker: symbol, removido, origem };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
