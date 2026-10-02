import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterLinhaQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  TesePutSchema,
  apagarTese,
  lerTese,
  salvarTese,
} from '@/services/analiseAtivos/tese/teseService';
import type { TeseDeleteResposta, TesePutResposta } from '@/types/analiseAtivosApi';

/**
 * /api/analise-ativos/teses/[ticker] — tese PRIVADA (fatia D, decisão 2).
 *
 * - GET → TeseResposta · PUT {corpo} (CSRF) → {atualizadoEm} · DELETE (CSRF) → {ok:true}.
 * - Sempre o usuário LOGADO (payload.id): o targetUserId nunca é usado aqui. Consultor agindo pelo
 *   cliente → 403 'A tese é pessoal' (não lê nem grava a do cliente, nem a dele nesse modo).
 * - Flag desligada / fora do beta → 404 (exigirAcessoAnalise); ticker fora da área → 404.
 * - CSRF: o middleware valida PUT/DELETE. Rate limit: o balde do middleware é por 4 segmentos,
 *   então '/api/analise-ativos/teses' tem prefixo próprio, separado dos GETs da página.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

const TICKER_RE = /^[A-Z0-9]{4,12}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };

async function contexto(request: NextRequest, ctx: Ctx) {
  const { payload, actingClient } = await exigirAcessoAnalise(request);
  if (actingClient) throw new ApiError(403, 'A tese é pessoal');
  const { ticker: bruto } = await ctx.params;
  const symbol = decodeURIComponent(bruto ?? '')
    .trim()
    .toUpperCase();
  if (!TICKER_RE.test(symbol) || !(await obterLinhaQuadro(symbol))) {
    throw new ApiError(404, 'Ativo não encontrado');
  }
  return { userId: payload.id, symbol };
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, symbol } = await contexto(request, ctx);
  return NextResponse.json(await lerTese(userId, symbol), { headers: NO_STORE });
});

export const PUT = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, symbol } = await contexto(request, ctx);
  const parsed = TesePutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, issue?.message ?? 'Dados inválidos', {
      corpo: parsed.error.issues.map((i) => i.message),
    });
  }
  const corpo: TesePutResposta = await salvarTese(userId, symbol, parsed.data.corpo);
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, symbol } = await contexto(request, ctx);
  await apagarTese(userId, symbol);
  const corpo: TeseDeleteResposta = { ok: true };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
