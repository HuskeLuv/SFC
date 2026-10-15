import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { sugestoesComparar } from '@/services/analiseAtivos/leitura/ativo/sugestoesComparar';
import { JANELA_PADRAO, ehJanela } from '@/types/analiseAtivosCriterios';

/**
 * GET /api/analise-ativos/ativos/[ticker]/comparar-sugestoes?q=&janela= → SugestoesCompararResposta
 * (modal "Comparar" da página do ativo, fatia C1). Pares primeiro, depois A–Z; em FII só o mesmo
 * perfil; nunca o próprio ativo; até 8 (12 com q).
 * - exigirRecursoAnalise('comparador'): 404 com a área ou o Comparador desligados, 401 sem sessão,
 *   404 fora do beta (o modal só existe com o Comparador ligado);
 * - zod: q ≤ 40 caracteres; janela 3 | 5 | 10 (padrão 5); ticker no formato da B3 (400);
 * - 404 ticker fora da área. Só o banco; nenhum dado do usuário (private, max-age=300).
 */
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

const querySchema = z.object({
  q: z
    .string()
    .max(40)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  janela: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? JANELA_PADRAO : Number(v)))
    .refine(ehJanela, { message: 'janela deve ser 3, 5 ou 10' }),
});

type Ctx = { params: Promise<{ ticker: string }> };

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  await exigirRecursoAnalise(request, 'comparador');
  const { ticker } = await ctx.params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!TICKER_RE.test(symbol)) throw new ApiError(400, 'Ticker inválido');

  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    q: sp.get('q') ?? undefined,
    janela: sp.get('janela') ?? undefined,
  });
  if (!parsed.success) throw new ApiError(400, 'Parâmetros inválidos');

  const r = await sugestoesComparar(prisma, {
    ticker: symbol,
    janela: parsed.data.janela,
    q: parsed.data.q,
  });
  if (!r) throw new ApiError(404, 'Ativo não encontrado');
  return NextResponse.json(r, { headers: { 'Cache-Control': 'private, max-age=300' } });
});
