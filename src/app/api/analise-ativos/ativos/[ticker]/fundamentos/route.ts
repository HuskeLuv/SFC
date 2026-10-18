import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import {
  exigirAcessoAnalise,
  exigirClasseAnalise,
  flagsEua,
} from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterFundamentosEssencial } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { obterFundamentosEssencialEua } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencialEua';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';

/**
 * GET /api/analise-ativos/ativos/[ticker]/fundamentos → FundamentosResposta (Fundamentos ·
 * Essencial, preguiçoso). Só o banco (nenhum provedor externo). 400 formato; 404 sem acesso ou
 * ticker fora da área. Cache em memória por ticker:versão (30 min) + private, max-age=300.
 * Server-Timing diz se veio do cache ou do banco.
 *
 * Stocks e REITs (fatia C): com ANALISE_ATIVOS_EUA_HABILITADO, ticker EUA → Essencial EUA (10-K da
 * SEC, em US$, só as colunas com fonte; colunasPendentes no REIT). Sem a chave, o ticker EUA é 400.
 */
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const inicio = performance.now();
  const { ticker } = await ctx.params;
  const recebido = decodeURIComponent(ticker).toUpperCase();
  const eua = flagsEua().eua && !TICKER_RE.test(recebido) && ehTickerEua(recebido);
  if (eua) await exigirClasseAnalise(request, 'stock');
  else await exigirAcessoAnalise(request);
  if (!eua && !TICKER_RE.test(recebido)) throw new ApiError(400, 'Ticker inválido');
  const r = eua
    ? await obterFundamentosEssencialEua(symbolAnaliseDaSec(recebido))
    : await obterFundamentosEssencial(recebido);
  if (!r) throw new ApiError(404, 'Ativo não encontrado');
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(r.dados, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `fundamentos;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`,
    },
  });
});
