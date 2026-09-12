/**
 * POST /api/assistente/confirmar — grava a(s) proposta(s) que o usuário
 * confirmou no cartão. Recebe o token assinado devolvido por POST
 * /api/assistente (`token`) ou vários de uma vez (`tokens`, o cartão com a
 * lista de lançamentos); verifica assinatura, validade (10 min) e dono de
 * cada um; consultor não confirma.
 *
 * Um token   → { ok, resumo, itemId, celulas, ano }           (formato original)
 * Vários     → { ok, resumo, itens: [{ ok, linha, resumo | error, itemId?, celulas?, ano? }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { assistenteHabilitado, marcarPropostaConfirmada } from '@/services/assistente/limite';
import {
  MAX_LANCAMENTOS_POR_MENSAGEM,
  aplicarProposta,
  aplicarPropostas,
  descreverPeriodo,
  ehRecorrente,
  verificarProposta,
  type Proposta,
  type ResultadoAplicacao,
} from '@/services/assistente/lancamento';

const tokenSchema = z.string().min(20).max(8000);
const confirmarSchema = z.union([
  z.object({ token: tokenSchema }),
  z.object({ tokens: z.array(tokenSchema).min(1).max(MAX_LANCAMENTOS_POR_MENSAGEM) }),
]);

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function resumoItem(p: Proposta, r: ResultadoAplicacao, comDesfazer: boolean): string {
  const periodo = descreverPeriodo(p);
  const desfazer = comDesfazer ? ' Dá para desfazer em Histórico.' : '';
  return ehRecorrente(p)
    ? `Registrado: ${brl(p.valor)} por mês em "${p.itemNome}", de ${periodo} (${r.celulas.length} meses).${desfazer}`
    : `Registrado: ${brl(p.valor)} em "${p.itemNome}" (${periodo}). A célula ficou em ${brl(r.celulas[0].valorNovo)}.${desfazer}`;
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

  // Um token só: comportamento original.
  if ('token' in parsed.data) {
    const proposta = verificarProposta(parsed.data.token, auth.targetUserId);
    if (!proposta) {
      throw new ApiError(400, 'Proposta inválida ou expirada. Peça de novo ao assistente.');
    }
    const r = await aplicarProposta(auth, request, proposta);
    if (proposta.mensagemId) await marcarPropostaConfirmada(proposta.mensagemId);
    return NextResponse.json({
      ok: true,
      resumo: resumoItem(proposta, r, true),
      itemId: r.itemId,
      celulas: r.celulas,
      ano: proposta.ano,
    });
  }

  // Lote: valida todos antes de gravar qualquer um; token ruim vira item com erro.
  const verificados = parsed.data.tokens.map((t) => verificarProposta(t, auth.targetUserId));
  const validas = verificados.filter((p): p is Proposta => p !== null);
  if (validas.length === 0) {
    throw new ApiError(400, 'Propostas inválidas ou expiradas. Peça de novo ao assistente.');
  }

  const gravados = await aplicarPropostas(auth, request, validas);
  const mensagens = new Set(gravados.filter((g) => g.ok).map((g) => g.proposta.mensagemId));
  for (const id of mensagens) if (id) await marcarPropostaConfirmada(id);

  let g = 0;
  const itens = verificados.map((p) => {
    if (!p) return { ok: false as const, linha: null, error: 'Proposta inválida ou expirada.' };
    const res = gravados[g++];
    if (!res.ok) return { ok: false as const, linha: p.itemNome, error: res.erro };
    return {
      ok: true as const,
      linha: p.itemNome,
      resumo: resumoItem(p, res.resultado, false),
      itemId: res.resultado.itemId,
      celulas: res.resultado.celulas,
      ano: p.ano,
    };
  });
  const okCount = itens.filter((i) => i.ok).length;
  const falhas = itens.length - okCount;
  const resumo =
    falhas === 0
      ? `Registrados ${okCount} lançamentos. Dá para desfazer cada um em Histórico.`
      : `Registrados ${okCount} de ${itens.length} lançamentos; ${falhas} ${falhas === 1 ? 'não entrou' : 'não entraram'}. Dá para desfazer cada um em Histórico.`;

  return NextResponse.json({ ok: okCount > 0, resumo, itens });
});
