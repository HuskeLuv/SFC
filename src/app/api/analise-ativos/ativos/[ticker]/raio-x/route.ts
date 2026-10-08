import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { obterRaioX } from '@/services/analiseAtivos/leitura/ativo/raioX';
import { hojeSaoPaulo } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import { gerarCsvRaioX } from '@/services/analiseAtivos/regras/raioX/csvRaioX';
import {
  FormatoRaioXSchema,
  TICKER_RE,
  nomeArquivoCsvRaioX,
} from '@/services/analiseAtivos/cenarios/contrato';

/**
 * GET /api/analise-ativos/ativos/[ticker]/raio-x → RaioXResposta (Fundamentos · Raio-X, Bloco D).
 * GET …/raio-x?formato=csv → o CSV (decisão 13: raio-x_<TICKER>_<AAAA-MM-DD>.csv, ';', vírgula
 * decimal, BOM, CRLF, proteção contra fórmula), gerado aqui no servidor.
 *
 * Só o banco (nenhum provedor externo) e nenhum dado do usuário. exigirRecursoAnalise('raioX'):
 * flag ANALISE_ATIVOS_RAIOX_HABILITADO desligada, área desligada ou usuário sem acesso → 404; sem
 * sessão → 401. Ticker fora do padrão ou formato inválido → 400; fora da área → 404. Rate limit no
 * middleware (balde próprio do Raio-X, 30/min por IP). Cache em memória limitado por ticker:versão
 * + private, max-age=300.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const inicio = performance.now();
  await exigirRecursoAnalise(request, 'raioX');
  const { ticker } = await ctx.params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!TICKER_RE.test(symbol)) throw new ApiError(400, 'Ticker inválido');
  const formato = FormatoRaioXSchema.safeParse(
    request.nextUrl.searchParams.get('formato') ?? 'json',
  );
  if (!formato.success) throw new ApiError(400, 'Formato inválido');

  const hoje = hojeSaoPaulo();
  const r = await obterRaioX(symbol, hoje);
  if (!r) throw new ApiError(404, 'Ativo não encontrado');
  const dur = (performance.now() - inicio).toFixed(1);
  const timing = `raiox;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`;

  if (formato.data === 'csv') {
    const nome = nomeArquivoCsvRaioX(r.dados.ticker, hoje);
    const corpo = gerarCsvRaioX(r.dados, { hoje, versaoParams: r.paramsVersion });
    return new NextResponse(corpo, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nome}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=300',
        'Server-Timing': timing,
      },
    });
  }
  return NextResponse.json(r.dados, {
    headers: { 'Cache-Control': 'private, max-age=300', 'Server-Timing': timing },
  });
});
