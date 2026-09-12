import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
  complete: vi.fn(),
  buildContextoUsuario: vi.fn(),
  usoMensal: vi.fn(),
  registrarMensagem: vi.fn(),
  assistenteHabilitado: vi.fn(),
  montarProposta: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mocks.logSensitiveEndpointAccess,
}));
vi.mock('@/services/assistente/llm', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/assistente/llm')>();
  return { ...orig, complete: mocks.complete };
});
vi.mock('@/services/assistente/contexto', () => ({
  buildContextoUsuario: mocks.buildContextoUsuario,
}));
vi.mock('@/services/assistente/limite', () => ({
  usoMensal: mocks.usoMensal,
  registrarMensagem: mocks.registrarMensagem,
  assistenteHabilitado: mocks.assistenteHabilitado,
}));
vi.mock('@/services/assistente/lancamento', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/assistente/lancamento')>();
  return { ...orig, montarProposta: mocks.montarProposta };
});

import { GET, POST } from '../route';
import { LlmError } from '@/services/assistente/llm';

const user = {
  payload: { id: 'u1', email: 'a@b.c', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
};
const uso = { usadas: 3, limite: 300, restantes: 297, economico: false };

function post(body: unknown) {
  return new NextRequest('http://localhost/api/assistente', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function llmText(text: string, extra: Record<string, unknown> = {}) {
  return {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    text,
    toolCalls: [],
    stopReason: 'end',
    usage: {
      inputTokens: 10,
      cachedInputTokens: 5000,
      cacheWriteTokens: 0,
      outputTokens: 20,
      reasoningTokens: 0,
    },
    costUsd: 0.001,
    costBrl: 0.005,
    latencyMs: 100,
    ...extra,
  };
}

describe('GET /api/assistente', () => {
  beforeEach(() => {
    mocks.requireAuthWithActing.mockResolvedValue(user);
    mocks.usoMensal.mockResolvedValue(uso);
  });

  it('informa habilitado + uso', async () => {
    mocks.assistenteHabilitado.mockReturnValue(true);
    const res = await GET(new NextRequest('http://localhost/api/assistente'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ habilitado: true, modelo: 'claude-haiku-4-5', uso });
  });

  it('desabilitado → uso null', async () => {
    mocks.assistenteHabilitado.mockReturnValue(false);
    const res = await GET(new NextRequest('http://localhost/api/assistente'));
    expect(await res.json()).toMatchObject({ habilitado: false, uso: null });
  });
});

describe('POST /api/assistente', () => {
  beforeEach(() => {
    mocks.requireAuthWithActing.mockResolvedValue(user);
    mocks.assistenteHabilitado.mockReturnValue(true);
    mocks.usoMensal.mockResolvedValue(uso);
    mocks.buildContextoUsuario.mockResolvedValue('{"ano":2026}');
    mocks.registrarMensagem.mockResolvedValue('msg-1');
    mocks.complete.mockReset();
    mocks.montarProposta.mockReset();
    mocks.logSensitiveEndpointAccess.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('503 quando desabilitado; 400 sem mensagem', async () => {
    mocks.assistenteHabilitado.mockReturnValueOnce(false);
    expect((await POST(post({ mensagem: 'oi' }))).status).toBe(503);
    expect((await POST(post({ mensagem: '' }))).status).toBe(400);
  });

  it('429 quando a cota do mês acabou (sem chamar o modelo)', async () => {
    mocks.usoMensal.mockResolvedValue({ usadas: 300, limite: 300, restantes: 0, economico: true });
    const res = await POST(post({ mensagem: 'oi' }));
    expect(res.status).toBe(429);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('responde texto, manda ferramenta + histórico e registra métrica com intenção', async () => {
    mocks.complete.mockResolvedValue(llmText('Você gastou R$ 10,00.'));
    const res = await POST(
      post({
        mensagem: 'Quanto gastei este mês?',
        historico: [
          { role: 'user', content: 'oi' },
          { role: 'assistant', content: 'olá' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resposta: 'Você gastou R$ 10,00.',
      uso: { ...uso, usadas: 4, restantes: 296 },
    });
    const req = mocks.complete.mock.calls[0][1];
    expect(mocks.complete.mock.calls[0][0]).toBe('claude-haiku-4-5');
    expect(req.system).toContain('{"ano":2026}');
    expect(req.messages).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
      { role: 'user', content: 'Quanto gastei este mês?' },
    ]);
    expect(req.tools.map((t: { name: string }) => t.name)).toEqual(['propor_lancamento']);
    expect(req.reasoning).toBe('none');
    expect(mocks.registrarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        intencao: 'gasto_categoria',
        motor: 'ia',
        textoUsuario: null,
      }),
    );
    expect(mocks.logSensitiveEndpointAccess).toHaveBeenCalled();
  });

  it('consultor agindo pelo cliente não recebe a ferramenta de escrita', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'c1', email: 'c@b.c', role: 'consultant' },
      targetUserId: 'u1',
      actingClient: { id: 'u1', consultantId: 'c1' },
    });
    mocks.complete.mockResolvedValue(llmText('ok'));
    await POST(post({ mensagem: 'oi' }));
    expect(mocks.complete.mock.calls[0][1].tools).toEqual([]);
    expect(mocks.registrarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ viaConsultant: true, actorId: 'c1' }),
    );
  });

  it('chamada de ferramenta vira proposta assinada com cartão', async () => {
    mocks.complete.mockResolvedValue(
      llmText('', {
        stopReason: 'tool_use',
        toolCalls: [
          {
            id: 't1',
            name: 'propor_lancamento',
            input: { tipo: 'despesa', linha: 'mercado', grupo: 'Habitação', valor: 45.9 },
          },
        ],
      }),
    );
    mocks.montarProposta.mockResolvedValue({
      ok: true,
      token: 'tok.sig',
      proposta: {
        id: 'p1',
        mensagemId: 'msg-1',
        userId: 'u1',
        itemId: 'i',
        itemNome: 'Supermercado',
        grupoNome: 'Despesas > Habitação',
        tipo: 'despesa',
        valor: 45.9,
        ano: 2026,
        descricao: null,
        modo: 'somar',
        celulas: [{ mes: 8, valorAtual: 1020, valorNovo: 1065.9 }],
        expiraEm: 1,
      },
    });
    const res = await POST(post({ mensagem: 'Gastei 45,90 no mercado', anoPlanilha: 2026 }));
    const body = await res.json();
    expect(mocks.montarProposta).toHaveBeenCalledWith(
      'u1',
      'msg-1',
      { tipo: 'despesa', linha: 'mercado', grupo: 'Habitação', valor: 45.9 },
      { anoPlanilha: 2026 },
    );
    expect(body.resposta.replace(/\u00a0/g, ' ')).toContain('somar R$ 45,90');
    expect(body.resposta).toContain('setembro/2026');
    expect(body.proposta).toMatchObject({
      token: 'tok.sig',
      linha: 'Supermercado',
      recorrente: false,
      periodo: 'setembro/2026',
      celulas: [{ mes: 8, mesNome: 'setembro', valorAtual: 1020, valorNovo: 1065.9 }],
      valorTotal: 45.9,
    });
    expect(body.propostas).toEqual([body.proposta]);
    expect(mocks.registrarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ motor: 'ia+t', propostaGerada: true, intencao: 'lancamento' }),
    );
  });

  it('lançamento recorrente vira proposta com o ano inteiro e aviso dos meses já preenchidos', async () => {
    mocks.complete.mockResolvedValue(
      llmText('', {
        stopReason: 'tool_use',
        toolCalls: [
          {
            id: 't1',
            name: 'propor_lancamento',
            input: {
              tipo: 'despesa',
              linha: 'Aluguel',
              grupo: 'Habitação',
              valor: 2500,
              recorrente: true,
            },
          },
        ],
      }),
    );
    const celulas = Array.from({ length: 12 }, (_, mes) => ({
      mes,
      valorAtual: mes === 8 ? 2500 : 0,
      valorNovo: 2500,
    }));
    mocks.montarProposta.mockResolvedValue({
      ok: true,
      token: 'tok.sig',
      proposta: {
        id: 'p1',
        mensagemId: 'msg-1',
        userId: 'u1',
        itemId: 'i',
        itemNome: 'Aluguel',
        grupoNome: 'Despesas > Habitação',
        tipo: 'despesa',
        valor: 2500,
        ano: 2027,
        descricao: null,
        modo: 'definir',
        celulas,
        expiraEm: 1,
      },
    });
    const res = await POST(post({ mensagem: 'Meu aluguel é 2.500 por mês', anoPlanilha: 2027 }));
    const body = await res.json();
    expect(mocks.montarProposta).toHaveBeenCalledWith(
      'u1',
      'msg-1',
      expect.objectContaining({ recorrente: true, valor: 2500 }),
      { anoPlanilha: 2027 },
    );
    const texto = body.resposta.replace(/\u00a0/g, ' ');
    expect(texto).toContain('colocar R$ 2.500,00 por mês');
    expect(texto).toContain('janeiro a dezembro/2027 (12 meses, R$ 30.000,00 no total)');
    expect(texto).toContain('1 mês já tem valor e será substituído');
    expect(body.proposta).toMatchObject({
      recorrente: true,
      modo: 'definir',
      periodo: 'janeiro a dezembro/2027',
      valorTotal: 30000,
    });
    expect(body.proposta.celulas).toHaveLength(12);
    expect(body.proposta.celulas[11]).toEqual({
      mes: 11,
      mesNome: 'dezembro',
      valorAtual: 0,
      valorNovo: 2500,
    });
  });

  it('linha não encontrada → resposta com alternativas, sem proposta', async () => {
    mocks.complete.mockResolvedValue(
      llmText('', {
        toolCalls: [
          {
            id: 't1',
            name: 'propor_lancamento',
            input: { tipo: 'despesa', linha: 'gasolina', valor: 10 },
          },
        ],
      }),
    );
    mocks.montarProposta.mockResolvedValue({
      ok: false,
      motivo: 'Não encontrei.',
      alternativas: [
        {
          itemId: 'a',
          itemNome: 'Combustível',
          grupoNome: 'Despesas > Despesas Fixas > Transporte',
          grupoTipo: 'despesa',
        },
      ],
    });
    const body = await (await POST(post({ mensagem: 'gastei 10 de gasolina' }))).json();
    expect(body.proposta).toBeUndefined();
    expect(body.propostas).toBeUndefined();
    expect(body.resposta).toContain('"Combustível" (Transporte)');
    expect(body.resposta).toContain('Qual delas?');
  });

  describe('vários lançamentos numa mensagem só', () => {
    const chamada = (id: string, linha: string, valor: number) => ({
      id,
      name: 'propor_lancamento',
      input: { tipo: 'despesa', linha, valor, recorrente: true },
    });
    const propostaDe = (nome: string, valor: number, valorAtual = 0) => ({
      ok: true,
      token: `tok-${nome}`,
      proposta: {
        id: `p-${nome}`,
        mensagemId: 'msg-1',
        userId: 'u1',
        itemId: `i-${nome}`,
        itemNome: nome,
        grupoNome: 'Despesas > Despesas Fixas > Saúde',
        tipo: 'despesa',
        valor,
        ano: 2026,
        descricao: null,
        modo: 'definir',
        celulas: Array.from({ length: 12 }, (_, mes) => ({ mes, valorAtual, valorNovo: valor })),
        expiraEm: 1,
      },
    });

    it('uma proposta por chamada de ferramenta, na ordem, com resumo em lista e sem `proposta` singular', async () => {
      mocks.complete.mockResolvedValue(
        llmText('', {
          stopReason: 'tool_use',
          toolCalls: [
            chamada('t1', 'Plano de saúde', 1500),
            chamada('t2', 'Medicamentos', 500),
            chamada('t3', 'Internet', 300),
          ],
        }),
      );
      const internet = propostaDe('Internet', 300);
      internet.proposta.descricao = 'Fibra';
      mocks.montarProposta
        .mockResolvedValueOnce(propostaDe('Plano de saúde', 1500))
        .mockResolvedValueOnce(propostaDe('Medicamentos', 500, 120))
        .mockResolvedValueOnce(internet);
      const res = await POST(
        post({
          mensagem: 'Plano de saúde 1.500, medicamentos 500 e internet 300 por mês',
          anoPlanilha: 2026,
        }),
      );
      const body = await res.json();
      expect(mocks.montarProposta).toHaveBeenCalledTimes(3);
      expect(mocks.montarProposta.mock.calls.map((c) => c[2].linha)).toEqual([
        'Plano de saúde',
        'Medicamentos',
        'Internet',
      ]);
      expect(body.proposta).toBeUndefined();
      expect(
        body.propostas.map((p: { linha: string; token: string }) => [p.linha, p.token]),
      ).toEqual([
        ['Plano de saúde', 'tok-Plano de saúde'],
        ['Medicamentos', 'tok-Medicamentos'],
        ['Internet', 'tok-Internet'],
      ]);
      expect(body.propostas[1]).toMatchObject({
        recorrente: true,
        periodo: 'janeiro a dezembro/2026',
        valorTotal: 6000,
      });
      const texto = body.resposta.replace(/\u00a0/g, ' ');
      expect(texto).toContain('Montei 3 lançamentos:');
      expect(texto).toContain(
        '- Plano de saúde (Saúde): R$ 1.500,00 por mês, janeiro a dezembro/2026 (12 meses).',
      );
      expect(texto).toContain(
        '- Medicamentos (Saúde): R$ 500,00 por mês, janeiro a dezembro/2026 (12 meses). 12 meses já têm valor e serão substituídos.',
      );
      expect(texto).toContain(
        '- Internet (Saúde) — Fibra: R$ 300,00 por mês, janeiro a dezembro/2026 (12 meses).',
      );
      expect(texto).not.toContain('incompleta');
      expect(texto).toContain('Confira no cartão e confirme');
      expect(mocks.registrarMensagem).toHaveBeenCalledWith(
        expect.objectContaining({ motor: 'ia+t', propostaGerada: true }),
      );
    });

    it('item que falhou vai para a lista de falhas e os outros seguem para o cartão', async () => {
      mocks.complete.mockResolvedValue(
        llmText('', {
          stopReason: 'tool_use',
          toolCalls: [
            chamada('t1', 'Plano de saúde', 1500),
            { id: 't2', name: 'propor_lancamento', input: { tipo: 'despesa', linha: 'Roupas' } },
            chamada('t3', 'Nutricionista', 500),
          ],
        }),
      );
      mocks.montarProposta
        .mockResolvedValueOnce(propostaDe('Plano de saúde', 1500))
        .mockResolvedValueOnce({
          ok: false,
          motivo: 'Não encontrei uma linha de despesa parecida com "Nutricionista".',
          alternativas: [
            {
              itemId: 'a',
              itemNome: 'Médicos e Terapeutas',
              grupoNome: 'Despesas > Despesas Fixas > Saúde',
              grupoTipo: 'despesa',
            },
          ],
        });
      const body = await (await POST(post({ mensagem: 'lista' }))).json();
      expect(mocks.montarProposta).toHaveBeenCalledTimes(2);
      expect(body.propostas).toHaveLength(1);
      expect(body.resposta).toContain('Montei 1 lançamento:');
      expect(body.resposta).toContain('Não consegui estes:');
      expect(body.resposta).toContain('- Para "Roupas" faltou o valor ou a linha.');
      expect(body.resposta).toContain(
        '- Não encontrei uma linha de despesa parecida com "Nutricionista". Linhas parecidas: "Médicos e Terapeutas" (Saúde).',
      );
    });

    it('nenhum item montado → só texto com as falhas', async () => {
      mocks.complete.mockResolvedValue(
        llmText('', {
          toolCalls: [chamada('t1', 'X', 1), chamada('t2', 'Y', 2)],
        }),
      );
      mocks.montarProposta.mockResolvedValue({
        ok: false,
        motivo: 'Não encontrei.',
        alternativas: [],
      });
      const body = await (await POST(post({ mensagem: 'lista' }))).json();
      expect(body.propostas).toBeUndefined();
      expect(body.resposta).toBe(
        'Não consegui montar nenhum lançamento:\n- Não encontrei.\n- Não encontrei.',
      );
    });

    it('resposta cortada por max_tokens avisa que a lista pode estar incompleta', async () => {
      mocks.complete.mockResolvedValue(
        llmText('', {
          stopReason: 'max_tokens',
          toolCalls: [chamada('t1', 'Plano de saúde', 1500)],
        }),
      );
      mocks.montarProposta.mockResolvedValueOnce(propostaDe('Plano de saúde', 1500));
      const body = await (await POST(post({ mensagem: 'lista enorme' }))).json();
      expect(body.propostas).toHaveLength(1);
      expect(body.proposta).toBeDefined();
      expect(body.resposta).toContain('Montei 1 lançamento:');
      expect(body.resposta).toContain('pode ter ficado incompleta');
    });

    it('respeita o teto de lançamentos por mensagem', async () => {
      mocks.complete.mockResolvedValue(
        llmText('', {
          stopReason: 'tool_use',
          toolCalls: Array.from({ length: 25 }, (_, i) => chamada(`t${i}`, `Linha ${i}`, 10)),
        }),
      );
      mocks.montarProposta.mockImplementation((_u: string, _m: string, input: { linha: string }) =>
        Promise.resolve(propostaDe(input.linha, 10)),
      );
      const body = await (await POST(post({ mensagem: 'lista enorme' }))).json();
      expect(mocks.montarProposta).toHaveBeenCalledTimes(20);
      expect(body.propostas).toHaveLength(20);
      expect(body.resposta).toContain('pode ter ficado incompleta');
    });
  });

  it('ferramenta com input inválido pede reformulação', async () => {
    mocks.complete.mockResolvedValue(
      llmText('', {
        toolCalls: [{ id: 't1', name: 'propor_lancamento', input: { tipo: 'despesa' } }],
      }),
    );
    const body = await (await POST(post({ mensagem: 'registra' }))).json();
    expect(body.resposta).toContain('faltou o valor');
    expect(mocks.montarProposta).not.toHaveBeenCalled();
  });

  it('erro do modelo → 502 e métrica de erro', async () => {
    mocks.complete.mockRejectedValue(new LlmError('rate', 'anthropic', 429, true));
    const res = await POST(post({ mensagem: 'oi' }));
    expect(res.status).toBe(502);
    expect(mocks.registrarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ resposta: null, erro: 'rate' }),
    );
  });
});
