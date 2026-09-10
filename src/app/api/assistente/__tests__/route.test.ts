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
        mes: 8,
        ano: 2026,
        descricao: null,
        valorAtual: 1020,
        valorNovo: 1065.9,
        expiraEm: 1,
      },
    });
    const res = await POST(post({ mensagem: 'Gastei 45,90 no mercado' }));
    const body = await res.json();
    expect(mocks.montarProposta).toHaveBeenCalledWith('u1', 'msg-1', {
      tipo: 'despesa',
      linha: 'mercado',
      grupo: 'Habitação',
      valor: 45.9,
    });
    expect(body.resposta.replace(/\u00a0/g, ' ')).toContain('R$ 45,90');
    expect(body.resposta).toContain('setembro/2026');
    expect(body.proposta).toMatchObject({
      token: 'tok.sig',
      linha: 'Supermercado',
      mesNome: 'setembro',
      valorNovo: 1065.9,
    });
    expect(mocks.registrarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ motor: 'ia+t', propostaGerada: true, intencao: 'lancamento' }),
    );
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
    expect(body.resposta).toContain('"Combustível" (Transporte)');
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
