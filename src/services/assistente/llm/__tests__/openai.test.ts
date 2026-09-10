import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider, toOpenAiInput } from '../openai';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('toOpenAiInput', () => {
  it('converte histórico com chamadas e resultados de ferramenta', () => {
    expect(
      toOpenAiInput([
        { role: 'user', content: 'oi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'f', input: { a: 1 } }],
        },
        { role: 'tool', toolCallId: 'call_1', name: 'f', content: 'ok' },
        { role: 'tool', toolCallId: 'call_2', name: 'g', content: 'x', isError: true },
      ]),
    ).toEqual([
      { role: 'user', content: 'oi' },
      { type: 'function_call', call_id: 'call_1', name: 'f', arguments: '{"a":1}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
      { type: 'function_call_output', call_id: 'call_2', output: 'ERRO: x' },
    ]);
  });
});

describe('OpenAiProvider.complete', () => {
  const provider = new OpenAiProvider();
  const fetchMock = vi.fn<typeof fetch>();
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.OPENAI_API_KEY = 'sk-test';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('monta o corpo da Responses API e lê texto, uso com cache e custo', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'resp_1',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Olá' }] }],
        usage: {
          input_tokens: 1100,
          input_tokens_details: { cached_tokens: 1000 },
          output_tokens: 60,
          output_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    );
    const res = await provider.complete('gpt-5.6-luna', {
      system: 'sistema',
      messages: [{ role: 'user', content: 'oi' }],
      tools: [{ name: 'f', description: 'd', inputSchema: { type: 'object' } }],
      maxOutputTokens: 200,
      reasoning: 'low',
      cacheKey: 'k1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-5.6-luna',
      instructions: 'sistema',
      max_output_tokens: 200,
      store: false,
      reasoning: { effort: 'low' },
      prompt_cache_key: 'k1',
      tools: [{ type: 'function', name: 'f', parameters: { type: 'object' } }],
    });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    expect(res.text).toBe('Olá');
    expect(res.stopReason).toBe('end');
    expect(res.usage).toEqual({
      inputTokens: 100,
      cachedInputTokens: 1000,
      cacheWriteTokens: 0,
      outputTokens: 60,
      reasoningTokens: 10,
    });
    // 100×0,2 + 1000×0,02 + 60×1,2 = 112 µUSD
    expect(res.costUsd).toBeCloseTo(0.000112, 9);
    expect(res.requestId).toBe('resp_1');
  });

  it('extrai function_call e sinaliza max_output_tokens', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        output: [{ type: 'function_call', call_id: 'call_9', name: 'f', arguments: '{"x":2}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    let res = await provider.complete('gpt-5.6-luna', {
      system: 's',
      messages: [],
      maxOutputTokens: 5,
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([{ id: 'call_9', name: 'f', input: { x: 2 } }]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'cortado' }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    res = await provider.complete('gpt-5.6-luna', {
      system: 's',
      messages: [],
      maxOutputTokens: 5,
    });
    expect(res.stopReason).toBe('max_tokens');
  });

  it('erro HTTP vira LlmError com retryable só em 429/5xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'quota' } }, 429));
    await expect(
      provider.complete('gpt-5.6-luna', { system: 's', messages: [], maxOutputTokens: 5 }),
    ).rejects.toMatchObject({ name: 'LlmError', provider: 'openai', status: 429, retryable: true });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'bad' } }, 400));
    await expect(
      provider.complete('gpt-5.6-luna', { system: 's', messages: [], maxOutputTokens: 5 }),
    ).rejects.toMatchObject({ status: 400, retryable: false });

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(
      provider.complete('gpt-5.6-luna', { system: 's', messages: [], maxOutputTokens: 5 }),
    ).rejects.toMatchObject({ provider: 'openai', retryable: true });
  });
});
