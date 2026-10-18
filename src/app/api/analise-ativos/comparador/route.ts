import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise, flagsEua } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { MAX_CARACTERES_PARAM_T } from '@/services/analiseAtivos/cenarios/contrato';
import {
  ErroMisturaEua,
  montarComparador,
} from '@/services/analiseAtivos/leitura/comparador/montarComparador';
import { JANELA_PADRAO, ehJanela } from '@/types/analiseAtivosCriterios';

/**
 * GET /api/analise-ativos/comparador?t=WEGE3,ITUB4&janela=5 → ComparadorResposta (v2.4, fatia D).
 * - exigirRecursoAnalise('comparador'): 404 com a flag desligada (antes da sessão), 401 sem sessão,
 *   404 sem acesso à área.
 * - t: até MAX_CARACTERES_PARAM_T caracteres; nenhum ticker de formato válido ⇒ 400. Dedupe,
 *   até 4, classe do 1º ticker; o resto vai em `ignorados` com o motivo.
 * - janela: 3 | 5 | 10 (padrão 5); outro valor ⇒ 400.
 * - Resposta isonômica: critérios + indicadores lado a lado + "Leitura dos dados" (contagens e o
 *   literal). Nenhuma chave de Índice, semáforo ou marca de valor.
 * - Só o banco, em lote; cache limitado no servidor + private, max-age=300. Sem dado do usuário.
 * - Rate limit: tier próprio de 30/min (src/lib/rateLimit.ts).
 * - Stocks e REITs (fatia C): tickers EUA só com ANALISE_ATIVOS_EUA_HABILITADO (sem a chave, nada
 *   muda); até 4 da MESMA classe stock|reit — misturar com outra classe = 400 (sem vencedor).
 */
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  t: z.string().max(MAX_CARACTERES_PARAM_T),
  janela: z
    .string()
    .nullable()
    .transform((v, ctx) => {
      if (v === null) return JANELA_PADRAO;
      const n = /^\d{1,2}$/.test(v) ? Number(v) : NaN;
      if (!ehJanela(n)) {
        ctx.addIssue({ code: 'custom', message: 'janela inválida' });
        return z.NEVER;
      }
      return n;
    }),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const inicio = performance.now();
  await exigirRecursoAnalise(request, 'comparador');
  const sp = request.nextUrl.searchParams;
  const q = QuerySchema.safeParse({ t: sp.get('t') ?? '', janela: sp.get('janela') });
  if (!q.success) {
    const janelaInvalida = q.error.issues.some((i) => i.path[0] === 'janela');
    throw new ApiError(400, janelaInvalida ? 'Parâmetro janela inválido' : 'Parâmetro t inválido');
  }
  const { eua, euaPreco } = flagsEua();
  let r: Awaited<ReturnType<typeof montarComparador>>;
  try {
    r = await montarComparador(q.data.t.split(','), undefined, q.data.janela, {
      eua: { habilitado: eua, preco: euaPreco },
    });
  } catch (error: unknown) {
    if (error instanceof ErroMisturaEua) throw new ApiError(400, error.message);
    throw error;
  }
  if (!r) throw new ApiError(400, 'Nenhum ticker válido');
  const dur = (performance.now() - inicio).toFixed(1);
  return NextResponse.json(r.dados, {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `comparador;desc="${r.cache ? 'cache' : 'banco'}";dur=${dur}`,
    },
  });
});
