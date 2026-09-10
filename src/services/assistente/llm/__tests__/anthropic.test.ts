import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static APIConnectionError = APIConnectionError;
    messages = {
      create: (params: unknown) => ({ withResponse: () => createMock(params) }),
    };
  }
  return { default: Anthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider, toAnthropicMessages } from '../anthropic';
import { LlmError } from '../types';

function okResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Olá ' }],
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
        output_tokens: 50,
      },
      ...overrides,
    },
    response: { headers: new Headers({ 'request-id': 'req_1' }) },
  };
}

describe('toAnthropicMessages', () => {
  it('converte texto, chamadas de ferramenta e agrupa resultados consecutivos num único turno user', () => {
    const out = toAnthropicMessages([
      { role: 'user', content: 'oi' },
      {
        role: 'assistant',
        content: 'vou consultar',
        toolCalls: [
          { id: 'c1', name: 'carteira', input: {} },
          { id: 'c2', name: 'fluxo', input: { ano: 2026 } },
        ],
      },
      { role: 'tool', toolCallId: 'c1', name: 'carteira', content: '{"saldo":1}' },
      { role: 'tool', toolCallId: 'c2', name: 'fluxo', content: 'falhou', isError: true },
    ]);
    expect(out).toHaveLength(3);
    expect(out[1].content).toEqual([
      { type: 'text', text: 'vou consultar' },
      { type: 'tool_use', id: 'c1', name: 'carteira', input: {} },
      { type: 'tool_use', id: 'c2', name: 'fluxo', input: { ano: 2026 } },
    ]);
    expect(out[2].role).toBe('user');
    expect(out[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 'c1', content: '{"saldo":1}' },
      { type: 'tool_result', tool_use_id: 'c2', content: 'falhou', is_error: true },
    ]);
  });
});

describe('AnthropicProvider.complete', () => {
  const provider = new AnthropicProvider();
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('isConfigured reflete a variável de ambiente', () => {
    expect(provider.isConfigured()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(provider.isConfigured()).toBe(false);
  });

  it('marca o sistema como cacheável, omite thinking no Haiku e mapeia uso/custo', async () => {
    createMock.mockResolvedValue(okResponse());
    const res = await provider.complete('claude-haiku-4-5', {
      system: 'sistema',
      messages: [{ role: 'user', content: 'oi' }],
      maxOutputTokens: 300,
      reasoning: 'none',
      temperature: 0.2,
    });
    const params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.system).toEqual([
      { type: 'text', text: 'sistema', cache_control: { type: 'ephemeral' } },
    ]);
    expect(params).not.toHaveProperty('thinking');
    expect(params.temperature).toBe(0.2);
    expect(params.max_tokens).toBe(300);
    expect(res.text).toBe('Olá');
    expect(res.stopReason).toBe('end');
    expect(res.usage).toEqual({
      inputTokens: 100,
      cachedInputTokens: 4000,
      cacheWriteTokens: 0,
      outputTokens: 50,
      reasoningTokens: 0,
    });
    // 100×1 + 4000×0,1 + 50×5 = 750 µUSD
    expect(res.costUsd).toBeCloseTo(0.00075, 8);
    expect(res.requestId).toBe('req_1');
  });

  it('no Sonnet 5 desliga o raciocínio com reasoning=none e limita com low', async () => {
    createMock.mockResolvedValue(okResponse({ model: 'claude-sonnet-5' }));
    await provider.complete('claude-sonnet-5', {
      system: 's',
      messages: [{ role: 'user', content: 'oi' }],
      maxOutputTokens: 100,
      reasoning: 'none',
      temperature: 0.5,
    });
    let params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params).not.toHaveProperty('temperature');

    await provider.complete('claude-sonnet-5', {
      system: 's',
      messages: [{ role: 'user', content: 'oi' }],
      maxOutputTokens: 100,
      reasoning: 'low',
      cacheSystem: false,
    });
    params = createMock.mock.calls[1][0] as Record<string, unknown>;
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.system).toEqual([{ type: 'text', text: 's' }]);
  });

  it('devolve chamadas de ferramenta e stopReason tool_use', async () => {
    createMock.mockResolvedValue(
      okResponse({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'c9', name: 'carteira', input: { classe: 'acoes' } }],
      }),
    );
    const res = await provider.complete('claude-haiku-4-5', {
      system: 's',
      messages: [{ role: 'user', content: 'oi' }],
      tools: [{ name: 'carteira', description: 'd', inputSchema: { type: 'object' } }],
      maxOutputTokens: 100,
    });
    const params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.tools).toEqual([
      { name: 'carteira', description: 'd', input_schema: { type: 'object' } },
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([{ id: 'c9', name: 'carteira', input: { classe: 'acoes' } }]);
  });

  it('normaliza erros do SDK em LlmError com retryable coerente', async () => {
    createMock.mockRejectedValueOnce(new Anthropic.RateLimitError('rate', 429));
    await expect(
      provider.complete('claude-haiku-4-5', { system: 's', messages: [], maxOutputTokens: 1 }),
    ).rejects.toMatchObject({
      name: 'LlmError',
      provider: 'anthropic',
      status: 429,
      retryable: true,
    });

    createMock.mockRejectedValueOnce(new Anthropic.APIError('bad', 400));
    const err = await provider
      .complete('claude-haiku-4-5', { system: 's', messages: [], maxOutputTokens: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).retryable).toBe(false);
  });
});
