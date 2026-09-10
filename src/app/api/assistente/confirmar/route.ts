/**
 * POST /api/assistente/confirmar — grava a proposta que o usuário confirmou
 * no cartão. Recebe o token assinado devolvido por POST /api/assistente;
 * verifica assinatura, validade (10 min) e dono; consultor não confirma.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { assistenteHabilitado, marcarPropostaConfirmada } from '@/services/assistente/limite';
import { MESES_LONGOS, aplicarProposta, verificarProposta } from '@/services/assistente/lancamento';

const confirmarSchema = z.object({
  token: z.string().min(20).max(8000),
});

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  if (!assistenteHabilitado()) {
    throw new ApiError(503, 'Assistente indisponível no momento.');
  }
  if (auth.actingClient) {
    throw new ApiError(403, 'Consultor não pode registrar lançamentos pelo assistente.');
  }

  const parsed = confirmarSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);

  const proposta = verificarProposta(parsed.data.token, auth.targetUserId);
  if (!proposta) {
    throw new ApiError(400, 'Proposta inválida ou expirada. Peça de novo ao assistente.');
  }

  const r = await aplicarProposta(auth, request, proposta);
  if (proposta.mensagemId) await marcarPropostaConfirmada(proposta.mensagemId);

  return NextResponse.json({
    ok: true,
    resumo: `Registrado: ${brl(proposta.valor)} em "${proposta.itemNome}" (${MESES_LONGOS[proposta.mes]}/${proposta.ano}). A célula ficou em ${brl(r.valorNovo)}. Dá para desfazer em Histórico.`,
    itemId: r.itemId,
    valorAnterior: r.valorAnterior,
    valorNovo: r.valorNovo,
    ano: proposta.ano,
  });
});
