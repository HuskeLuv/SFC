/**
 * Assistente de IA — Fase 1 (MVP).
 *
 * GET  /api/assistente  → { habilitado, modelo, uso }
 * POST /api/assistente  → { resposta, propostas?, proposta?, uso }
 *   (`proposta` só quando há exatamente uma; `propostas` sempre que houver alguma)
 *
 * Toda mensagem vai para o modelo (Haiku) com o retrato compacto da conta no
 * prompt (cacheado por conversa). A única ferramenta é `propor_lancamento`
 * (um mês, ou o ano da planilha inteiro quando o gasto é recorrente); o modelo
 * chama uma vez por item quando o usuário lista vários gastos numa mensagem.
 * O servidor devolve uma PROPOSTA assinada por item e o app pede confirmação;
 * a gravação acontece em POST /api/assistente/confirmar. A IA nunca grava.
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
import {
  MAX_LANCAMENTOS_POR_MENSAGEM,
  MESES_LONGOS,
  descreverPeriodo,
  ehRecorrente,
  grupoCurto,
  montarProposta,
  type Proposta,
} from '@/services/assistente/lancamento';

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
  /** Ano aberto na planilha do fluxo de caixa (seletor da sidebar). */
  anoPlanilha: z.number().int().min(2000).max(2100).optional(),
});

const lancamentoInputSchema = z.object({
  tipo: z.enum(['despesa', 'entrada']),
  linha: z.string().trim().min(1).max(120),
  grupo: z.string().trim().max(120).optional(),
  valor: z.number().finite().positive(),
  mes: z.number().int().min(0).max(11).optional(),
  ano: z.number().int().min(2000).max(2100).optional(),
  descricao: z.string().trim().max(200).optional(),
  recorrente: z.boolean().optional(),
  mesInicio: z.number().int().min(0).max(11).optional(),
  mesFim: z.number().int().min(0).max(11).optional(),
  modo: z.enum(['somar', 'definir']).optional(),
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
  const { mensagem, historico = [], anoPlanilha } = parsed.data;

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
      cacheKey: 'assistente-v4',
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

  const chamadas = res.toolCalls
    .filter((c) => c.name === TOOL_PROPOR_LANCAMENTO.name)
    .slice(0, MAX_LANCAMENTOS_POR_MENSAGEM);
  const mensagemId = await registrarMensagem({
    ...base,
    motor: chamadas.length > 0 ? 'ia+t' : 'ia',
    propostaGerada: chamadas.length > 0,
    resposta: res,
  });
  const usoDepois = { ...uso, usadas: uso.usadas + 1, restantes: Math.max(0, uso.restantes - 1) };

  if (chamadas.length === 0) {
    const resposta =
      res.text ||
      (res.stopReason === 'refusal'
        ? 'Não consigo ajudar com isso.'
        : 'Não entendi. Pode reformular a pergunta?');
    return NextResponse.json({ resposta, uso: usoDepois });
  }

  // Uma proposta por chamada de ferramenta (o usuário pode listar vários itens
  // numa mensagem só). Item que falhou vira uma linha explicando; os que deram
  // certo vão para o cartão.
  const propostas: PropostaResposta[] = [];
  const falhas: string[] = [];
  for (const chamada of chamadas) {
    const input = lancamentoInputSchema.safeParse(chamada.input);
    if (!input.success) {
      const nome = typeof chamada.input.linha === 'string' ? `"${chamada.input.linha}"` : 'um item';
      falhas.push(`Para ${nome} faltou o valor ou a linha.`);
      continue;
    }
    const resultado = await montarProposta(targetUserId, mensagemId ?? '', input.data, {
      anoPlanilha,
    });
    if (!resultado.ok) {
      const lista =
        resultado.alternativas.length > 0
          ? ` Linhas parecidas: ${resultado.alternativas.map((a) => `"${a.itemNome}" (${grupoCurto(a.grupoNome)})`).join(', ')}.`
          : '';
      falhas.push(resultado.motivo + lista);
      continue;
    }
    propostas.push(paraResposta(resultado.proposta, resultado.token));
  }

  const cortada = res.stopReason === 'max_tokens' || res.toolCalls.length > chamadas.length;

  if (propostas.length === 0) {
    const unica = chamadas.length === 1;
    const resposta = unica
      ? falhas[0].includes('faltou o valor')
        ? 'Entendi que você quer registrar algo, mas faltou o valor ou a linha. Pode dizer, por exemplo: "gastei 45,90 no mercado"?'
        : `${falhas[0]}${falhas[0].includes('Linhas parecidas') ? ' Qual delas?' : ' Você pode criar a linha na tela Fluxo de Caixa e pedir de novo.'}`
      : `Não consegui montar nenhum lançamento:\n${falhas.map((f) => `- ${f}`).join('\n')}`;
    return NextResponse.json({ resposta, uso: usoDepois });
  }

  const resposta =
    propostas.length === 1 && falhas.length === 0 && !cortada
      ? descreverPropostaUnica(propostas[0])
      : descreverLote(propostas, falhas, cortada);

  return NextResponse.json({
    resposta,
    ...(propostas.length === 1 ? { proposta: propostas[0] } : {}),
    propostas,
    uso: usoDepois,
  });
});

