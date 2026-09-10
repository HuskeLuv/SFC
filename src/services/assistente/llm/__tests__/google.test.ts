import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleProvider, toGoogleContents } from '../google';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('toGoogleContents', () => {
  it('usa role model para o assistente e agrupa functionResponse consecutivos', () => {
    expect(
      toGoogleContents([
        { role: 'user', content: 'oi' },
        {
          role: 'assistant',
          content: 'vou ver',
          toolCalls: [{ id: 'g1', name: 'f', input: { a: 1 } }],
        },
        { role: 'tool', toolCallId: 'g1', name: 'f', content: 'ok' },
        { role: 'tool', toolCallId: 'g2', name: 'g', content: 'x', isError: true },
        { role: 'assistant', content: '' },
      ]),
    ).toEqual([
      { role: 'user', parts: [{ text: 'oi' }] },
      {
        role: 'model',
        parts: [{ text: 'vou ver' }, { functionCall: { name: 'f', args: { a: 1 } } }],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'f', response: { result: 'ok' } } },
          { functionResponse: { name: 'g', response: { error: 'x' } } },
        ],
      },
    ]);
  });
});

describe('GoogleProvider.complete', () => {
  const provider = new GoogleProvider();
  const fetchMock = vi.fn<typeof fetch>();
  const originalKey = process.env.GOOGLE_API_KEY;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.GOOGLE_API_KEY = 'g-test';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = originalKey;
  });

  it('monta generateContent, desliga o raciocínio e lê uso (cache + pensamentos) e custo', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        responseId: 'r1',
        candidates: [
          {
            content: { parts: [{ text: 'pensando', thought: true }, { text: 'Olá' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 1100,
          cachedContentTokenCount: 1000,
          candidatesTokenCount: 50,
          thoughtsTokenCount: 10,
        },
      }),
    );
    const res = await provider.complete('gemini-3.8-flash', {
      system: 'sistema',
      messages: [{ role: 'user', content: 'oi' }],
      tools: [{ name: 'f', description: 'd', inputSchema: { type: 'object' } }],
      maxOutputTokens: 200,
      reasoning: 'none',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'g-test' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: 'sistema' }] },
      generationConfig: { maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
      tools: [
        { functionDeclarations: [{ name: 'f', description: 'd', parameters: { type: 'object' } }] },
      ],
    });
    expect(res.text).toBe('Olá');
    expect(res.stopReason).toBe('end');
    expect(res.usage).toEqual({
      inputTokens: 100,
      cachedInputTokens: 1000,
      cacheWriteTokens: 0,
      outputTokens: 60,
      reasoningTokens: 10,
    });
    // 100×0,75 + 1000×0,1875 + 60×3,75 = 487,5 µUSD
    expect(res.costUsd).toBeCloseTo(0.0004875, 9);
    expect(res.requestId).toBe('r1');
  });

  it('reasoning=low usa thinkingLevel; functionCall vira toolCall; SAFETY vira refusal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ functionCall: { name: 'f', args: { x: 1 } } }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    );
    let res = await provider.complete('gemini-3.8-flash', {
      system: 's',
      messages: [],
      maxOutputTokens: 5,
      reasoning: 'low',
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([{ id: 'gemini-call-1', name: 'f', input: { x: 1 } }]);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ candidates: [{ finishReason: 'SAFETY' }], usageMetadata: {} }),
    );
    res = await provider.complete('gemini-3.8-flash', {
      system: 's',
      messages: [],
      maxOutputTokens: 5,
    });
    expect(res.stopReason).toBe('refusal');
  });

  it('erro HTTP e falha de rede viram LlmError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: 'nope' } }, 503));
    await expect(
      provider.complete('gemini-3.8-flash', { system: 's', messages: [], maxOutputTokens: 5 }),
    ).rejects.toMatchObject({ name: 'LlmError', provider: 'google', status: 503, retryable: true });

    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      provider.complete('gemini-3.8-flash', { system: 's', messages: [], maxOutputTokens: 5 }),
    ).rejects.toMatchObject({ provider: 'google', retryable: true });
  });
});
