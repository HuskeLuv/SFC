/**
 * POST /api/cashflow/lancamento-rapido — "+ Lançar → Despesa ou receita" do celular (PWA fase 2).
 *
 * Mesma gravação do assistente (services/cashflow/lancamentoFluxo), sem token assinado: o servidor
 * resolve a linha na árvore do usuário-alvo, recalcula a prévia e relê cada célula na transação.
 *
 * - `confirmar: false` → { ok, previa } sem escrita.
 * - `confirmar: true` com algum mês diminuindo e sem `aceitaReducao` → 409 com a prévia.
 * - Senão grava → { ok, previa, resultado, changeLogId } (UMA entrada desfazível no histórico).
 *
 * Consultor personificando pode lançar (fica viaConsultant no histórico, como a planilha).
 * CSRF: middleware (POST) + csrfFetch no cliente.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { aplicarLancamento, resolverLancamentoPorItem } from '@/services/cashflow/lancamentoFluxo';
import {
  MSG_REDUCAO_SEM_CONFIRMACAO,
  lancamentoRapidoSchema,
  type PreviaLancamento,
} from '@/lib/cashflow/lancamentoRapidoSchema';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  await logSensitiveEndpointAccess(
    request,
    auth.payload,
    auth.targetUserId,
    auth.actingClient,
    '/api/cashflow/lancamento-rapido',
    'POST',
  );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  const parsed = lancamentoRapidoSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const input = parsed.data;

  const resolvido = await resolverLancamentoPorItem(auth.targetUserId, {
    itemId: input.itemId,
    valor: input.valor,
    ano: input.ano,
    mes: input.mes,
    recorrente: input.recorrente,
    mesFim: input.mesFim,
    descricao: input.descricao,
  });
  if (!resolvido.ok) {
    return NextResponse.json({ error: resolvido.motivo }, { status: 422 });
  }

  const { lancamento, mesesComFormula } = resolvido;
  const previa: PreviaLancamento = {
    itemId: lancamento.itemId,
    itemNome: lancamento.itemNome,
    trilha: lancamento.grupoNome,
    tipo: lancamento.tipo,
    ano: lancamento.ano,
    valor: lancamento.valor,
    modo: lancamento.modo,
    celulas: lancamento.celulas.map((c) => ({
      ...c,
      diminui: c.valorNovo < c.valorAtual,
      temFormula: mesesComFormula.includes(c.mes),
    })),
  };

  if (!input.confirmar) {
    return NextResponse.json({ ok: true, previa });
  }

  if (previa.celulas.some((c) => c.diminui) && !input.aceitaReducao) {
    return NextResponse.json({ error: MSG_REDUCAO_SEM_CONFIRMACAO, previa }, { status: 409 });
  }

  const aplicado = await aplicarLancamento(auth, request, lancamento, {
    origem: 'lancamento-rapido',
    carimbar: 'com-descricao',
  });

  return NextResponse.json({
    ok: true,
    previa,
    resultado: {
      itemId: aplicado.itemId,
      grupoNome: lancamento.grupoNome,
      celulas: aplicado.celulas,
    },
    changeLogId: aplicado.changeLogId ?? null,
  });
});