/** Proposta como vai para o cartão do painel (token assinado + resumo legível). */
interface PropostaResposta {
  token: string;
  tipo: 'despesa' | 'entrada';
  linha: string;
  grupo: string;
  valor: number;
  modo: 'somar' | 'definir';
  recorrente: boolean;
  periodo: string;
  ano: number;
  descricao: string | null;
  celulas: Array<{ mes: number; mesNome: string; valorAtual: number; valorNovo: number }>;
  valorTotal: number;
  expiraEm: number;
}

function paraResposta(p: Proposta, token: string): PropostaResposta {
  return {
    token,
    tipo: p.tipo,
    linha: p.itemNome,
    grupo: p.grupoNome,
    valor: p.valor,
    modo: p.modo,
    recorrente: ehRecorrente(p),
    periodo: descreverPeriodo(p),
    ano: p.ano,
    descricao: p.descricao,
    celulas: p.celulas.map((c) => ({ ...c, mesNome: MESES_LONGOS[c.mes] })),
    valorTotal: p.valor * p.celulas.length,
    expiraEm: p.expiraEm,
  };
}

function avisoMesesComValor(p: PropostaResposta): string {
  const comValor = p.celulas.filter((c) => c.valorAtual !== 0).length;
  if (comValor === 0) return '';
  if (p.modo === 'definir') {
    return ` ${comValor} ${comValor === 1 ? 'mês já tem valor e será substituído' : 'meses já têm valor e serão substituídos'}.`;
  }
  return ` ${comValor} ${comValor === 1 ? 'mês já tem valor; o novo entra em cima' : 'meses já têm valor; o novo entra em cima'}.`;
}

function descreverPropostaUnica(p: PropostaResposta): string {
  if (p.recorrente) {
    const verbo = p.modo === 'definir' ? 'colocar' : 'somar';
    return (
      `Vou ${verbo} ${brl(p.valor)} por mês na linha "${p.linha}" (${p.grupo}), ` +
      `de ${p.periodo} (${p.celulas.length} meses, ${brl(p.valorTotal)} no total).${avisoMesesComValor(p)} Confirma?`
    );
  }
  const c = p.celulas[0];
  const verbo = p.modo === 'definir' ? 'colocar' : 'somar';
  return (
    `Vou ${verbo} ${brl(p.valor)} na linha "${p.linha}" (${p.grupo}) em ${p.periodo}. ` +
    `A célula passa de ${brl(c.valorAtual)} para ${brl(c.valorNovo)}. Confirma?`
  );
}

/** Texto do lote: uma linha por item, as falhas em seguida, e o aviso se a lista foi cortada. */
function descreverLote(propostas: PropostaResposta[], falhas: string[], cortada: boolean): string {
  const linhas = propostas.map((p) => {
    const periodo = p.recorrente
      ? `${brl(p.valor)} por mês, ${p.periodo} (${p.celulas.length} meses)`
      : `${brl(p.valor)} em ${p.periodo}`;
    const origem = p.descricao ? ` — ${p.descricao}` : '';
    return `- ${p.linha} (${grupoCurto(p.grupo)})${origem}: ${periodo}.${avisoMesesComValor(p)}`;
  });
  const partes = [
    `Montei ${propostas.length} ${propostas.length === 1 ? 'lançamento' : 'lançamentos'}:`,
    ...linhas,
  ];
  if (falhas.length > 0) {
    partes.push(
      `Não consegui ${falhas.length === 1 ? 'este' : 'estes'}:`,
      ...falhas.map((f) => `- ${f}`),
    );
  }
  if (cortada) {
    partes.push(
      'A lista era longa e pode ter ficado incompleta: confira os itens e mande o que faltou em outra mensagem.',
    );
  }
  partes.push('Confira no cartão e confirme para gravar.');
  return partes.join('\n');
}
