import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterSocietario } from '@/services/analiseAtivos/leitura/ativo/societarioAtivo';

/**
 * GET /api/analise-ativos/ativos/[ticker]/societario → SocietarioResposta (A6, item 6; card "Dados
 * societários e estatuto"; preguiçoso). Só o banco (job cvm-fre-societario; nenhum provedor
 * externo na requisição). ANALISE_ATIVOS_SOCIETARIO_HABILITADO desligada ⇒ 404 antes da sessão;
 * 400 formato; 404 sem acesso, ticker fora da área ou que não é ação (FII). Cache em memória por
 * ticker (30 min) + private, max-age=300.
 */
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const inicio = performance.now();
  await exigirRecursoAnalise(request, 'societario');
  const { ticker } = await ctx.params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!TICKER_RE.test(symbol)) throw new ApiError(400, 'Ticker inválido');
  const r = await obterSocietario(symbol);
  if (!r) throw new ApiError(404, 'Ativo não encontrado');
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(r.dados, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `societario;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`,
    },
  });
});
