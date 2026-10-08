import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { MAX_CARACTERES_PARAM_T } from '@/services/analiseAtivos/cenarios/contrato';
import { montarComparador } from '@/services/analiseAtivos/leitura/comparador/montarComparador';

/**
 * GET /api/analise-ativos/comparador?t=WEGE3,ITUB4 → ComparadorResposta (Bloco D, fatia C).
 * - exigirRecursoAnalise('comparador'): 404 com a flag desligada (antes da sessão), 401 sem sessão,
 *   404 sem acesso à área.
 * - t: até MAX_CARACTERES_PARAM_T caracteres; nenhum ticker de formato válido ⇒ 400. Dedupe,
 *   até 4, classe do 1º ticker; o resto vai em `ignorados` com o motivo.
 * - Só o banco, em lote; cache limitado no servidor + private, max-age=300. Sem dado do usuário.
 * - Rate limit: tier próprio de 30/min (src/lib/rateLimit.ts, fatia 0).
 */
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ t: z.string().max(MAX_CARACTERES_PARAM_T) });

export const GET = withErrorHandler(async (request: NextRequest) => {
  const inicio = performance.now();
  await exigirRecursoAnalise(request, 'comparador');
  const q = QuerySchema.safeParse({ t: request.nextUrl.searchParams.get('t') ?? '' });
  if (!q.success) throw new ApiError(400, 'Parâmetro t inválido');
  const r = await montarComparador(q.data.t.split(','));
  if (!r) throw new ApiError(400, 'Nenhum ticker válido');
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(r.dados, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `comparador;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`,
    },
  });
});
