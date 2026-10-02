import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { montarTopoAtivo } from '@/services/analiseAtivos/leitura/ativo/montarTopoAtivo';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

/**
 * GET /api/analise-ativos/ativos/[ticker] — topo da página do ativo numa chamada
 * (AtivoTopoResposta). Só banco: nenhum provedor externo no caminho da requisição.
 * - 404 sem acesso (flag/beta, exigirAcessoAnalise) ou ticker fora da área;
 * - 400 ticker em formato inválido;
 * - Cache-Control: private, max-age=300 (cache do servidor por ticker:versão, 30 min);
 * - Server-Timing com o tempo de montagem.
 */
export const dynamic = 'force-dynamic';

/** Ticker de ação/FII da B3 (WEGE3, KLBN11, HGLG11). */
const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  await exigirAcessoAnalise(request);
  const { ticker: bruto } = await ctx.params;
  const ticker = decodeURIComponent(bruto ?? '').toUpperCase();
  if (!TICKER_RE.test(ticker)) throw new ApiError(400, 'Ticker inválido');

  const inicio = performance.now();
  const topo = await montarTopoAtivo(ticker);
  const ms = performance.now() - inicio;
  if (!topo) throw new ApiError(404, TEXTOS_TELA.ativo.naoEncontrado);

  return NextResponse.json(topo, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `topo;dur=${ms.toFixed(1)}`,
    },
  });
});
