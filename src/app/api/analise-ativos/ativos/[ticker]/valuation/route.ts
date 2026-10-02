import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterValuation } from '@/services/analiseAtivos/leitura/ativo/valuationMultiplos';

/**
 * GET /api/analise-ativos/ativos/[ticker]/valuation → ValuationResposta (Valuation · Múltiplos,
 * múltiplos históricos e pares; preguiçoso). Só o banco (nenhum provedor externo). 400 formato;
 * 404 sem acesso ou ticker fora da área. Cache em memória por ticker:versão (30 min) + private,
 * max-age=300. Server-Timing diz se veio do cache ou do banco.
 */
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const inicio = performance.now();
  await exigirAcessoAnalise(request);
  const { ticker } = await ctx.params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!TICKER_RE.test(symbol)) throw new ApiError(400, 'Ticker inválido');
  const r = await obterValuation(symbol);
  if (!r) throw new ApiError(404, 'Ativo não encontrado');
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(r.dados, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `valuation;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`,
    },
  });
});
