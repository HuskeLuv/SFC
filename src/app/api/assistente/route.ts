/**
 * Assistente de IA — Fase 1 (MVP).
 *
 * GET  /api/assistente  → { habilitado, modelo, uso }
 * POST /api/assistente  → { resposta, proposta?, uso }
 *
 * Toda mensagem vai para o modelo (Haiku) com o retrato compacto da conta no
 * prompt (cacheado por conversa). A única ferramenta é `propor_lancamento`:
 * o servidor devolve uma PROPOSTA assinada e o app pede confirmação; a
 * gravação acontece em POST /api/assistente/confirmar. A IA nunca grava.
 * Consultor agindo por cliente: só leitura (sem ferramenta).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { complete, LlmError } from '@/services/assistente/llm';
import { buildContextoUsuario } from '@/services/assistente/contexto';
import {
  MAX_OUTPUT_TOKENS,
  MAX_TROCAS_HISTORICO,
  MODELO_ASSISTENTE,
  TOOL_PROPOR_LANCAMENTO,
  buildSystemPrompt,
} from '@/services/assistente/prompt';
import { classificarIntencao, guardarTextoDaIntencao } from '@/services/assistente/intencao';
import { assistenteHabilitado, registrarMensagem, usoMensal } from '@/services/assistente/limite';
import { MESES_LONGOS, montarProposta } from '@/services/assistente/lancamento';

const mensagemSchema = z.object({
  mensagem: z.string().trim().min(1).max(1000),
  historico: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(MAX_TROCAS_HISTORICO * 2)
    .optional(),
});

const lancamentoInputSchema = z.object({
  tipo: z.enum(['despesa', 'entrada']),
  linha: z.string().trim().min(1).max(120),
  valor: z.number().finite().positive(),
  mes: z.number().int().min(0).max(11).optional(),
  ano: z.number().int().min(2000).max(2100).optional(),
  descricao: z.string().trim().max(200).optional(),
});

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const habilitado = assistenteHabilitado();
  return NextResponse.json({
    habilitado,
    modelo: MODELO_ASSISTENTE,
    uso: habilitado ? await usoMensal(targetUserId) : null,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  if (!assistenteHabilitado()) {
    throw new ApiError(503, 'Assistente indisponível no momento.');
  }

  const parsed = mensagemSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { mensagem, historico = [] } = parsed.data;

  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/assistente',
    'POST',
  );

  const uso = await usoMensal(targetUserId);
  if (uso.restantes <= 0) {
    return NextResponse.json(
      {
        error: `Você usou as ${uso.limite} mensagens deste mês. O limite renova no dia 1º.`,
        uso,
      },
      { status: 429 },
    );
  }

  const intencao = classificarIntencao(mensagem);
  const contexto = await buildContextoUsuario(request, targetUserId);
  const viaConsultant = Boolean(actingClient);
  const base = {
    userId: targetUserId,
    actorId: payload.id,
    viaConsultant,
    intencao,
    textoUsuario: guardarTextoDaIntencao(intencao) ? mensagem : null,
  };

  let res;
  try {
    res = await complete(MODELO_ASSISTENTE, {
      system: buildSystemPrompt(contexto),
      messages: [
        ...historico.slice(-MAX_TROCAS_HISTORICO * 2).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: mensagem },
      ],
      // Consultor agindo pelo cliente não propõe escrita (decisão Fase 0).
      tools: viaConsultant ? [] : [TOOL_PROPOR_LANCAMENTO],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      reasoning: 'none',
      cacheKey: 'assistente-v1',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await registrarMensagem({
      ...base,
      motor: 'ia',
      propostaGerada: false,
      resposta: null,
      erro: msg,
    });
    if (error instanceof LlmError) {
      throw new ApiError(
        502,
        error.retryable
          ? 'O assistente está sobrecarregado. Tente de novo em instantes.'
          : 'Não consegui falar com o assistente agora.',
      );
    }
    throw error;
  }

  const chamada = res.toolCalls.find((c) => c.name === TOOL_PROPOR_LANCAMENTO.name);
  const mensagemId = await registrarMensagem({
    ...base,
    motor: chamada ? 'ia+t' : 'ia',
    propostaGerada: Boolean(chamada),
    resposta: res,
  });
  const usoDepois = { ...uso, usadas: uso.usadas + 1, restantes: Math.max(0, uso.restantes - 1) };

  if (!chamada) {
    const resposta =
      res.text ||
      (res.stopReason === 'refusal'
        ? 'Não consigo ajudar com isso.'
        : 'Não entendi. Pode reformular a pergunta?');
    return NextResponse.json({ resposta, uso: usoDepois });
  }

  const input = lancamentoInputSchema.safeParse(chamada.input);
  if (!input.success) {
    return NextResponse.json({
      resposta:
        'Entendi que você quer registrar algo, mas faltou o valor ou a linha. Pode dizer, por exemplo: "gastei 45,90 no mercado"?',
      uso: usoDepois,
    });
  }

  const resultado = await montarProposta(targetUserId, mensagemId ?? '', input.data);
  if (!resultado.ok) {
    const lista =
      resultado.alternativas.length > 0
        ? ` Linhas parecidas: ${resultado.alternativas.map((a) => `"${a.itemNome}"`).join(', ')}. Qual delas?`
        : ' Você pode criar a linha na tela Fluxo de Caixa e pedir de novo.';
    return NextResponse.json({ resposta: resultado.motivo + lista, uso: usoDepois });
  }

  const p = resultado.proposta;
  const resposta =
    `Vou somar ${brl(p.valor)} na linha "${p.itemNome}" (${p.grupoNome}) em ${MESES_LONGOS[p.mes]}/${p.ano}. ` +
    `A célula passa de ${brl(p.valorAtual)} para ${brl(p.valorNovo)}. Confirma?`;
  return NextResponse.json({
    resposta,
    proposta: {
      token: resultado.token,
      tipo: p.tipo,
      linha: p.itemNome,
      grupo: p.grupoNome,
      valor: p.valor,
      mes: p.mes,
      mesNome: MESES_LONGOS[p.mes],
      ano: p.ano,
      descricao: p.descricao,
      valorAtual: p.valorAtual,
      valorNovo: p.valorNovo,
      expiraEm: p.expiraEm,
    },
    uso: usoDepois,
  });
});
