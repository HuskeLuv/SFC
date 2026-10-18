import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import {
  exigirAcessoAnalise,
  exigirRecursoAnalise,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  ObjetivoPutSchema,
  assetDoTicker,
  assetEuaDoUsuario,
  classeEuaDoTicker,
  criarAssetEuaPlanejado,
  lerObjetivoAtivo,
  removerObjetivoAtivo,
  salvarObjetivoAtivo,
  type AssetAlvo,
} from '@/services/analiseAtivos/carteira/objetivoAtivo';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';
import type { ClasseEua } from '@/types/analiseAtivosApi';
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
 * - Stocks/REITs (EUA, fatia D): ticker só de letras (AAPL, BRK.B, BRK-B → BRK.B) é EUA — B3 sempre
 *   tem dígito. Sem ANALISE_ATIVOS_EUA_HABILITADO → 404 antes da sessão; fora do cadastro da SEC →
 *   404. O Asset é o MANUAL do usuário (posição ou planejado, tickerCarteiraEua); sem nenhum, o GET
 *   devolve alvo null, o DELETE removido=false e o PUT cria o Asset manual planejado na aba
 *   Stocks/REIT's (na seção pedida).
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

const TICKER_RE = /^[A-Z0-9]{4,12}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const ENDPOINT = '/api/analise-ativos/alvos';

interface Contexto {
  auth: Awaited<ReturnType<typeof exigirAcessoAnalise>>;
  symbol: string;
  /** null só no EUA: o usuário ainda não tem nem planejou o ticker */
  asset: AssetAlvo | null;
  /** classe EUA (stock | reit); null no Brasil */
  classeEua: ClasseEua | null;
}

async function contexto(request: NextRequest, ctx: Ctx, method: string): Promise<Contexto> {
  const { ticker: bruto } = await ctx.params;
  const lido = decodeURIComponent(bruto ?? '')
    .trim()
    .toUpperCase();
  const eua = ehTickerEua(lido);
  const auth = eua
    ? await exigirRecursoAnalise(request, 'eua')
    : await exigirAcessoAnalise(request);
  const { payload, targetUserId, actingClient } = auth;
  const symbol = eua ? symbolAnaliseDaSec(lido) : lido;
  let asset: AssetAlvo | null;
  let classeEua: ClasseEua | null = null;
  if (eua) {
    classeEua = await classeEuaDoTicker(symbol);
    if (!classeEua) throw new ApiError(404, 'Ativo não encontrado');
    asset = await assetEuaDoUsuario(targetUserId, symbol);
  } else {
    if (!TICKER_RE.test(symbol)) throw new ApiError(404, 'Ativo não encontrado');
    asset = await assetDoTicker(symbol);
    if (!asset) throw new ApiError(404, 'Ativo não encontrado');
  }
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
  return { auth, asset, symbol, classeEua };
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { auth, asset, symbol } = await contexto(request, ctx, 'GET');
  const corpo: AlvoGetResposta = {
    ticker: symbol,
    alvo: asset ? await lerObjetivoAtivo(auth.targetUserId, asset) : null,
  };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const PUT = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { auth, asset: lido, symbol, classeEua } = await contexto(request, ctx, 'PUT');
  const parsed = ObjetivoPutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, issue?.message ?? 'Dados inválidos', {
      objetivoPct: parsed.error.issues.map((i) => i.message),
    });
  }
  // EUA sem posição nem plano: nasce o Asset manual planejado (depois da validação do corpo).
  const asset = lido ?? (await criarAssetEuaPlanejado(classeEua as ClasseEua, symbol));
  const { objetivo, criado } = await salvarObjetivoAtivo(request, auth, asset, parsed.data);
  const corpo: AlvoPutResposta = { ticker: symbol, alvo: objetivo, criado };
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { auth, asset, symbol } = await contexto(request, ctx, 'DELETE');
  const { removido, origem } = asset
    ? await removerObjetivoAtivo(request, auth, asset)
    : { removido: false, origem: null };
  const corpo: AlvoDeleteResposta = { ticker: symbol, removido, origem };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
