import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  AlvoPutSchema,
  apagarAlvo,
  assetDoTicker,
  lerAlvo,
  salvarAlvo,
} from '@/services/analiseAtivos/carteira/alvosAtivo';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import type {
  AlvoDeleteResposta,
  AlvoGetResposta,
  AlvoPutResposta,
} from '@/types/analiseAtivosApi';

/**
 * /api/analise-ativos/alvos/[ticker] — alvo por ativo do "Planejar na carteira" (v2.5, spec §3.2/
 * §5, caso 33), em % da carteira TOTAL, gravado em planning_asset_targets.
 *
 * - GET → AlvoGetResposta (alvo null quando não há) · PUT {targetPct} (zod strict, CSRF) →
 *   AlvoPutResposta (upsert, idempotente) · DELETE (CSRF) → AlvoDeleteResposta (removido=false
 *   quando não havia).
 * - targetUserId: o consultor agindo pelo cliente lê e grava o alvo DO CLIENTE; o acesso fica
 *   registrado (logSensitiveEndpointAccess) e a gravação leva atualizadoPorUserId = consultor.
 * - Flag desligada / fora do beta → 404 (exigirAcessoAnalise); ticker inválido ou sem Asset → 404.
 * - Não lê nem grava o Objetivo da Carteira. CSRF: o middleware valida PUT/DELETE.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

const TICKER_RE = /^[A-Z0-9]{4,12}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const ENDPOINT = '/api/analise-ativos/alvos';

async function contexto(request: NextRequest, ctx: Ctx, method: string) {
  const { payload, targetUserId, actingClient } = await exigirAcessoAnalise(request);
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
  return {
    userId: targetUserId,
    assetId: asset.id,
    symbol,
    atualizadoPor: actingClient ? payload.id : null,
  };
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, assetId, symbol } = await contexto(request, ctx, 'GET');
  const corpo: AlvoGetResposta = { ticker: symbol, alvo: await lerAlvo(userId, assetId) };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const PUT = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, assetId, symbol, atualizadoPor } = await contexto(request, ctx, 'PUT');
  const parsed = AlvoPutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, issue?.message ?? 'Dados inválidos', {
      targetPct: parsed.error.issues.map((i) => i.message),
    });
  }
  const alvo = await salvarAlvo(userId, assetId, parsed.data.targetPct, atualizadoPor);
  const corpo: AlvoPutResposta = { ticker: symbol, alvo };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { userId, assetId, symbol } = await contexto(request, ctx, 'DELETE');
  const corpo: AlvoDeleteResposta = { ticker: symbol, removido: await apagarAlvo(userId, assetId) };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
