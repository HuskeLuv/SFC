import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import {
  moverInvestimentoSchema,
  moverOpcoesQuerySchema,
  type MoverResponse,
} from '@/lib/carteiraMover';
import {
  MSG_NAO_ENCONTRADO,
  moverInvestimento,
  obterOpcoesMover,
  restaurarOriginal,
} from '@/services/portfolio/moverInvestimento';
import {
  recordInvestimentoMovido,
  recordPlanejadoMovido,
  recordRestaurado,
} from '@/services/changeHistory';
import { invalidarContextoUsuario } from '@/services/assistente/contexto';
import { invalidateCaixaCaches } from '@/services/portfolio/caixaParaInvestir';

/**
 * Mover investimentos entre abas e seções da Carteira (out/2026). Contrato em
 * src/lib/carteiraMover.ts; regras em services/portfolio/moverInvestimento.ts.
 *
 * GET  /api/carteira/mover?tipo=posicao|planejado&id=[&saude=1] → MoverOpcoesResponse
 * POST /api/carteira/mover  { acao:'mover', tipo, id, categoria, subgrupo }
 *                         | { acao:'restaurar', tipo, id }        → MoverResponse
 *
 * Posse por targetUserId (404 para item de outro usuário). Consultor agindo
 * pode mover: o histórico grava viaConsultant. CSRF pelo middleware.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const { searchParams } = new URL(request.url);
  const parsed = moverOpcoesQuerySchema.safeParse({
    tipo: searchParams.get('tipo') ?? undefined,
    id: searchParams.get('id') ?? undefined,
  });
  if (!parsed.success) return validationError(parsed);

  // `saude=1`: inclui a prévia da Saúde Financeira (pesada; opcional — ver obterOpcoesMover).
  const opcoes = await obterOpcoesMover(targetUserId, parsed.data.tipo, parsed.data.id, {
    comSaude: searchParams.get('saude') === '1',
  });
  if (!opcoes) throw new ApiError(404, MSG_NAO_ENCONTRADO);
  return NextResponse.json(opcoes);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Dados inválidos');
  }
  const parsed = moverInvestimentoSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const input = parsed.data;

  const resultado =
    input.acao === 'mover'
      ? await moverInvestimento(targetUserId, input)
      : await restaurarOriginal(targetUserId, input.tipo, input.id);
  if (resultado.noop) {
    const noop: MoverResponse = { ok: true, noop: true };
    return NextResponse.json(noop);
  }

  // Pizza/alocação do resumo (cacheado) e o contexto do assistente mudam de aba.
  invalidateCaixaCaches(targetUserId);
  invalidarContextoUsuario(targetUserId);

  const registro = {
    tipo: input.tipo,
    id: resultado.item.row.id,
    asset: resultado.item.asset,
    origem: resultado.origem,
    destino: resultado.destino,
    objetivoZerado: resultado.objetivoZerado,
    antes: resultado.antes,
    depois: resultado.depois,
  };
  const historicoId =
    input.acao === 'restaurar'
      ? await recordRestaurado(request, auth, registro)
      : input.tipo === 'posicao'
        ? await recordInvestimentoMovido(request, auth, registro)
        : await recordPlanejadoMovido(request, auth, registro);

  const resposta: MoverResponse = {
    ok: true,
    origem: resultado.origem,
    destino: resultado.destino,
    objetivoZerado: resultado.objetivoZerado,
    historicoId,
  };
  return NextResponse.json(resposta);
});
