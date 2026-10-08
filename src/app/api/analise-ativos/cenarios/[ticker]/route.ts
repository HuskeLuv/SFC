import { NextRequest, NextResponse } from 'next/server';
import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import { exigirRecursoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { CenarioPutSchema, TICKER_RE } from '@/services/analiseAtivos/cenarios/contrato';
import {
  apagarCenario,
  lerCenario,
  salvarCenario,
  type ValoresDoAtivo,
} from '@/services/analiseAtivos/cenarios/cenarioService';
import {
  obterBaseCenarios,
  type BaseCenariosResposta,
} from '@/services/analiseAtivos/leitura/ativo/baseCenarios';
import type {
  CenarioDeleteResposta,
  CenarioPutResposta,
  CenariosResposta,
} from '@/types/analiseAtivosBlocoD';
import type { Estado } from '@/types/analiseAtivosApi';

/**
 * /api/analise-ativos/cenarios/[ticker] — Meus cenários (Bloco D, fatia B; decisão 7).
 *
 * - GET → CenariosResposta (no-store): base do ativo (sem dado do usuário) + o cenário salvo do
 *   usuário LOGADO (payload.id). Consultor agindo pelo cliente: 200 com salvo = null, podeSalvar =
 *   false e motivoSemSalvar = 'consultor' — a calculadora funciona com a base (e com a posição do
 *   cliente, que vem do overlay da Carteira), mas nada pessoal é lido.
 * - PUT (CSRF) → {atualizadoEm}: CenarioPutSchema (strict, limites); classe ≠ do ativo ⇒ 400;
 *   consultor ⇒ 403; criação do 301º cenário do usuário ⇒ 409.
 * - DELETE (CSRF) → {ok:true}, idempotente ("Restaurar valores do ativo"); consultor ⇒ 403.
 * - Flag ANALISE_ATIVOS_CENARIOS_HABILITADO desligada, área fechada ou fora do beta ⇒ 404
 *   (exigirRecursoAnalise); ticker inválido ou fora da área ⇒ 404. Só lê o banco.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ticker: string }> };

const NO_STORE = { 'Cache-Control': 'no-store' };
const MENSAGEM_CENARIO_PESSOAL = 'Os cenários salvos são pessoais';

async function tickerDe(ctx: Ctx): Promise<{ symbol: string; base: BaseCenariosResposta }> {
  const { ticker: bruto } = await ctx.params;
  let symbol = '';
  try {
    symbol = decodeURIComponent(bruto ?? '')
      .trim()
      .toUpperCase();
  } catch {
    symbol = '';
  }
  const base = TICKER_RE.test(symbol) ? await obterBaseCenarios(symbol) : null;
  if (!base) throw new ApiError(404, 'Ativo não encontrado');
  return { symbol, base };
}

function valor(e: Estado<number>): number | null {
  return e.estado === 'ok' ? e.valor : null;
}

/** Valores do ativo por campo dos cenários (o que fica guardado junto dos editados). */
function valoresDoAtivo(base: BaseCenariosResposta): ValoresDoAtivo {
  if (base.classe === 'fii') {
    return { rend12m: valor(base.base.rend12m), vpCota: valor(base.base.vpCota) };
  }
  return { lpa: valor(base.base.lpa), vpa: valor(base.base.vpa), dpa: valor(base.base.dpa) };
}

export const GET = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'cenarios');
  const { symbol, base } = await tickerDe(ctx);
  const consultor = !!actingClient;
  const salvo = consultor ? null : await lerCenario(payload.id, symbol, base.classe);
  const corpo = {
    ...base,
    salvo,
    podeSalvar: !consultor,
    motivoSemSalvar: consultor ? 'consultor' : null,
  } as CenariosResposta;
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const PUT = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'cenarios');
  if (actingClient) throw new ApiError(403, MENSAGEM_CENARIO_PESSOAL);
  const { symbol, base } = await tickerDe(ctx);
  const parsed = CenarioPutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'Dados inválidos', {
      campos: parsed.error.issues.map((i) => i.path.join('.')),
    });
  }
  if (parsed.data.classe !== base.classe) {
    throw new ApiError(400, 'A classe do cenário não é a do ativo');
  }
  const corpo: CenarioPutResposta = await salvarCenario(
    payload.id,
    symbol,
    parsed.data,
    valoresDoAtivo(base),
  );
  return NextResponse.json(corpo, { headers: NO_STORE });
});

export const DELETE = withErrorHandler(async (request: NextRequest, ctx: Ctx) => {
  const { payload, actingClient } = await exigirRecursoAnalise(request, 'cenarios');
  if (actingClient) throw new ApiError(403, MENSAGEM_CENARIO_PESSOAL);
  const { symbol } = await tickerDe(ctx);
  await apagarCenario(payload.id, symbol);
  const corpo: CenarioDeleteResposta = { ok: true };
  return NextResponse.json(corpo, { headers: NO_STORE });
});
