import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { hojeSaoPaulo } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { obterImoveisFii } from '@/services/analiseAtivos/leitura/ativo/imoveisFii';
import { TICKER_RE } from '@/services/analiseAtivos/cenarios/contrato';

/**
 * GET /api/analise-ativos/ativos/[ticker]/imoveis-fii → ImoveisFiiResposta (A6, itens 1 e 2;
 * fatia A): composição do FII sobre o ativo total + lista de imóveis do último informe trimestral.
 *
 * Só o banco (nenhum provedor externo) e nenhum dado do usuário. exigirRecursoAnalise('imoveisFii'):
 * chave ANALISE_ATIVOS_IMOVEIS_FII_HABILITADO desligada, área desligada ou usuário sem acesso → 404
 * antes da sessão; sem sessão → 401. Ticker fora do padrão → 400; ação, fora da área ou FII sem
 * nenhum informe → 404. Cache em memória por ticker:versão + private, max-age=300.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const inicio = performance.now();
  await exigirRecursoAnalise(request, 'imoveisFii');
  const { ticker } = await ctx.params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!TICKER_RE.test(symbol)) throw new ApiError(400, 'Ticker inválido');

  const r = await obterImoveisFii(symbol, hojeSaoPaulo());
  if (!r) throw new ApiError(404, 'Ativo não encontrado');
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(r.dados, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `imoveisfii;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`,
    },
  });
});
